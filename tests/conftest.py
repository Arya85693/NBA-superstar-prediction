"""Make the flat ``pipeline/`` modules importable from tests (matches runtime,
where run_pipeline / sync add the pipeline dir to sys.path)."""
import sys
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent.parent / "pipeline"
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))
