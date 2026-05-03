-- Price + active roster data for hosted mode (Vercel + PRICES_SOURCE=supabase).
-- Run in Supabase SQL Editor after init_paper_market.sql.

-- Bumped by pipeline/sync_prices_to_supabase.py after each full reload (invalidates app cache).
create table if not exists public.prices_snapshot_meta (
  id int primary key default 1,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint prices_snapshot_meta_singleton check (id = 1)
);

insert into public.prices_snapshot_meta (id, revision)
values (1, 0)
on conflict (id) do nothing;

-- One row per game per player (same logical rows as data/player_game_prices.csv).
create table if not exists public.player_game_prices (
  player_id bigint not null,
  player_name text not null default '',
  team_abbr text not null default '',
  game_id text not null,
  game_date date not null,
  season text not null default '',
  minutes numeric not null default 0,
  game_score numeric not null default 0,
  price_after_game numeric not null default 0,
  prior_season_avg_game_score numeric null,
  primary key (player_id, game_id, game_date)
);

create index if not exists idx_player_game_prices_player_order
  on public.player_game_prices (player_id, game_date asc, game_id asc);

-- Same IDs as data/active_players.csv (sync script fills this).
create table if not exists public.active_players (
  player_id bigint primary key
);

alter table public.prices_snapshot_meta enable row level security;
alter table public.player_game_prices enable row level security;
alter table public.active_players enable row level security;

drop policy if exists "prices_meta_read_anon" on public.prices_snapshot_meta;
create policy "prices_meta_read_anon" on public.prices_snapshot_meta
  for select to anon using (true);

drop policy if exists "player_game_prices_read_anon" on public.player_game_prices;
create policy "player_game_prices_read_anon" on public.player_game_prices
  for select to anon using (true);

drop policy if exists "active_players_read_anon" on public.active_players;
create policy "active_players_read_anon" on public.active_players
  for select to anon using (true);

grant select on public.prices_snapshot_meta to anon, authenticated;
grant select on public.player_game_prices to anon, authenticated;
grant select on public.active_players to anon, authenticated;

-- Full replace of price tables (service_role only). Called before bulk insert from Python.
create or replace function public.truncate_prices_for_reload()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table public.player_game_prices;
  truncate table public.active_players;
end;
$$;

revoke all on function public.truncate_prices_for_reload() from public;
grant execute on function public.truncate_prices_for_reload() to service_role;

create or replace function public.bump_prices_revision()
returns void
language sql
security definer
set search_path = public
as $$
  update public.prices_snapshot_meta
  set revision = revision + 1, updated_at = now()
  where id = 1;
$$;

revoke all on function public.bump_prices_revision() from public;
grant execute on function public.bump_prices_revision() to service_role;
