-- Season snapshot for fast reads (no full-table scan). Run once in SQL Editor.
-- After this, re-run: python pipeline/sync_prices_to_supabase.py

alter table public.prices_snapshot_meta
  add column if not exists max_dataset_season text null;

alter table public.prices_snapshot_meta
  add column if not exists played_player_ids bigint[] null;
