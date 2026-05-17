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
python pipeline/run_pipeline.py --fetch-balldontlie --active   # default refresh (BALLDONTLIE + active list)
python pipeline/run_pipeline.py --fetch      # deprecated: stats.nba.com via nba_api (local fallback only)
python pipeline/run_pipeline.py --fetch --bootstrap-history
python pipeline/run_pipeline.py --active     # refresh active_players.csv (use with a fetch flag)
```

Individual steps: `pipeline/balldontlie_fetch.py` or `pipeline/data_collection.py` → `pipeline/data_cleaning.py` → `pipeline/game_score.py` → `pipeline/price_engine.py`.

### Recommended local workflow (aligned with production)

1. Add keys to `web/.env.local` (see **Environment variables** below).
2. Refresh prices and sync to Supabase:

```bash
python pipeline/update_market_local.py
```

That runs `--fetch-balldontlie --active` by default, then `sync_prices_to_supabase.py` — same fetch flags as GitHub Actions.

To rebuild from CSVs only (no network fetch):

```bash
python pipeline/run_pipeline.py
python pipeline/sync_prices_to_supabase.py
```

### Data sources

- **Primary (production, CI, local default):** [BALLDONTLIE](https://nba.balldontlie.io/) via `pipeline/balldontlie_fetch.py` — `run_pipeline.py --fetch-balldontlie --active` (requires `BALLDONTLIE_API_KEY`, **All-Star+** tier for per-game player stats).
- **Deprecated local fallback:** `stats.nba.com` via [`nba_api`](https://github.com/swar/nba_api) (`--fetch` or `PRICES_FETCH_SOURCE=nba_api` for `update_market_local.py`). Use only when BALLDONTLIE is unavailable; do not mix player ids with a BDL-backed Supabase dataset.

**Player ID warning:** NBA.com ids from `nba_api` and BALLDONTLIE numeric ids are **not the same**. Do not mix raw CSVs, `active_players.csv`, or Supabase rows from one source with fetches from the other. Always use `--fetch-balldontlie --active` end-to-end for hosted prices.

### Environment variables (pipeline / local updater)

| Variable | Required for | Notes |
|----------|----------------|-------|
| `BALLDONTLIE_API_KEY` | BDL fetch (default) | All-Star+ for `GET /nba/v1/stats`. Put in `web/.env.local` or GitHub Actions secrets. |
| `BALLDONTLIE_REQUEST_PAUSE_SECONDS` | BDL fetch | Pause between HTTP calls (default `1.05`). **Increase** (e.g. `2`–`3`) if you see `429 Too Many Requests` on long local runs. |
| `BALLDONTLIE_PER_PAGE` | BDL fetch | Max `100` (default `100`). |
| `PRICES_FETCH_SOURCE` | `update_market_local.py` only | Default `balldontlie`. Set to `nba_api` for deprecated `--fetch` path. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Sync + hosted app | Sync script; service role is server-only. |
| `NBA_API_*` | `nba_api` fallback only | Timeouts/retries when using `--fetch` (see `pipeline/data_collection.py`). |

### BALLDONTLIE rate limiting

Full prior+current-season fetches paginate thousands of requests. If a local run fails with **`HTTP 429`**, wait and retry, or raise `BALLDONTLIE_REQUEST_PAUSE_SECONDS` in `.env.local`. CI uses the same API with repository secrets; very long interactive runs are more likely to hit limits than the scheduled workflow.

Game-log collection includes both **Regular Season** and **Playoffs**. Prices update only when a
player logs another game; between games, the last model price stays flat.

**Long-term updater defaults:** automated fetches use only the **prior season + current season**
because the prior season provides the benchmark/anchor and the current season drives the live
market. Use `--bootstrap-history` only when you intentionally want a deeper rebuild.

## Data flow

1. **Raw** (`data/raw_game_logs.csv`) — per-game box scores (BALLDONTLIE by default, or deprecated nba_api `--fetch`)  
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
- **Hosted (Vercel, recommended):** load prices from Supabase instead of the repo disk. Run `supabase/prices_tables.sql` once in the SQL Editor, then **`supabase/prices_meta_snapshot.sql`** (adds season snapshot columns), then whenever CSVs change run `python pipeline/sync_prices_to_supabase.py` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set (service key is **secret** — use CI secrets or your shell only). On Vercel add **`PRICES_SOURCE=supabase`** (server env, not `NEXT_PUBLIC_*`). The sync bumps `prices_snapshot_meta.revision` so the app drops its in-memory cache on the next request.
  - Optional: set **`PRICES_SUPABASE_PAGE_SIZE`** (e.g. `5000`) in `web/.env.local` / Vercel to cut round-trips. In Supabase **Project Settings → API**, raise **Max rows** to at least that value, or requests will still cap at the default (often 1000).

**Automatic updates:** `.github/workflows/update-market-prices.yml` fetches via **BALLDONTLIE**
(`--fetch-balldontlie --active`), rebuilds prices, and syncs to Supabase twice per hour (UTC :15 and :45).
Add repository secrets `BALLDONTLIE_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` before enabling that workflow.

**Local scheduler (alternative to CI):** schedule `python pipeline/update_market_local.py` (defaults to BALLDONTLIE, same as CI). On Windows, use Task Scheduler. For the legacy NBA API path only, set `PRICES_FETCH_SOURCE=nba_api` in `.env.local`.

**Portfolio:** stored in **Supabase** (`portfolios` / `positions`; see `supabase/init_paper_market.sql`). Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and **`SUPABASE_SERVICE_ROLE_KEY`** (server-only on Vercel — never `NEXT_PUBLIC_*`) in `web/.env.local`. The app uses the **service role** for portfolio reads/writes so the anon key cannot mutate paper cash or positions. If you previously ran the old init with open anon policies, run **`supabase/lockdown_paper_portfolio.sql`** once after deploying that code. Starting cash: **$100,000** fake dollars.

### Production build

```bash
cd web && npm run build && npm start
```

Run the production server from the **repository root** so paths resolve to `data/` correctly (the app uses `process.cwd()` which should be the `web/` directory when you `cd web` — see `web/lib/paths.ts`).
