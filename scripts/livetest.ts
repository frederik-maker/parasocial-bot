/**
 * Live end-to-end test against the real Zerion API.
 * Loads .env, computes credibility for a real wallet, prints the alert card.
 * Run:  npx tsx scripts/livetest.ts [0xaddress]
 */
import "dotenv/config";
import { computeCredibility, extractTrades } from "../src/credibility.js";
import { alertMessage, scoreBreakdown } from "../src/format.js";
import { getHistory } from "../src/zerion.js";
import type { DetectedTrade } from "../src/types.js";

const DEFAULT_ADDRS = [
  // vitalik.eth — known address, low trade activity but useful as a baseline
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
];

async function main() {
  const address = process.argv[2] ?? DEFAULT_ADDRS[0]!;
  console.log(`\n=== Live Zerion test: ${address} ===\n`);

  console.time("history");
  const history = await getHistory(address, { limit: 30 });
  console.timeEnd("history");
  console.log(`History returned ${history.transactions.length} txs\n`);

  const trades = extractTrades(history.transactions);
  console.log(`Extracted ${trades.length} trade-like txs:`);
  for (const t of trades.slice(0, 10)) {
    console.log(
      `  ${t.direction.padEnd(4)} ${(t.asset || "?").padEnd(8)} $${t.usdValue.toFixed(0).padEnd(8)} ${t.chain.padEnd(10)} ${t.txHash.slice(0, 12)}`,
    );
  }

  console.time("credibility");
  const score = await computeCredibility({ address });
  console.timeEnd("credibility");
  console.log(`\n--- credibility score ---\n`);
  console.log(scoreBreakdown(score, address));

  // Only render the alert card if we actually have a trade to surface.
  const latest: DetectedTrade | undefined = trades[0];
  if (latest) {
    latest.address = address;
    console.log(`\n--- alert card (newest trade) ---\n`);
    console.log(
      alertMessage({
        address,
        label: null,
        direction: latest.direction,
        trade: latest,
        score,
      }),
    );
  } else {
    console.log(`\n(no trade-like tx found to render an alert card)`);
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
