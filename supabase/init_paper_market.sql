-- Paper NBA market: one shared portfolio + positions (no Auth yet).
-- Run once in Supabase → SQL Editor → paste → Run.
--
-- Portfolios are NOT exposed to the browser: do not grant anon/authenticated on these
-- tables. Next.js uses SUPABASE_SERVICE_ROLE_KEY (server-only) in web/lib/portfolioStore.ts.
-- Later: per-user rows + auth.uid() policies when you add login.
-- If you already ran the old open-anon script, run supabase/lockdown_paper_portfolio.sql.

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

grant usage on schema public to anon, authenticated;

revoke all on public.portfolios from anon, authenticated;
revoke all on public.positions from anon, authenticated;

-- Server API only (service role bypasses RLS; anon has no privileges on these tables).
grant select, insert, update, delete on public.portfolios to service_role;
grant select, insert, update, delete on public.positions to service_role;

alter table public.portfolios enable row level security;
alter table public.positions enable row level security;

-- Remove legacy permissive policies if re-running after an old init.
drop policy if exists "paper_portfolios_anon" on public.portfolios;
drop policy if exists "paper_positions_anon" on public.positions;

-- One fixed portfolio so the app can use a constant id (matches web code when wired).
insert into public.portfolios (id, cash)
values ('00000000-0000-0000-0000-000000000001'::uuid, 100000)
on conflict (id) do nothing;
