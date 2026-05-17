"""
Run the lighter long-term market updater locally (matches CI / production fetch).

Default: BALLDONTLIE (`run_pipeline.py --fetch-balldontlie --active`), then sync to Supabase.
Loads `web/.env.local` when present (Supabase + `BALLDONTLIE_API_KEY`).

Legacy fallback only: set `PRICES_FETCH_SOURCE=nba_api` to use `--fetch` (stats.nba.com via nba_api).
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / "web" / ".env.local"


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        if not key:
            continue
        os.environ.setdefault(key, value.strip())


def _fetch_args(env: dict[str, str]) -> list[str]:
    source = (env.get("PRICES_FETCH_SOURCE") or "balldontlie").strip().lower()
    if source in ("nba_api", "nba", "stats", "stats.nba.com"):
        print(
            "PRICES_FETCH_SOURCE=nba_api — using deprecated stats.nba.com fetch (--fetch).",
            file=sys.stderr,
        )
        return ["--fetch", "--active"]
    if source not in ("balldontlie", "bdl", "balldontlie.io", ""):
        print(
            f"Unknown PRICES_FETCH_SOURCE={source!r}; defaulting to BALLDONTLIE.",
            file=sys.stderr,
        )
    if not (env.get("BALLDONTLIE_API_KEY") or "").strip():
        print(
            "Warning: BALLDONTLIE_API_KEY is not set. Add it to web/.env.local or the environment.",
            file=sys.stderr,
        )
    return ["--fetch-balldontlie", "--active"]


def main() -> None:
    load_env_file(ENV_PATH)
    if not os.environ.get("SUPABASE_URL"):
        public_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        if public_url:
            os.environ["SUPABASE_URL"] = public_url

    env = os.environ.copy()
    fetch_args = _fetch_args(env)
    print("Pipeline fetch:", " ".join(fetch_args))

    subprocess.run(
        [sys.executable, "pipeline/run_pipeline.py", *fetch_args],
        cwd=REPO_ROOT,
        env=env,
        check=True,
    )
    subprocess.run(
        [sys.executable, "pipeline/sync_prices_to_supabase.py"],
        cwd=REPO_ROOT,
        env=env,
        check=True,
    )


if __name__ == "__main__":
    main()
