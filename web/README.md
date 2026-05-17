# NBA paper market — web app

Next.js 16 app for the paper-trading UI and API routes. See the [repository README](../README.md) for the full pipeline, BALLDONTLIE vs `nba_api` data sources, Supabase setup, and deployment.

## Local development

From this directory (`web/`):

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Environment:** copy or create `web/.env.local` with Supabase keys. For hosted prices (recommended), set `PRICES_SOURCE=supabase` and run `python pipeline/sync_prices_to_supabase.py` from the repo root after the pipeline produces CSVs.

**Windows / long paths:** the default `npm run dev` uses Webpack (`next dev --webpack`) to avoid Turbopack path-length issues. Delete `web/.next` once if the dev server misbehaves after moving the repo.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server (Webpack) |
| `npm run dev:turbo` | Development server (Turbopack; shorter paths only) |
| `npm run build` | Production build (+ Vercel output link script) |
| `npm start` | Production server |
| `npm run lint` | ESLint |

## Production build

```bash
npm run build && npm start
```

Run from `web/` so `../data` resolves when using CSV price mode (see `lib/paths.ts`).
