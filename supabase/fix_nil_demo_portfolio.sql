-- Align guest demo portfolio id with web/lib/portfolioStore.ts (`…000001` not `…000000`).
-- Run once in SQL Editor only if `user_id IS NULL` row still uses the nil UUID.
-- Drops any demo positions on the wrong id first so the portfolio PK update is valid.

begin;

delete from public.positions
where portfolio_id = '00000000-0000-0000-0000-000000000000'::uuid;

update public.portfolios
set id = '00000000-0000-0000-0000-000000000001'::uuid
where id = '00000000-0000-0000-0000-000000000000'::uuid
  and user_id is null;

commit;
