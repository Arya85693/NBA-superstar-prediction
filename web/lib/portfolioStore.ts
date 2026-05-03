import fs from "fs";
import path from "path";
import { portfolioJsonPath } from "./paths";
import type { Portfolio } from "./types";

export const STARTING_CASH = 100_000;

const DEFAULT: Portfolio = {
  cash: STARTING_CASH,
  positions: {},
};

export function readPortfolio(): Portfolio {
  const p = portfolioJsonPath();
  if (!fs.existsSync(p)) {
    writePortfolio(DEFAULT);
    return { ...DEFAULT, positions: { ...DEFAULT.positions } };
  }
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const j = JSON.parse(raw) as Portfolio;
    const cash =
      typeof j.cash === "number" && Number.isFinite(j.cash)
        ? j.cash
        : STARTING_CASH;
    const positions =
      j.positions && typeof j.positions === "object" ? j.positions : {};
    return { cash, positions: { ...positions } };
  } catch {
    writePortfolio(DEFAULT);
    return { ...DEFAULT, positions: { ...DEFAULT.positions } };
  }
}

export function writePortfolio(p: Portfolio): void {
  const pth = portfolioJsonPath();
  fs.mkdirSync(path.dirname(pth), { recursive: true });
  fs.writeFileSync(pth, JSON.stringify(p, null, 2), "utf-8");
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
