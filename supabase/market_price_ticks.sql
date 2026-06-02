-- Intraday Market Price ticks for stock-style charts.
-- Run once in Supabase → SQL Editor AFTER market_price_layer.sql.
--
-- player_market_history stores one row per player per *day* (upserted). This
-- table *appends* every pipeline cycle (~30 min) so the web chart can show how
-- the tradable quote moved between games.

create table if not exists public.player_market_ticks (
  player_id bigint not null,
  recorded_at timestamptz not null default now(),
  market_price numeric(14, 4) not null default 0,
  fair_value numeric(14, 4) not null default 0,
  premium_pct numeric(10, 6) not null default 0,
  primary key (player_id, recorded_at)
);

create index if not exists idx_player_market_ticks_player_time
  on public.player_market_ticks (player_id, recorded_at desc);

alter table public.player_market_ticks enable row level security;

drop policy if exists "player_market_ticks_read_anon" on public.player_market_ticks;
create policy "player_market_ticks_read_anon" on public.player_market_ticks
  for select to anon using (true);

grant select on public.player_market_ticks to anon, authenticated;
grant select, insert, delete on public.player_market_ticks to service_role;
