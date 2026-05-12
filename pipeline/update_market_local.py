"""
Run the lighter long-term market updater locally.

Recommended for local scheduling (Windows Task Scheduler / cron) because `stats.nba.com`
can be unreliable from cloud runners. This refreshes the prior + current NBA seasons,
rebuilds prices, and syncs them to Supabase using values from `web/.env.local` when
present.
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


def main() -> None:
    load_env_file(ENV_PATH)
    if not os.environ.get("SUPABASE_URL"):
        public_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        if public_url:
            os.environ["SUPABASE_URL"] = public_url

    env = os.environ.copy()

    subprocess.run(
        [sys.executable, "pipeline/run_pipeline.py", "--fetch", "--active"],
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
