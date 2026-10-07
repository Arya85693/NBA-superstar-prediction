-- Coherent publication of Fair Value + Market Price (additive, safe to re-run).
-- Run once in the Supabase SQL Editor AFTER prices_tables.sql and market_price_layer.sql.
--
-- CI syncs Fair Value with `sync_prices_to_supabase.py --defer-revision-bump`, then
-- `update_market_state.py` calls publish_pricing_revision() once at the end, so the
-- web cache sees the new Fair Value and the new Market Price under one revision pair.
-- Until this file is applied, the pipeline falls back to bump_prices_revision() +
-- bump_market_revision() (the previous behaviour). Nothing existing is altered or dropped.

-- 1) Which pricing methodology produced the published numbers (nullable; informational).
alter table public.prices_snapshot_meta
  add column if not exists pricing_model_version text null;

-- 2) Bump both cache keys and record the model version in one statement.
create or replace function public.publish_pricing_revision(p_model_version text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.prices_snapshot_meta
  set revision = revision + 1,
      updated_at = now(),
      market_revision = market_revision + 1,
      market_updated_at = now(),
      pricing_model_version = p_model_version
  where id = 1;
$$;

revoke all on function public.publish_pricing_revision(text) from public;
revoke all on function public.publish_pricing_revision(text) from anon, authenticated;
grant execute on function public.publish_pricing_revision(text) to service_role;
