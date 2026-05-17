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
python pipeline/run_pipeline.py --fetch-balldontlie --active   # production-style refresh (BALLDONTLIE)
python pipeline/run_pipeline.py --fetch      # legacy: stats.nba.com via nba_api (local fallback)
python pipeline/run_pipeline.py --fetch --bootstrap-history
python pipeline/run_pipeline.py --active     # also refresh data/active_players.csv
```

Individual steps: `pipeline/data_collection.py` → `pipeline/data_cleaning.py` → `pipeline/game_score.py` → `pipeline/price_engine.py`.

### Data sources

- **Production / CI (recommended):** [BALLDONTLIE](https://nba.balldontlie.io/) via `pipeline/balldontlie_fetch.py` — GitHub Actions runs `run_pipeline.py --fetch-balldontlie --active` (requires `BALLDONTLIE_API_KEY`, All-Star+ tier for game stats).
- **Legacy / local fallback:** `stats.nba.com` via [`nba_api`](https://github.com/swar/nba_api) (`--fetch`) — still available when BALLDONTLIE is unavailable; `update_market_local.py` uses this unless you set `PRICES_FETCH_SOURCE=balldontlie`.

**Player ID warning:** NBA.com ids from `nba_api` and BALLDONTLIE numeric ids are **not the same**. Do not mix raw CSVs, `active_players.csv`, or Supabase data built from one source with fetches from the other. Use `--fetch-balldontlie --active` end-to-end when your hosted app reads Supabase prices synced from CI.

Game-log collection includes both **Regular Season** and **Playoffs**. Prices update only when a
player logs another game; between games, the last model price stays flat.

**Long-term updater defaults:** automated fetches use only the **prior season + current season**
because the prior season provides the benchmark/anchor and the current season drives the live
market. Use `--bootstrap-history` only when you intentionally want a deeper rebuild.

## Data flow

1. **Raw** (`data/raw_game_logs.csv`) — per-game box scores (BALLDONTLIE or nba_api `--fetch`)  
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

**Local scheduler (alternative to CI):** if you prefer not to rely on GitHub Actions, schedule this locally:

```bash
python pipeline/update_market_local.py
```

That script loads Supabase values from `web/.env.local` when present, refreshes the prior/current
season window, rebuilds prices, and syncs them to Supabase. Set `PRICES_FETCH_SOURCE=balldontlie`
(and `BALLDONTLIE_API_KEY`) in the environment to match CI; otherwise it defaults to `nba_api` (`--fetch`).
On Windows, this is a good target for Task Scheduler.

**Portfolio:** stored in **Supabase** (`portfolios` / `positions`; see `supabase/init_paper_market.sql`). Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and **`SUPABASE_SERVICE_ROLE_KEY`** (server-only on Vercel — never `NEXT_PUBLIC_*`) in `web/.env.local`. The app uses the **service role** for portfolio reads/writes so the anon key cannot mutate paper cash or positions. If you previously ran the old init with open anon policies, run **`supabase/lockdown_paper_portfolio.sql`** once after deploying that code. Starting cash: **$100,000** fake dollars.

### Production build

```bash
cd web && npm run build && npm start
```

Run the production server from the **repository root** so paths resolve to `data/` correctly (the app uses `process.cwd()` which should be the `web/` directory when you `cd web` — see `web/lib/paths.ts`).
