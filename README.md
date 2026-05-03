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
python pipeline/run_pipeline.py --fetch      # re-download from NBA API, then build
python pipeline/run_pipeline.py --active     # also refresh data/active_players.csv
```

Individual steps: `pipeline/data_collection.py` → `pipeline/data_cleaning.py` → `pipeline/game_score.py` → `pipeline/price_engine.py`.

## Data flow

1. **Raw** (`data/raw_*.csv`) — NBA API exports  
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

Open [http://localhost:3000](http://localhost:3000). The app reads `data/player_game_prices.csv` and `data/active_players.csv` via `../data` from the `web/` folder.

Portfolio state is stored in `data/paper_portfolio.json` (created on first trade). Starting cash: **$100,000** fake dollars.

### Production build

```bash
cd web && npm run build && npm start
```

Run the production server from the **repository root** so paths resolve to `data/` correctly (the app uses `process.cwd()` which should be the `web/` directory when you `cd web` — see `web/lib/paths.ts`).
