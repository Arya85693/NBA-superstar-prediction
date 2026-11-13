-- ===========================================================================
-- ESPN athlete id -> market player id map. Run once in Supabase -> SQL Editor
-- (safe to re-run: additive, `if not exists`, no data changes).
--
-- The pipeline now reads box scores from ESPN (pipeline/espn_fetch.py), but
-- every market table (player_game_prices, player_market_state, positions,
-- trades, watchlists) is keyed by the player ids we already use: NBA.com ids
-- for most players, BALLDONTLIE ids for some newer ones. Those ids must never
-- change, so pipeline/espn_player_map.py resolves each ESPN athlete id onto an
-- existing player id once (by name, confirmed by birth date when known) and
-- stores it here. Players with no existing id get 9000000000 + espn_id.
--
--   espn_id      ESPN athlete id (text, as ESPN sends it)
--   player_id    market player id; unique, so one player never has two ESPN ids
--   player_name  ESPN display name at the time of mapping (informational)
--   matched_by   how the row was resolved: name, name+dob, lastname+dob,
--                name-prefix, new, manual
--
-- Written by the pipeline with the service_role key only. No anon access.
-- ===========================================================================

create table if not exists public.espn_player_map (
  espn_id text primary key,
  player_id bigint not null unique,
  player_name text not null default '',
  matched_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.espn_player_map enable row level security;

-- No policies for anon/authenticated: RLS blocks them. service_role bypasses RLS.
revoke all on public.espn_player_map from anon, authenticated;
grant select, insert, update on public.espn_player_map to service_role;
