-- Precomputed tickers for active roster (filled by pipeline/sync_prices_to_supabase.py).
-- Run once in SQL Editor after prices_tables.sql (replaces truncate RPC to include this table).

create table if not exists public.player_board (
  player_id bigint primary key,
  ticker text not null,
  player_name text not null default ''
);

alter table public.player_board enable row level security;

drop policy if exists "player_board_read_anon" on public.player_board;
create policy "player_board_read_anon" on public.player_board
  for select to anon using (true);

grant select on public.player_board to anon, authenticated;

-- Replace truncate helper so reload clears board too.
create or replace function public.truncate_prices_for_reload()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table public.player_board;
  truncate table public.player_game_prices;
  truncate table public.active_players;
end;
$$;

revoke all on function public.truncate_prices_for_reload() from public;
grant execute on function public.truncate_prices_for_reload() to service_role;
