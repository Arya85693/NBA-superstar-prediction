/**
 * Stock-style 4-letter symbols (AMZN-style) from player names.
 * Assigns unique tickers within a batch by resolving collisions.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function latinLettersOnly(s: string): string {
  return s.replace(/[^a-zA-Z]/g, "");
}

/** Split display name into alphabetic tokens (accents stripped). */
export function nameTokens(raw: string): string[] {
  const n = raw.normalize("NFD").replace(/\p{M}/gu, "");
  return n
    .split(/\s+/)
    .map((t) => latinLettersOnly(t))
    .filter(Boolean);
}

/** Preferred 4-char base: first initial + first 3 letters of last name (e.g. NJOK). */
export function baseTicker(name: string): string {
  const parts = nameTokens(name);
  if (parts.length === 0) return "PLRX";
  const last = parts[parts.length - 1]!.toUpperCase();
  if (parts.length === 1) {
    return last.slice(0, 4).padEnd(4, "X").slice(0, 4);
  }
  const first = parts[0]!.toUpperCase();
  const c0 = first[0] ?? "X";
  const last3 = last.slice(0, 3);
  return (c0 + last3).slice(0, 4);
}

/**
 * Assign unique 4-letter tickers for a set of players (stable order by player_id).
 */
export function assignPlayerTickers(
  rows: Array<{ player_id: number; player_name: string }>,
): Map<number, string> {
  const sorted = [...rows].sort((a, b) => a.player_id - b.player_id);
  const result = new Map<number, string>();
  const used = new Set<string>();

  for (const r of sorted) {
    const base = baseTicker(r.player_name);
    const padded = base.length >= 4 ? base.slice(0, 4) : base.padEnd(4, "X");

    let candidate = padded.slice(0, 4);
    if (!used.has(candidate)) {
      used.add(candidate);
      result.set(r.player_id, candidate);
      continue;
    }

    // Collision: keep first 3 chars from base, rotate 4th using player id (deterministic).
    let i = 0;
    for (;;) {
      const rot = LETTERS[(r.player_id + i) % 26]!;
      candidate = (base.slice(0, 3) + rot).slice(0, 4);
      if (!used.has(candidate)) {
        used.add(candidate);
        result.set(r.player_id, candidate);
        break;
      }
      i += 1;
      if (i > 52) {
        // Extremely unlikely: fall back to id-based suffix
        candidate = `P${(r.player_id % 1000).toString().padStart(3, "0")}`.slice(0, 4);
        if (!used.has(candidate)) {
          used.add(candidate);
          result.set(r.player_id, candidate);
        }
        break;
      }
    }
  }

  return result;
}
