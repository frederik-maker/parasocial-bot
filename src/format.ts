import type { CredibilityScore, DetectedTrade } from "./types.js";

export function shortAddr(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function escapeMd(s: string): string {
  return s.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

export function alertMessage(opts: {
  address: string;
  label: string | null;
  direction: "buy" | "sell";
  trade: DetectedTrade;
  score: CredibilityScore;
}): string {
  const verb = opts.direction === "buy" ? "bought" : "sold";
  const emoji = opts.direction === "buy" ? "🟢" : "🔴";
  const name = opts.label ?? shortAddr(opts.address);
  const lastFive = opts.score.lastFiveOutcomes.length > 0 ? opts.score.lastFiveOutcomes.join("") : "—";

  const assetStats = opts.score.assetWinRate !== null
    ? `• ${Math.round(opts.score.assetWinRate * 100)}% win rate on ${opts.trade.asset} positions`
    : `• ${opts.trade.asset} history: insufficient sample`;

  return [
    `🧠 *${escapeMd(name)}* just ${verb} ${emoji} *${escapeMd(opts.trade.asset)}*`,
    `Amount: *${fmtUsd(opts.trade.usdValue)}* on ${opts.trade.chain}`,
    ``,
    `*Their stats* ${opts.score.tier} _${opts.score.label}_ (score ${opts.score.score.toFixed(0)})`,
    `• ${fmtPct(opts.score.realizedPnLPercent)} realized PnL`,
    `• ${Math.round(opts.score.winRate * 100)}% win rate (${opts.score.sampleSize} assets w/ both sides)`,
    assetStats,
    `• Last 5: ${lastFive}`,
  ].join("\n");
}

export function scoreBreakdown(score: CredibilityScore, address: string): string {
  const lines = [
    `*Credibility report* — ${shortAddr(address)}`,
    ``,
    `${score.tier} *${score.label}* — score *${score.score.toFixed(0)}/100*`,
    ``,
    `*Breakdown*`,
    `• Realized PnL: *${fmtPct(score.realizedPnLPercent)}* _(primary signal — closed trades only)_`,
    `• Total PnL: ${fmtPct(score.overallPnLPercent)} _(includes unrealized bags)_`,
    `• Overall win rate: ${Math.round(score.winRate * 100)}% (${score.sampleSize} assets w/ both sides)`,
    `• Asset-specific win rate: ${score.assetWinRate === null ? "n/a" : Math.round(score.assetWinRate * 100) + "%"}`,
    `• Recency bias: ${(score.recencyBonus * 100).toFixed(0)}`,
    `• Last 5 outcomes: ${score.lastFiveOutcomes.join("") || "—"}`,
  ];
  if (score.flags.length > 0) {
    lines.push("", `⚠️ _${score.flags.join("; ")}_`);
  }
  return lines.join("\n");
}
