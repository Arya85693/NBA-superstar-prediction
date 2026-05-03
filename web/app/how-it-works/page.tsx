import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

export const metadata = {
  title: "How it works",
};

const sections = [
  {
    title: "What you’re looking at",
    body: "Each player has a model price that updates through the season. It blends an opening anchor, prior-year productivity, and game-by-game performance — so the number is a smoothed signal, not a single-game reaction.",
  },
  {
    title: "Game score vs price",
    body: "On a player page, “game score” is that night’s Hollinger-style box score summary. Price can stay high after a quiet night because the model carries history and season context. Use the chart ranges to see how the series moved over time.",
  },
  {
    title: "Paper trading",
    body: "You start with paper cash. Trades are whole shares at the latest model price. Your portfolio shows cash, position value, and total equity — useful for testing ideas against the same data the model uses.",
  },
  {
    title: "Caution icon",
    body: "A warning next to a price means this player has no minutes logged in the newest season present in your dataset file. The price may still reflect older seasons or the model’s anchor — not current on-court minutes.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Guide"
        title="How it works"
        description="A quick tour of the simulator so the numbers and screens feel familiar — not financial advice, and not real securities."
      />

      <div className="space-y-10">
        {sections.map((s) => (
          <section
            key={s.title}
            className="rounded-2xl border border-zinc-800/90 bg-zinc-900/30 p-6 md:p-8"
          >
            <h2 className="text-lg font-semibold text-zinc-100">{s.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{s.body}</p>
          </section>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          href="/market"
          className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
        >
          Open market
        </Link>
        <Link
          href="/"
          className="rounded-xl border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:border-zinc-500"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
