-- ===========================================================================
-- Market Price layer (Layer 2). Run once in Supabase -> SQL Editor AFTER
-- prices_tables.sql, player_board.sql and prices_meta_snapshot.sql.
--
-- Adds:
--   * public.player_market_state    one row per player: current Market Price,
--                                    Fair Value, every lever score/adjustment
--                                    and a JSON explanation. UPSERTED each cycle
--                                    (NOT truncated) so Market Price has memory.
--   * public.player_market_history   one row per player per day: market price +
--                                    fair value time series (dormant chart feed).
--   * prices_snapshot_meta.market_revision / market_updated_at  cache-bust key
--     the web app uses to know Market Price changed (even with no new games).
--
-- The Fair Value tables (player_game_prices, etc.) are unchanged: price layer
-- is purely additive and backward compatible.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Current Market Price state (one row per player)
-- ---------------------------------------------------------------------------
create table if not exists public.player_market_state (
  player_id bigint primary key,
  player_name text not null default '',
  team_abbr text not null default '',

  fair_value numeric(14, 4) not null default 0,
  market_price numeric(14, 4) not null default 0,
  prev_market_price numeric(14, 4) not null default 0,

  premium_pct numeric(10, 6) not null default 0,    -- (market - fair) / fair
  change numeric(14, 4) not null default 0,         -- market - prev (last cycle)
  change_pct numeric(10, 6) null,                   -- vs prev market price

  -- Levers (each score in [-1, 1]; adjustment is signed fraction of fair value)
  projection_score numeric(10, 6) not null default 0,
  projection_adjustment numeric(10, 6) not null default 0,
  sentiment_score numeric(10, 6) not null default 0,
  sentiment_adjustment numeric(10, 6) not null default 0,
  team_context_score numeric(10, 6) not null default 0,
  team_context_adjustment numeric(10, 6) not null default 0,
  demand_score numeric(10, 6) not null default 0,
  demand_adjustment numeric(10, 6) not null default 0,

  -- Demand telemetry (defaults to 0 until real trades exist)
  net_demand numeric(14, 4) not null default 0,
  recent_buy_volume numeric(14, 4) not null default 0,
  recent_sell_volume numeric(14, 4) not null default 0,
  demand_weight numeric(10, 6) not null default 0,

  move_capped boolean not null default false,
  premium_capped boolean not null default false,

  explanation jsonb not null default '{}'::jsonb,   -- full attributable breakdown
  as_of_date date not null default current_date,
  updated_at timestamptz not null default now()
);

create index if not exists idx_player_market_state_market_price
  on public.player_market_state (market_price desc);

-- ---------------------------------------------------------------------------
-- 2) Daily Market Price history (time series for charts / analytics)
-- ---------------------------------------------------------------------------
create table if not exists public.player_market_history (
  player_id bigint not null,
  as_of_date date not null,
  market_price numeric(14, 4) not null default 0,
  fair_value numeric(14, 4) not null default 0,
  premium_pct numeric(10, 6) not null default 0,
  created_at timestamptz not null default now(),
  primary key (player_id, as_of_date)
);

create index if not exists idx_player_market_history_player_date
  on public.player_market_history (player_id, as_of_date asc);

-- ---------------------------------------------------------------------------
-- 3) Market revision meta (cache-bust key, distinct from prices revision)
-- ---------------------------------------------------------------------------
alter table public.prices_snapshot_meta
  add column if not exists market_revision bigint not null default 0;

alter table public.prices_snapshot_meta
  add column if not exists market_updated_at timestamptz null;

-- ---------------------------------------------------------------------------
-- 4) RLS — public can READ market data; only service_role writes it
-- ---------------------------------------------------------------------------
alter table public.player_market_state enable row level security;
alter table public.player_market_history enable row level security;

drop policy if exists "player_market_state_read_anon" on public.player_market_state;
create policy "player_market_state_read_anon" on public.player_market_state
  for select to anon using (true);

drop policy if exists "player_market_history_read_anon" on public.player_market_history;
create policy "player_market_history_read_anon" on public.player_market_history
  for select to anon using (true);

grant select on public.player_market_state to anon, authenticated;
grant select on public.player_market_history to anon, authenticated;

grant select, insert, update, delete on public.player_market_state to service_role;
grant select, insert, update, delete on public.player_market_history to service_role;

-- ---------------------------------------------------------------------------
-- 5) Bump market revision (service_role only) — called after each update cycle
-- ---------------------------------------------------------------------------
create or replace function public.bump_market_revision()
returns void
language sql
security definer
set search_path = public
as $$
  update public.prices_snapshot_meta
  set market_revision = market_revision + 1, market_updated_at = now()
  where id = 1;
$$;

revoke all on function public.bump_market_revision() from public;
grant execute on function public.bump_market_revision() to service_role;
