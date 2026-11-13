# Live market: 5-minute ticks and in-game prices

Market Price used to move only when the 30-minute pipeline ran. It now moves on two clocks.

| What | Where | How often | Does |
|---|---|---|---|
| Full pipeline | GitHub Actions (`update-market-prices.yml`), started by Supabase `pg_cron` | every 15 min | ESPN final box scores → Fair Value rebuild → news, injuries, demand → Market Price step → exports `player_fv_state` |
| Market tick | Supabase Edge Function `market-tick` via `pg_cron` | every 5 min | ESPN live box scores → provisional in-game Fair Value → steps every active player's Market Price toward its target |
| Browser | `LiveMarketRefresher` | every 30 s | polls `/api/market/revision`; re-renders when `market_revision` changes |

## How the pieces agree

- **One model.**
  - `pipeline/price_engine.py` stays the source of truth for Fair Value.
  - `pipeline/fv_live_state.py` exports the per-player state that `compute_prices` carries: price, games, `g*` history and the prior-season anchor.
  - With that state, one more game can be priced exactly as the batch model would. `tests/test_fv_live_state.py` pins `one_step` to `compute_prices`.
  - `supabase/functions/_shared/liveFairValue.ts` is a line-for-line port of that step. `web/tests/liveMarket.test.mjs` checks it against the Python golden values.
- **Live projection.**
  - A partial line is projected to a full game at the player's season rate: game score per minute over `mean_minutes × (1 − progress)` more minutes.
  - That projected line is priced with the one-game step.
  - The resulting move is scaled by game progress. A first-quarter heater moves price a little; the final line moves it exactly as the batch model will.
  - A player on 0 minutes is never priced.
- **Settlement.**
  - A live row counts until Fair Value contains a game on or after its date, which happens on the next 15-minute run after the final buzzer.
  - Until then, both the tick and the Python step price that player against the live Fair Value. The Python step does this through `apply_live_fair_values`, so neither one pulls price back to the pre-game value.
- **Same guard rails.**
  - The tick uses the market engine's reversion, movement caps, ±20% band and clamp.
  - Everything is scaled by elapsed time. Twelve 5-minute ticks move price exactly as far as two 30-minute cycles, so running more often makes prices smoother, not more volatile.
  - During a live game the faster game-night limits apply.
  - The tick doesn't recompute news, injuries or demand. It reuses the availability factor and lever adjustments the Python step stored in `explanation`.
- **One writer at a time.**
  - The Python step holds a lease (`acquire_market_lease`) from reading the previous state until publishing.
  - `apply_market_tick()` refuses to write while the lease is held. It also only updates rows whose `updated_at` hasn't changed since the tick read them.

## The 15-minute pipeline trigger

GitHub's `schedule:` trigger is best-effort, and in practice it fired only every 7–8 hours. So
Supabase starts the workflow instead: `supabase/pipeline_dispatch.sql` schedules a `pg_cron` job at
:02/:17/:32/:47 that calls GitHub's `workflow_dispatch` API with a fine-grained token stored in
Vault (`github_dispatch_token`; Actions read/write on this repo only). The workflow keeps an hourly
`schedule:` as a backup. A dispatch that answers **204** worked; **401/403** means the token expired
or lacks the Actions permission (rotate it with `vault.update_secret`, see the SQL file).

Each run syncs prices **incrementally**: the ESPN fetch writes `data/sync_window.json` and
`sync_prices_to_supabase.py` upserts only the last 7+ days, then deletes rows that were replaced.
That's about 1–2k rows instead of ~210k, and the site never sees an empty table. Repairs,
cold starts and row-count mismatches fall back to the full truncate-and-reload; force one with
`python pipeline/sync_prices_to_supabase.py --full`.

## One-time setup

Do these in order. Nothing changes for users until step 4.

### 1. Database (Supabase → SQL Editor)

Run these two files once each. Both are additive and safe to re-run:

1. `supabase/espn_player_map.sql`: maps ESPN athlete ids to your existing player ids.
2. `supabase/live_market.sql`: runs sections 1–5. Leave section 6, the schedule, commented out for now.

### 2. Fill the id map and Fair Value state

In GitHub, go to Actions → **Update Market Prices** → **Run workflow**.

This first run:
- restores the existing raw logs cache,
- fetches ESPN finals,
- writes `espn_player_map`, `player_fv_state` and prices.

Check the log for the id-mapping summary (matched, new and ambiguous players).

### 3. Deploy the Edge Function

Run these from the repo root. `<ref>` is your project ref, the subdomain of your Supabase URL.

```bash
npx supabase login
npx supabase functions deploy market-tick --project-ref <ref> --no-verify-jwt
npx supabase secrets set TICK_SECRET=<long random string> --project-ref <ref>
```

- `--no-verify-jwt` is intentional. The function checks the `x-tick-secret` header instead, so only your cron job can trigger it.
- If the CLI asks for a project config, `npx supabase init` creates `supabase/config.toml`. It doesn't touch the SQL files.

Then try it once by hand:

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/market-tick" -H "x-tick-secret: <same string>"
```

The function returns a JSON report like `{"live": {...}, "tick": {"planned": N, "applied": N}}`:
- A **`live_error`** containing `403` means ESPN is blocking Supabase's servers. The 5-minute drift still works without it.
- A **`tick_error`** means something is wrong in the database. Check that step 1 ran.

### 4. Schedule it every 5 minutes

In the SQL Editor:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/market-tick', 'market_tick_url');
select vault.create_secret('<same TICK_SECRET>', 'market_tick_secret');
```

Then run the commented block in section 6 of `supabase/live_market.sql`. That block enables `pg_cron` and `pg_net` and runs `cron.schedule('market-tick-5min', ...)`.

### 5. Watch it

```sql
-- cron runs
select status, return_message, start_time from cron.job_run_details
order by start_time desc limit 10;
-- function responses (JSON report in content)
select status_code, content::text, created from net._http_response
order by created desc limit 10;
-- live players right now
select player_id, stat_line->>'name' as name, clock, minutes, game_score,
       base_fair_value, live_fair_value
from player_live_games where game_date = (now() at time zone 'America/New_York')::date
order by abs(live_fair_value - base_fair_value) desc limit 20;
```

To pause the tick: `select cron.unschedule('market-tick-5min');`. To resume, re-run the schedule block. Prices simply fall back to moving every 15 minutes.

## BALLDONTLIE (removed)

The pipeline uses ESPN only. BALLDONTLIE was removed after the first ESPN run showed its stored box
scores were partial: the old incremental fetch saved games still in progress and never replaced them
(on 2026-10-28, 98 of 230 player lines were short by 3+ minutes).

The repair is automatic: whenever a run can only restore the BALLDONTLIE-era `bdl-raw-v1-` cache
(the first run on `main` after merging), it re-downloads every final since 2026-04-12 and replaces
those rows. To repair any other range by hand: **Actions → Update Market Prices → Run workflow →
`espn_refetch_from`**, or locally `python pipeline/run_pipeline.py --fetch-espn --active --espn-refetch-from YYYY-MM-DD`.

Remove `BALLDONTLIE_API_KEY` from GitHub secrets and Vercel env vars, then cancel the subscription.


## Limits and risks

- **ESPN's API is unofficial.** It has no SLA and can change or block without notice.
  - It already rejects requests without a browser `User-Agent` (403); both fetchers send one.
  - The parsers look stats up by key name and fail loudly if keys change, instead of misreading columns.
- **Requests from GitHub's and Supabase's servers are untested.** ESPN hasn't been tried from those addresses; the deploy check in step 3 shows it immediately.
- **Edge Function limits.** Supabase caps CPU time per call, around 2 seconds. A busy night means about 15 box scores per tick, parsed in well under that, but watch for `WORKER_LIMIT` in `net._http_response`.
- **GitHub Actions timing.** Scheduled runs can start late. Live prices don't depend on GitHub; only settling Fair Value after a game does.
