import { getPnlRest, getTransactionsRest } from "./rest.js";
import { logger } from "./logger.js";
import type { Address, CredibilityScore, DetectedTrade, Transaction } from "./types.js";

const SCORE_WEIGHTS = {
  pnl: 0.4,
  winRate: 0.3,
  assetWinRate: 0.2,
  recency: 0.1,
} as const;

const IGNORE_SYMBOLS = new Set(["ETH", "WETH", "USDC", "USDT", "DAI", "USDS", "WBTC", "BTC"]);
const STABLE_SYMBOLS = new Set(["USDC", "USDT", "DAI", "USDS", "USDE", "FDUSD", "PYUSD"]);

export interface CredibilityInput {
  address: Address;
  asset?: string;
  sampleSize?: number;
}

/**
 * Extract trade-like transactions with their net USD value & primary non-stable asset.
 * A "trade" is any tx where a non-stable token moved in/out with USD value.
 */
export function extractTrades(txs: Transaction[]): DetectedTrade[] {
  const trades: DetectedTrade[] = [];
  for (const tx of txs) {
    if (tx.status !== "confirmed" && tx.status !== "success") continue;
    if (tx.type !== "trade" && tx.type !== "send" && tx.type !== "receive") continue;
    const transfers = tx.transfers ?? [];
    if (transfers.length === 0) continue;

    // Pick the largest-value non-stable transfer as the "asset".
    const nonStable = transfers.filter(
      (t) => t.fungible && !STABLE_SYMBOLS.has(t.fungible) && t.value && t.value > 1,
    );
    const primary = nonStable.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
    if (!primary || !primary.fungible) continue;

    const direction: "buy" | "sell" = primary.direction === "in" ? "buy" : "sell";
    trades.push({
      address: "",
      txHash: tx.hash,
      chain: tx.chain,
      direction,
      asset: primary.fungible,
      quantity: primary.quantity ?? 0,
      usdValue: primary.value ?? 0,
      timestamp: tx.timestamp,
    });
  }
  return trades;
}

/**
 * Compute win rate from a list of buy/sell pairs for the same asset.
 * A "win" = sold higher than bought (positive realized), or still holding after a buy
 * AND last price > entry price (we approximate with PnL data so this local function
 * focuses on closed-trade wins only).
 */
function closedTradeWinRate(trades: DetectedTrade[]): { winRate: number; sample: number } {
  // Net USD flow per asset: if total USD received from selling > total USD spent buying
  // for the same asset, it's a win. Works even when only one side of a pair is in the window.
  const byAsset = new Map<string, { usdIn: number; usdOut: number }>();
  for (const t of trades) {
    const acc = byAsset.get(t.asset) ?? { usdIn: 0, usdOut: 0 };
    if (t.direction === "buy") acc.usdIn += t.usdValue;
    else acc.usdOut += t.usdValue;
    byAsset.set(t.asset, acc);
  }
  let wins = 0, total = 0;
  for (const { usdIn, usdOut } of byAsset.values()) {
    if (usdIn > 0 && usdOut > 0) {
      total++;
      if (usdOut >= usdIn) wins++;
    }
  }
  return { winRate: total === 0 ? 0 : wins / total, sample: total };
}

function recencyBonus(trades: DetectedTrade[]): number {
  if (trades.length === 0) return 0;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let weighted = 0;
  let weightSum = 0;
  for (const t of trades) {
    const ageDays = Math.max(0, (now - Date.parse(t.timestamp)) / dayMs);
    const weight = Math.exp(-ageDays / 14);
    weightSum += weight;
    const sign = t.direction === "buy" ? 1 : -0.2;
    weighted += weight * sign;
  }
  return weightSum === 0 ? 0 : Math.max(-1, Math.min(1, weighted / weightSum));
}

function toTier(realizedPct: number | null): CredibilityScore["tier"] {
  const pct = realizedPct ?? 0;
  if (pct >= 100) return "🔥";
  if (pct >= 20) return "💎";
  if (pct >= 0) return "🤔";
  return "💀";
}

function tierLabel(tier: CredibilityScore["tier"]): string {
  switch (tier) {
    case "🔥":
      return "Hot hand";
    case "💎":
      return "Diamond hands";
    case "🤔":
      return "Mixed bag";
    case "💀":
      return "Bag holder";
  }
}

function normalizePnL(pct: number | null | undefined): number {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 0.5;
  // Zerion returns percent units (e.g. -99.95 for -99.95%, 340 for +340%).
  // Map -100..+300 → 0..1; clamp outside.
  if (pct <= -100) return 0;
  if (pct >= 300) return 1;
  return (pct + 100) / 400;
}

function outcomeFor(trade: DetectedTrade): "✅" | "❌" | "➖" {
  if (trade.direction === "sell") {
    return trade.usdValue > 0 ? "✅" : "❌";
  }
  return "➖";
}

export async function computeCredibility(input: CredibilityInput): Promise<CredibilityScore> {
  const limit = input.sampleSize ?? 100;
  const [txs, pnl] = await Promise.all([
    getTransactionsRest(input.address, limit).catch((err) => {
      logger.warn(`getTransactionsRest failed for ${input.address}: ${err instanceof Error ? err.message : err}`);
      return [] as import("./types.js").Transaction[];
    }),
    getPnlRest(input.address).catch((err) => {
      logger.warn(`getPnlRest failed for ${input.address}: ${err instanceof Error ? err.message : err}`);
      return null;
    }),
  ]);

  const trades = extractTrades(txs).map((t) => ({ ...t, address: input.address }));

  const { winRate, sample } = closedTradeWinRate(trades);

  let assetWinRate: number | null = null;
  if (input.asset) {
    const cleanSymbol = input.asset.toUpperCase();
    const filtered = trades.filter((t) => t.asset.toUpperCase() === cleanSymbol);
    if (filtered.length >= 2) {
      assetWinRate = closedTradeWinRate(filtered).winRate;
    }
  }

  const attrs = pnl?.data.attributes;
  const totalPct = attrs?.relative_total_gain_percentage ?? null;
  const realizedPct = attrs?.relative_realized_gain_percentage ?? null;

  // Detect dust/NFT/airdrop inflation: if totalInvested >> realizedCostBasis
  // AND totalGain% is wildly negative, the total metric is garbage — use realized.
  const flags: string[] = [];
  let primaryPct = totalPct;
  if (attrs) {
    const ratio = attrs.realized_cost_basis > 0 ? attrs.total_invested / attrs.realized_cost_basis : 0;
    const inflated = ratio > 50 && (totalPct ?? 0) < -50;
    if (inflated) {
      flags.push("dust-inflated — using realized PnL only");
      primaryPct = realizedPct;
    } else if (realizedPct !== null) {
      // Prefer realized even when not obviously inflated — closed trades are
      // the honest signal for a *copy-trading* credibility score.
      primaryPct = realizedPct;
    }
  }
  if (sample < 3) flags.push("low sample size");

  const normalizedPnl = normalizePnL(primaryPct);
  const recency = recencyBonus(trades);
  const recencyNormalized = (recency + 1) / 2;

  // Use neutral 0.5 for win rate when sample is too small to be meaningful.
  const effectiveWinRate = sample >= 3 ? winRate : 0.5;
  const effectiveAssetWinRate = assetWinRate !== null && sample >= 3 ? assetWinRate : effectiveWinRate;

  const score =
    (SCORE_WEIGHTS.pnl * normalizedPnl +
      SCORE_WEIGHTS.winRate * effectiveWinRate +
      SCORE_WEIGHTS.assetWinRate * effectiveAssetWinRate +
      SCORE_WEIGHTS.recency * recencyNormalized) *
    100;

  const tier = toTier(primaryPct);

  // Only exits carry meaningful outcome signal — buys are all "➖" and add noise.
  const lastFive = trades
    .filter((t) => t.direction === "sell" && t.asset && !IGNORE_SYMBOLS.has(t.asset.toUpperCase()))
    .slice(0, 5)
    .map(outcomeFor);

  return {
    overallPnLPercent: totalPct,
    realizedPnLPercent: realizedPct,
    winRate,
    assetWinRate,
    recencyBonus: recency,
    score,
    tier,
    label: tierLabel(tier),
    sampleSize: sample,
    lastFiveOutcomes: lastFive,
    flags,
  };
}
