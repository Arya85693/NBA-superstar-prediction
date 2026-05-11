-- Per-user paper portfolios (run once in Supabase → SQL Editor).
-- Assumes init_paper_market.sql already ran (public.portfolios / public.positions exist).

-- ---------------------------------------------------------------------------
-- 1) Attach each portfolio row to at most one auth user (nullable = demo row)
-- ---------------------------------------------------------------------------
alter table public.portfolios
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

comment on column public.portfolios.user_id is
  'Auth user who owns this wallet; NULL = legacy shared demo portfolio (seed UUID).';

-- One portfolio per user; PostgreSQL allows multiple NULLs, so the demo row stays valid.
create unique index if not exists portfolios_one_user_id
  on public.portfolios (user_id)
  where user_id is not null;

create index if not exists portfolios_user_id_lookup
  on public.portfolios (user_id);

-- ---------------------------------------------------------------------------
-- 2) Auto-create a wallet row when a new Supabase Auth user is created
-- ---------------------------------------------------------------------------
-- Starting cash matches web/lib/portfolioStore.ts STARTING_CASH / init default.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.portfolios (cash, user_id)
  values (100000, new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Notes:
-- - Existing seed row: id = '00000000-0000-0000-0000-000000000001', user_id NULL.
-- - Service role bypasses RLS; Next.js can keep using it until routes use user_id.
-- - If Auth users existed before this migration, backfill:
--     insert into public.portfolios (cash, user_id)
--     select 100000, id from auth.users u
--     where not exists (select 1 from public.portfolios p where p.user_id = u.id);
