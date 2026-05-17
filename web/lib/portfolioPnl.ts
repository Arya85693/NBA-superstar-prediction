/** Green / red / neutral text for signed dollar amounts. */
export function pnlTextClass(n: number): string {
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-rose-400";
  return "text-zinc-400";
}

export function formatSignedUsd(n: number): string {
  const formatted = n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (n > 0) return `+${formatted}`;
  return formatted;
}

export function formatTradeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
