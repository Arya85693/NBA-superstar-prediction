"""Optional matplotlib visualizations for backtest outputs."""
from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd


def generate_plots(
    panel: pd.DataFrame,
    signal_summary: pd.DataFrame,
    out_dir: Path,
) -> None:
    plots_dir = out_dir / "plots"
    plots_dir.mkdir(parents=True, exist_ok=True)

    if not signal_summary.empty:
        fig, ax = plt.subplots(figsize=(10, 5))
        top = signal_summary.sort_values("spearman_mean", ascending=True).tail(12)
        ax.barh(top["signal_name"], top["spearman_mean"], color="#2563eb")
        ax.axvline(0, color="#64748b", linewidth=0.8)
        ax.set_xlabel("Mean cross-sectional Spearman ρ")
        ax.set_title("Signal predictive power vs forward Δ game score")
        fig.tight_layout()
        fig.savefig(plots_dir / "spearman_by_signal.png", dpi=120)
        plt.close(fig)

    df = panel[panel["evaluable"]].copy()
    if len(df) > 500:
        df = df.sample(500, random_state=42)
    if not df.empty and "signal_fair_value" in df.columns:
        fig, ax = plt.subplots(figsize=(7, 5))
        ax.scatter(
            df["signal_fair_value"],
            df["forward_mean_game_score"],
            alpha=0.35,
            s=12,
            c="#0ea5e9",
        )
        ax.set_xlabel("Fair value (price) at signal time")
        ax.set_ylabel(f"Forward mean game score ({panel.attrs.get('horizon', 'N')} games)")
        ax.set_title("Price level vs forward performance")
        fig.tight_layout()
        fig.savefig(plots_dir / "price_vs_forward_scatter.png", dpi=120)
        plt.close(fig)

    if "signal_projection" in df.columns:
        fig, ax = plt.subplots(figsize=(7, 5))
        ax.scatter(
            df["signal_projection"],
            df["forward_delta_game_score"],
            alpha=0.35,
            s=12,
            c="#16a34a",
        )
        ax.axhline(0, color="#64748b", linewidth=0.8)
        ax.axvline(0, color="#64748b", linewidth=0.8)
        ax.set_xlabel("Projection score at signal time")
        ax.set_ylabel("Forward Δ game score vs season avg")
        ax.set_title("Projection signal vs forward improvement")
        fig.tight_layout()
        fig.savefig(plots_dir / "projection_vs_forward_delta.png", dpi=120)
        plt.close(fig)
