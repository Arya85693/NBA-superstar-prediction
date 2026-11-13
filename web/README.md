# NBA paper market - web app

Next.js 16 app for the paper-trading UI and API routes. See the [repository README](../README.md) for the full pipeline, ESPN data source, Supabase setup, and deployment.

## Local development

From this directory (`web/`):

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Environment (`web/.env.local`):**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server portfolio + price sync (never `NEXT_PUBLIC_*`) |
| `PRICES_SOURCE=supabase` | Load market prices from Supabase (recommended for local dev matching Vercel) |
| `PRICES_FETCH_SOURCE=nba_api` | Optional; deprecated local fetch via stats.nba.com only |

**Refresh prices (default, matches CI):** from repo root, `python pipeline/update_market_local.py` (ESPN fetch + Supabase sync). See the [repository README](../README.md) for player-id mapping.

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
