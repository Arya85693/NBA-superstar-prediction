-- Harden paper portfolio after the old open-anon setup (see init_paper_market.sql history).
-- Run in Supabase → SQL Editor AFTER deploying web code that uses SUPABASE_SERVICE_ROLE_KEY
-- for portfolio reads/writes (see web/lib/portfolioStore.ts).
--
-- Effect: browsers cannot read or mutate portfolios/positions with the anon key, even if
-- they call PostgREST directly. Only your Vercel server (service role) can.

revoke all on public.portfolios from anon, authenticated;
revoke all on public.positions from anon, authenticated;

-- PostgREST uses the JWT role; these grants must succeed (check the SQL Editor for errors).
grant usage on schema public to service_role;
grant select, insert, update, delete on public.portfolios to service_role;
grant select, insert, update, delete on public.positions to service_role;

drop policy if exists "paper_portfolios_anon" on public.portfolios;
drop policy if exists "paper_positions_anon" on public.positions;
