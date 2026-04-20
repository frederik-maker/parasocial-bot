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
  return [
    `🧠 *${escapeMd(name)}* just ${verb} ${emoji} *${escapeMd(opts.trade.asset)}*`,
    `Amount: *${fmtUsd(opts.trade.usdValue)}* on ${opts.trade.chain}`,
    ``,
    `• Realized PnL: ${fmtPct(opts.score.realizedPnLPercent)}`,
    `• Total PnL: ${fmtPct(opts.score.overallPnLPercent)}`,
  ].join("\n");
}

export function scoreBreakdown(score: CredibilityScore, address: string): string {
  const lines = [
    `*${shortAddr(address)}*`,
    `• Realized PnL: *${fmtPct(score.realizedPnLPercent)}*`,
    `• Total PnL: ${fmtPct(score.overallPnLPercent)}`,
  ];
  if (score.flags.length > 0) {
    lines.push(`_${score.flags.join("; ")}_`);
  }
  return lines.join("\n");
}
