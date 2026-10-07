import assert from "node:assert/strict";
import { test } from "node:test";
import {
  positionMetrics,
  resolveMarkPrice,
  roundMoney,
} from "../lib/portfolioMath.ts";
import { buyPrice, HALF_SPREAD, sellPrice } from "../lib/tradeCosts.ts";

test("marks at the Market Price mid when available", () => {
  assert.deepEqual(
    resolveMarkPrice({ marketPrice: 104.2, fairValue: 100, avgCostPerShare: 90 }),
    { price: 104.2, source: "market" },
  );
});

test("falls back to Fair Value, then cost basis, never to $0", () => {
  assert.deepEqual(
    resolveMarkPrice({ marketPrice: null, fairValue: 100, avgCostPerShare: 90 }),
    { price: 100, source: "fair_value" },
  );
  assert.deepEqual(
    resolveMarkPrice({ marketPrice: 0, fairValue: 0, avgCostPerShare: 90 }),
    { price: 90, source: "cost_basis" },
  );
  assert.deepEqual(
    resolveMarkPrice({ marketPrice: NaN, fairValue: undefined, avgCostPerShare: null }),
    { price: null, source: "none" },
  );
});

test("position value and unrealized P&L use the same mark", () => {
  const m = positionMetrics(101.5, 10, 100);
  assert.equal(m.value, 1015);
  assert.equal(m.costBasis, 1000);
  assert.equal(m.unrealizedPnl, 15);
});

test("a fresh buy marked at mid shows exactly the half-spread as unrealized loss", () => {
  const mid = 100;
  const fill = buyPrice(mid);
  const m = positionMetrics(mid, 10, fill);
  assert.equal(m.unrealizedPnl, roundMoney(-mid * HALF_SPREAD * 10));
});

test("marking at mid sits between the buy and sell fills", () => {
  const mid = 123.45;
  assert.ok(sellPrice(mid) < mid && mid < buyPrice(mid));
  // Liquidation value differs from the mark by at most the half-spread.
  assert.ok(mid - sellPrice(mid) <= mid * HALF_SPREAD + 1e-9);
});

test("cost-basis fallback reports zero unrealized P&L rather than a total loss", () => {
  const { price } = resolveMarkPrice({ avgCostPerShare: 80 });
  const m = positionMetrics(price, 5, 80);
  assert.equal(m.value, 400);
  assert.equal(m.unrealizedPnl, 0);
});

test("missing mark and missing cost stays unknown, not negative", () => {
  const m = positionMetrics(null, 5, null);
  assert.equal(m.value, 0);
  assert.equal(m.costBasis, null);
  assert.equal(m.unrealizedPnl, null);
});
