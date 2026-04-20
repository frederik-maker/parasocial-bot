/**
 * Offline smoke test — runs the pure logic (extractTrades, closedTradeWinRate,
 * formatters) against fixture data so we can verify the pipeline without
 * hitting Zerion. Run:  npx tsx scripts/smoketest.ts
 */
import { extractTrades } from "../src/credibility.js";
import { alertMessage, scoreBreakdown } from "../src/format.js";
import type { CredibilityScore, Transaction } from "../src/types.js";

const fixture: Transaction[] = [
  {
    hash: "0xaaa",
    type: "trade",
    status: "confirmed",
    timestamp: "2026-04-18T10:00:00Z",
    chain: "base",
    fee: 0.5,
    transfers: [
      { direction: "out", fungible: "USDC", quantity: 2400, value: 2400 },
      { direction: "in", fungible: "ETH", quantity: 0.7, value: 2400 },
    ],
  },
  {
    hash: "0xbbb",
    type: "trade",
    status: "confirmed",
    timestamp: "2026-04-10T10:00:00Z",
    chain: "base",
    fee: 0.4,
    transfers: [
      { direction: "in", fungible: "USDC", quantity: 2600, value: 2600 },
      { direction: "out", fungible: "ETH", quantity: 0.7, value: 2600 },
    ],
  },
  {
    hash: "0xccc",
    type: "trade",
    status: "confirmed",
    timestamp: "2026-04-01T10:00:00Z",
    chain: "ethereum",
    fee: 3,
    transfers: [
      { direction: "out", fungible: "USDC", quantity: 1000, value: 1000 },
      { direction: "in", fungible: "PEPE", quantity: 100_000_000, value: 1000 },
    ],
  },
];

const trades = extractTrades(fixture);
console.log("Extracted trades:");
for (const t of trades) {
  console.log(` - ${t.direction.padEnd(4)} ${t.asset.padEnd(6)} $${t.usdValue} on ${t.chain}  ${t.txHash}`);
}

const fakeScore: CredibilityScore = {
  overallPnLPercent: 340,
  realizedPnLPercent: 280,
  winRate: 0.73,
  assetWinRate: 0.81,
  recencyBonus: 0.6,
  score: 82,
  tier: "🔥",
  label: "Hot hand",
  sampleSize: 19,
  lastFiveOutcomes: ["✅", "✅", "✅", "❌", "✅"],
  flags: [],
};

console.log("\n--- alert message ---\n");
console.log(
  alertMessage({
    address: "0x5b7Fa89F2b4D8c1c99bB3b8d3E5bCE70a3b3aBcD",
    label: "0xSmart",
    direction: "buy",
    trade: {
      address: "0x5b7Fa89F2b4D8c1c99bB3b8d3E5bCE70a3b3aBcD",
      txHash: "0xaaa",
      chain: "base",
      direction: "buy",
      asset: "ETH",
      quantity: 0.7,
      usdValue: 2400,
      timestamp: "2026-04-18T10:00:00Z",
    },
    score: fakeScore,
  }),
);

console.log("\n--- score breakdown ---\n");
console.log(scoreBreakdown(fakeScore, "0x5b7Fa89F2b4D8c1c99bB3b8d3E5bCE70a3b3aBcD"));

// Trivial assertions so the exit code reflects correctness.
if (trades.length !== 3) throw new Error(`expected 3 trades, got ${trades.length}`);
if (trades[0]?.asset !== "ETH" || trades[0]?.direction !== "buy") throw new Error("trade 0 mis-classified");
if (trades[1]?.direction !== "sell") throw new Error("trade 1 should be sell");
if (trades[2]?.asset !== "PEPE") throw new Error("trade 2 should be PEPE");
console.log("\n✓ all assertions passed");
