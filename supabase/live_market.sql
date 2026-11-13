-- ===========================================================================
-- Live market: 5-minute Market Price ticks + in-game provisional Fair Value.
-- Additive and safe to re-run. Run once in Supabase -> SQL Editor AFTER
-- market_price_layer.sql, pricing_revision.sql and espn_player_map.sql.
--
-- Adds:
--   * public.player_fv_state      per-player Fair Value engine state, exported by
--                                 the Python pipeline every cycle, so one more game
--                                 can be priced exactly like price_engine.py.
--   * public.player_live_games    one row per player per game day while a game is
--                                 live (and until the final box score is ingested):
--                                 partial line, projection, provisional Fair Value.
--   * market lease on prices_snapshot_meta: the Python market step and the tick
--     never write player_market_state at the same time.
--   * public.apply_market_tick()  atomic tick write (lease + optimistic check,
--                                 ticks, daily history, market_revision bump).
--
-- Scheduling (pg_cron + pg_net -> Edge Function `market-tick`) is section 6 at the
-- bottom; it needs two Vault secrets and is commented out until you set them.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Fair Value engine state (written by pipeline/update_market_state.py)
-- ---------------------------------------------------------------------------
create table if not exists public.player_fv_state (
  player_id bigint primary key,
  season text not null default '',
  last_game_date date null,
  fair_value numeric(14, 6) not null default 0,
  games_in_season int not null default 0,
  season_eff_sum numeric(14, 6) not null default 0,
  hist_mean numeric(14, 6) not null default 0,
  hist_std numeric(14, 6) not null default 8,
  hist_n int not null default 0,
  prior_eff numeric(14, 6) null,
  prior_conf numeric(10, 6) not null default 0,
  mean_minutes numeric(10, 4) not null default 24,
  gs_per_minute numeric(10, 6) not null default 0.3,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) Live / just-finished games (written by the market-tick Edge Function)
-- ---------------------------------------------------------------------------
create table if not exists public.player_live_games (
  player_id bigint not null,
  game_date date not null,                       -- America/New_York game day
  espn_event_id text not null,
  game_state text not null,                      -- 'in' | 'post'
  period int not null default 0,
  clock text not null default '',
  progress numeric(6, 4) not null default 0,     -- share of the game played
  minutes numeric(6, 2) not null default 0,
  game_score numeric(8, 3) not null default 0,   -- Hollinger, partial line
  projected_minutes numeric(6, 2) not null default 0,
  projected_game_score numeric(8, 3) not null default 0,
  base_fair_value numeric(14, 4) not null default 0,   -- official FV before tonight
  live_fair_value numeric(14, 4) not null default 0,   -- provisional FV priced against
  stat_line jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, game_date)
);

create index if not exists idx_player_live_games_date
  on public.player_live_games (game_date desc);

-- Games the tick has processed; a game marked 'post' is never re-downloaded.
create table if not exists public.live_game_events (
  espn_event_id text primary key,
  game_date date not null,
  game_state text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3) RLS: public may read live rows (UI badges); only service_role writes
-- ---------------------------------------------------------------------------
alter table public.player_fv_state enable row level security;
alter table public.player_live_games enable row level security;
alter table public.live_game_events enable row level security;
grant select, insert, update, delete on public.live_game_events to service_role;

drop policy if exists "player_live_games_read_anon" on public.player_live_games;
create policy "player_live_games_read_anon" on public.player_live_games
  for select to anon, authenticated using (true);

grant select on public.player_live_games to anon, authenticated;
grant select, insert, update, delete on public.player_live_games to service_role;
grant select, insert, update, delete on public.player_fv_state to service_role;

-- ---------------------------------------------------------------------------
-- 4) Market lease: one writer of player_market_state at a time
-- ---------------------------------------------------------------------------
alter table public.prices_snapshot_meta
  add column if not exists market_lease_holder text null;

alter table public.prices_snapshot_meta
  add column if not exists market_lease_until timestamptz null;

create or replace function public.acquire_market_lease(p_holder text, p_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.prices_snapshot_meta
  set market_lease_holder = p_holder,
      market_lease_until = now() + make_interval(secs => greatest(p_seconds, 1))
  where id = 1
    and (market_lease_until is null
         or market_lease_until < now()
         or market_lease_holder = p_holder)
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.release_market_lease(p_holder text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.prices_snapshot_meta
  set market_lease_holder = null,
      market_lease_until = null
  where id = 1 and market_lease_holder = p_holder;
$$;

-- ---------------------------------------------------------------------------
-- 5) Atomic tick write
--
-- p_rows: [{player_id, expected_updated_at, market_price, fair_value,
--           premium_pct, change, change_pct, move_capped, explanation_patch}]
-- A row is applied only if player_market_state.updated_at still equals
-- expected_updated_at (nobody wrote it since the tick read it). Returns the
-- number of rows applied, or -1 if the Python market step holds the lease.
-- ---------------------------------------------------------------------------
create or replace function public.apply_market_tick(
  p_rows jsonb,
  p_recorded_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
  v_count integer := 0;
  v_day date := (p_recorded_at at time zone 'utc')::date;
  r jsonb;
begin
  -- Serialise with acquire_market_lease (same row lock).
  select market_lease_until into v_until
  from public.prices_snapshot_meta where id = 1 for update;
  if v_until is not null and v_until > now() then
    return -1;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    update public.player_market_state s
    set market_price = (r->>'market_price')::numeric,
        fair_value   = (r->>'fair_value')::numeric,
        premium_pct  = (r->>'premium_pct')::numeric,
        change       = (r->>'change')::numeric,
        change_pct   = nullif(r->>'change_pct', '')::numeric,
        move_capped  = coalesce((r->>'move_capped')::boolean, false),
        explanation  = s.explanation || coalesce(r->'explanation_patch', '{}'::jsonb),
        updated_at   = p_recorded_at
    where s.player_id = (r->>'player_id')::bigint
      and s.updated_at = (r->>'expected_updated_at')::timestamptz;

    if found then
      v_count := v_count + 1;

      insert into public.player_market_ticks
        (player_id, recorded_at, market_price, fair_value, premium_pct)
      values (
        (r->>'player_id')::bigint, p_recorded_at,
        (r->>'market_price')::numeric, (r->>'fair_value')::numeric,
        (r->>'premium_pct')::numeric
      )
      on conflict (player_id, recorded_at) do nothing;

      insert into public.player_market_history
        (player_id, as_of_date, market_price, fair_value, premium_pct)
      values (
        (r->>'player_id')::bigint, v_day,
        (r->>'market_price')::numeric, (r->>'fair_value')::numeric,
        (r->>'premium_pct')::numeric
      )
      on conflict (player_id, as_of_date) do update
        set market_price = excluded.market_price,
            fair_value   = excluded.fair_value,
            premium_pct  = excluded.premium_pct;
    end if;
  end loop;

  if v_count > 0 then
    update public.prices_snapshot_meta
    set market_revision = market_revision + 1,
        market_updated_at = now()
    where id = 1;
  end if;

  return v_count;
end;
$$;

revoke all on function public.acquire_market_lease(text, int) from public, anon, authenticated;
revoke all on function public.release_market_lease(text) from public, anon, authenticated;
revoke all on function public.apply_market_tick(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.acquire_market_lease(text, int) to service_role;
grant execute on function public.release_market_lease(text) to service_role;
grant execute on function public.apply_market_tick(jsonb, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 6) Schedule: call the Edge Function every 5 minutes (pg_cron + pg_net)
--
-- After deploying the function (see docs/LIVE_MARKET.md), store two secrets in
-- Vault, then run the block below once:
--
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/market-tick', 'market_tick_url');
--   select vault.create_secret('<same value as the TICK_SECRET function secret>',
--     'market_tick_secret');
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'market-tick-5min',
--   '*/5 * * * *',
--   $cron$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets
--             where name = 'market_tick_url'),
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-tick-secret', (select decrypted_secret from vault.decrypted_secrets
--                         where name = 'market_tick_secret')
--     ),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 120000
--   );
--   $cron$
-- );
--
-- To stop it:   select cron.unschedule('market-tick-5min');
-- ---------------------------------------------------------------------------
