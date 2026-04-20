import { getPolicy, lastExecutedMirror, recentExecutedSpendUsd } from "./db.js";
import type { UserPolicy } from "./types.js";

export interface PolicyCheckInput {
  userId: number;
  chain: string;
  usdAmount: number;
  slippage?: number;
}

export type PolicyCheckResult =
  | { ok: true; policy: UserPolicy; amountUsd: number }
  | { ok: false; reason: string; policy: UserPolicy };

/**
 * Enforce scoped policies BEFORE swap execution.
 * These run locally in the bot; Zerion agent tokens enforce chain/allowlist on-chain.
 */
export function checkPolicy(input: PolicyCheckInput): PolicyCheckResult {
  const policy = getPolicy(input.userId);

  if (!policy.allowedChains.includes(input.chain)) {
    return {
      ok: false,
      reason: `Chain "${input.chain}" not in allowed list (${policy.allowedChains.join(", ")})`,
      policy,
    };
  }

  if (input.slippage !== undefined && input.slippage > policy.maxSlippage) {
    return {
      ok: false,
      reason: `Slippage ${input.slippage}% exceeds cap ${policy.maxSlippage}%`,
      policy,
    };
  }

  const cappedAmount = Math.min(input.usdAmount, policy.maxMirrorUsd);

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const spentToday = recentExecutedSpendUsd(input.userId, dayAgo);
  if (spentToday + cappedAmount > policy.dailySpendLimit) {
    return {
      ok: false,
      reason: `Daily spend limit $${policy.dailySpendLimit} would be exceeded ($${spentToday.toFixed(2)} already spent today)`,
      policy,
    };
  }

  const last = lastExecutedMirror(input.userId);
  if (last) {
    const cooldownMs = policy.mirrorCooldownMinutes * 60 * 1000;
    const elapsed = Date.now() - last.createdAt;
    if (elapsed < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - elapsed) / 60_000);
      return {
        ok: false,
        reason: `Cooldown active — ${remaining} min remaining (cooldown is ${policy.mirrorCooldownMinutes} min)`,
        policy,
      };
    }
  }

  return { ok: true, policy, amountUsd: cappedAmount };
}

export function formatPolicy(p: UserPolicy): string {
  return [
    `*Mirror policy* ⚙️`,
    `• Max per trade: *$${p.maxMirrorUsd}*`,
    `• Allowed chains: *${p.allowedChains.join(", ") || "(none)"}*`,
    `• Max slippage: *${p.maxSlippage}%*`,
    `• Daily spend limit: *$${p.dailySpendLimit}*`,
    `• Cooldown: *${p.mirrorCooldownMinutes} min*`,
    `• Auto-mirror: *${p.autoMirror ? "ON" : "OFF"}*`,
  ].join("\n");
}
