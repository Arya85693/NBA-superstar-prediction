-- Paper NBA market: one shared portfolio + positions (no Auth yet).
-- Run once in Supabase → SQL Editor → paste → Run.
-- Later: replace open anon policies with auth.uid() when you add login.

-- Tables
create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  cash numeric(14, 2) not null default 100000,
  updated_at timestamptz not null default now()
);

create table if not exists public.positions (
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  player_id bigint not null,
  shares bigint not null check (shares >= 0),
  primary key (portfolio_id, player_id)
);

-- Let the API (anon key) read/write these tables
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.portfolios to anon, authenticated;
grant select, insert, update, delete on public.positions to anon, authenticated;

alter table public.portfolios enable row level security;
alter table public.positions enable row level security;

-- Demo policies: any client using your anon key can access these rows.
-- Tighten before a public launch (e.g. require auth.uid() = owner).
drop policy if exists "paper_portfolios_anon" on public.portfolios;
create policy "paper_portfolios_anon" on public.portfolios
  for all to anon using (true) with check (true);

drop policy if exists "paper_positions_anon" on public.positions;
create policy "paper_positions_anon" on public.positions
  for all to anon using (true) with check (true);

-- One fixed portfolio so the app can use a constant id (matches web code when wired).
insert into public.portfolios (id, cash)
values ('00000000-0000-0000-0000-000000000001'::uuid, 100000)
on conflict (id) do nothing;
