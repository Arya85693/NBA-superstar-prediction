# NBA Superstar Prediction — paper market

Simulated player “stocks” driven by game logs, Hollinger game score, and a pricing engine. **Fake-money trading UI** will live under `web/`.

## Layout

```text
├── README.md
├── requirements.txt          # Python deps for the pipeline
├── data/                     # CSV inputs & outputs (raw → cleaned → prices)
├── pipeline/                 # Data collection, cleaning, game score, prices, runner
└── web/                      # Next.js paper-trading UI + API routes
```

## Pipeline (from repo root)

```bash
pip install -r requirements.txt
python pipeline/run_pipeline.py              # build from existing raw CSVs
python pipeline/run_pipeline.py --fetch-espn --active   # default refresh (ESPN box scores + ESPN rosters)
python pipeline/run_pipeline.py --fetch-balldontlie --active   # deprecated fallback (BALLDONTLIE, API key)
python pipeline/run_pipeline.py --fetch      # deprecated: stats.nba.com via nba_api (local fallback only)
python pipeline/run_pipeline.py --fetch --bootstrap-history
python pipeline/run_pipeline.py --active     # refresh active_players.csv (use with a fetch flag)
```

Individual steps: `pipeline/espn_fetch.py` (or the fallbacks `pipeline/balldontlie_fetch.py` / `pipeline/data_collection.py`) → `pipeline/data_cleaning.py` → `pipeline/game_score.py` → `pipeline/price_engine.py`.

### Recommended local workflow (aligned with production)

1. Add keys to `web/.env.local` (see **Environment variables** below).
2. Refresh prices and sync to Supabase:

```bash
python pipeline/update_market_local.py
```

That runs `--fetch-espn --active` by default, then `sync_prices_to_supabase.py` — same fetch flags as GitHub Actions.

To rebuild from CSVs only (no network fetch):

```bash
python pipeline/run_pipeline.py
python pipeline/sync_prices_to_supabase.py
```

### Data sources

- **Primary (production, CI, local default):** ESPN's public site API via `pipeline/espn_fetch.py` — `run_pipeline.py --fetch-espn --active`. No API key.
  - Box scores come from `scoreboard?dates=YYYYMMDD` + `summary?event=<id>`; the roster (`--active`) from `teams` + `teams/<id>/roster`.
  - Only **final** games (`state == "post"` and `completed`) are written; in-progress games are skipped. Regular season, play-in (labelled "Regular Season", as BALLDONTLIE did) and playoffs are kept; preseason and All-Star games are dropped.
  - Incremental: each run re-reads from the latest cached `GAME_DATE` − 1 day through today (US/Eastern). On those dates a final ESPN row **replaces** the cached row for the same player + date (heals partial rows, picks up stat corrections). A cold start reads every day of the season (~1,600 requests per season, ~10 min at the default 0.3 s pause).
  - ESPN reports whole minutes (BALLDONTLIE reported fractional minutes), the same as the older nba_api history.
  - Stat columns are looked up by ESPN's stat *key*, never by position; if ESPN changes the payload the fetch stops with `EspnShapeError` instead of writing bad rows.
- **Deprecated fallback:** [BALLDONTLIE](https://nba.balldontlie.io/) via `pipeline/balldontlie_fetch.py` — `--fetch-balldontlie --active` or `PRICES_FETCH_SOURCE=balldontlie` (requires `BALLDONTLIE_API_KEY`, **All-Star+** tier).
- **Deprecated local fallback:** `stats.nba.com` via [`nba_api`](https://github.com/swar/nba_api) (`--fetch` or `PRICES_FETCH_SOURCE=nba_api` for `update_market_local.py`).

**Player ids never change.** Every market table (`player_game_prices`, `player_market_state`, `positions`, `trades`, watchlists) is keyed by the existing player ids — NBA.com ids for most players, BALLDONTLIE ids for some newer ones. ESPN uses its own athlete ids, so `pipeline/espn_player_map.py` maps each ESPN id onto an existing id once and stores it in the Supabase table **`public.espn_player_map`** (`espn_id` → `player_id`, unique both ways). Run **`supabase/espn_player_map.sql`** once in the Supabase SQL Editor before the first ESPN run. Without Supabase credentials the map is kept in `data/espn_player_map.csv`.

- Matching: same normalised name (accents, punctuation and Jr/Sr/II/III ignored), confirmed by birth date (ESPN roster vs `data/player_profiles.csv`, ±1 day) when both are known; then name variants ("AJ"/"A.J.", word order), same last name + birth date, and same team + last name. When the exact-name id has not played recently but a variant has (e.g. BALLDONTLIE kept its own id for "Nicolas Claxton"), the id still playing wins — that is the one the market trades. Every non-exact choice is printed for review.
- Genuinely new players get `player_id = 9000000000 + ESPN id`. One player id is never given to two ESPN ids.
- To fix a mapping by hand, edit its row in `espn_player_map` (set `matched_by = 'manual'`) before the next run.
- The first ESPN run must see the BALLDONTLIE-era raw-log cache (CI restores it via the `bdl-raw-v1-` restore key), so this season's rookies keep their BALLDONTLIE ids. With an empty map and no recent games in the cache the fetch refuses to start; set `ESPN_MAP_ALLOW_COLD_START=1` only if you really want to map from scratch.

### Environment variables (pipeline / local updater)

| Variable | Required for | Notes |
|----------|----------------|-------|
| `ESPN_REQUEST_PAUSE_SECONDS` | ESPN fetch (default) | Pause before each ESPN request (default `0.3`). Requests retry with backoff on network errors, 429 and 5xx. |
| `ESPN_PLAYER_MAP_SUPABASE` | ESPN fetch | Set `0` to keep the ESPN id map in `data/espn_player_map.csv` even when Supabase keys are set. |
| `ESPN_MAP_ALLOW_COLD_START` | ESPN fetch | Set `1` to build the ESPN id map from scratch against a stale cache (see above). |
| `PIPELINE_FULL_FETCH` | ESPN / BDL fetch | `1` re-downloads the whole window instead of the incremental refresh (same as `--full-fetch`). |
| `BALLDONTLIE_API_KEY` | BDL fallback only | All-Star+ for `GET /nba/v1/stats`. Not needed for the default ESPN fetch. |
| `BALLDONTLIE_REQUEST_PAUSE_SECONDS` | BDL fetch | Pause between HTTP calls (default `1.05`). **Increase** (e.g. `2`–`3`) if you see `429 Too Many Requests` on long local runs. |
| `BALLDONTLIE_PER_PAGE` | BDL fetch | Max `100` (default `100`). |
| `PRICES_FETCH_SOURCE` | `update_market_local.py` only | Default `espn`. `balldontlie` for the deprecated BDL fallback, `nba_api` for the `--fetch` path. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Sync + hosted app + ESPN id map | Sync script and `espn_player_map`; service role is server-only. |
| `NBA_API_*` | `nba_api` fallback only | Timeouts/retries when using `--fetch` (see `pipeline/data_collection.py`). |

### BALLDONTLIE rate limiting (fallback only)

Full prior+current-season fetches paginate thousands of requests. If a local run fails with **`HTTP 429`**, wait and retry, or raise `BALLDONTLIE_REQUEST_PAUSE_SECONDS` in `.env.local`. CI uses the same API with repository secrets; very long interactive runs are more likely to hit limits than the scheduled workflow.

Game-log collection includes both **Regular Season** and **Playoffs**. Prices update only when a
player logs another game; between games, the last model price stays flat.

**Long-term updater defaults:** automated fetches use only the **prior season + current season**
because the prior season provides the benchmark/anchor and the current season drives the live
market. Use `--bootstrap-history` only when you intentionally want a deeper rebuild.

## Data flow

1. **Raw** (`data/raw_game_logs.csv`) — per-game box scores (ESPN by default; BALLDONTLIE or nba_api as deprecated fallbacks)  
2. **Cleaned** — standardized columns  
3. **Game score** — `data/cleaned_game_logs_with_game_score.csv`  
4. **Prices** — `data/player_game_prices.csv`

Point your future API or `web/` app at `data/` or at a database you load from these files.

## Website (paper trading)

From repo root:

```bash
cd web
npm install
npm run dev
```

**Windows / long folder paths:** If `npm run dev` crashes with Turbopack “path length exceeds max length of filesystem”, the default script already uses **Webpack** (`next dev --webpack`). Delete `web/.next` once, then run `npm run dev` again. For the fewest issues, clone the repo under a **short path** (e.g. `C:\dev\nba-market`). Optional: enable Windows long paths or use `npm run dev:turbo` only on shorter paths.

Open [http://localhost:3000](http://localhost:3000).

**Prices (two modes):**

- **Local / default:** reads `data/player_game_prices.csv` and `data/active_players.csv` via `../data` from the `web/` folder (see `web/lib/paths.ts`).
- **Hosted (Vercel, recommended):** load prices from Supabase instead of the repo disk. Run `supabase/prices_tables.sql` once in the SQL Editor, then **`supabase/prices_meta_snapshot.sql`** (adds season snapshot columns), then whenever CSVs change run `python pipeline/sync_prices_to_supabase.py` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set (service key is **secret** — use CI secrets or your shell only). On Vercel add **`PRICES_SOURCE=supabase`** (server env, not `NEXT_PUBLIC_*`). The sync bumps `prices_snapshot_meta.revision` so the app drops its in-memory cache on the next request. (CI runs the sync with `--defer-revision-bump` and lets `update_market_state.py` publish the Fair Value and Market Price revisions together; apply `supabase/pricing_revision.sql` once to do that in a single statement.)
  - Optional: set **`PRICES_SUPABASE_PAGE_SIZE`** (e.g. `5000`) in `web/.env.local` / Vercel to cut round-trips. In Supabase **Project Settings → API**, raise **Max rows** to at least that value, or requests will still cap at the default (often 1000).

**Automatic updates:** `.github/workflows/update-market-prices.yml` fetches via **ESPN**
(`--fetch-espn --active`), rebuilds prices, and syncs to Supabase every 15 minutes (UTC :07, :22, :37, :52).
Add repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (and run `supabase/espn_player_map.sql`) before enabling that workflow; `BALLDONTLIE_API_KEY` is only needed for the fallback.
The raw-log cache is saved under `raw-logs-v2-<run id>` each run and restored from the newest `raw-logs-v2-` entry (falling back to the BALLDONTLIE-era `bdl-raw-v1-` cache).

**Local scheduler (alternative to CI):** schedule `python pipeline/update_market_local.py` (defaults to ESPN, same as CI). On Windows, use Task Scheduler. For the legacy NBA API path only, set `PRICES_FETCH_SOURCE=nba_api` in `.env.local`.

**Portfolio:** stored in **Supabase** (`portfolios` / `positions`; see `supabase/init_paper_market.sql`). Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and **`SUPABASE_SERVICE_ROLE_KEY`** (server-only on Vercel — never `NEXT_PUBLIC_*`) in `web/.env.local`. The app uses the **service role** for portfolio reads/writes so the anon key cannot mutate paper cash or positions. If you previously ran the old init with open anon policies, run **`supabase/lockdown_paper_portfolio.sql`** once after deploying that code. Starting cash: **$100,000** fake dollars.

### Production build

```bash
cd web && npm run build && npm start
```

Run the production server from the **repository root** so paths resolve to `data/` correctly (the app uses `process.cwd()` which should be the `web/` directory when you `cd web` — see `web/lib/paths.ts`).
