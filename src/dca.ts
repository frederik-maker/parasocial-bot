/**
 * DCA — dollar-cost average into an asset on a recurring schedule.
 * Every tick reuses the same mirror/buy pipeline, so scoped policies
 * (max $/trade, daily cap, cooldown, chain lock, slippage) apply equally.
 */
import { advanceDcaRun, dueDcaPlans, type DcaPlan } from "./db.js";
import { logger } from "./logger.js";
import { buyAssetWithUsdc } from "./mirror.js";

export type IntervalSpec =
  | { kind: "minutes"; minutes: number }
  | { kind: "daily" }
  | { kind: "weekly" }
  | { kind: "hourly" };

export function parseInterval(raw: string): IntervalSpec | null {
  const s = raw.trim().toLowerCase();
  if (s === "daily" || s === "day" || s === "1d") return { kind: "daily" };
  if (s === "weekly" || s === "week" || s === "1w") return { kind: "weekly" };
  if (s === "hourly" || s === "hour" || s === "1h") return { kind: "hourly" };

  const m = s.match(/^(\d+)\s*(m|min|mins|h|hr|hrs|d|day|days|w|week|weeks)$/);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2]!;
    if (unit.startsWith("m")) return { kind: "minutes", minutes: n };
    if (unit.startsWith("h")) return { kind: "minutes", minutes: n * 60 };
    if (unit.startsWith("d")) return { kind: "minutes", minutes: n * 60 * 24 };
    if (unit.startsWith("w")) return { kind: "minutes", minutes: n * 60 * 24 * 7 };
  }
  return null;
}

export function intervalToMinutes(spec: IntervalSpec): number {
  switch (spec.kind) {
    case "daily":
      return 60 * 24;
    case "weekly":
      return 60 * 24 * 7;
    case "hourly":
      return 60;
    case "minutes":
      return spec.minutes;
  }
}

export function describeInterval(minutes: number): string {
  if (minutes % (60 * 24 * 7) === 0) return `every ${minutes / (60 * 24 * 7)}w`;
  if (minutes % (60 * 24) === 0) return `every ${minutes / (60 * 24)}d`;
  if (minutes % 60 === 0) return `every ${minutes / 60}h`;
  return `every ${minutes}m`;
}

export type DcaListener = (plan: DcaPlan, outcome: { status: string; txHash?: string | null; reason?: string | null; usdAmount?: number }) => void | Promise<void>;

const listeners: DcaListener[] = [];
export function onDcaTick(l: DcaListener): void {
  listeners.push(l);
}

async function runOnePlan(plan: DcaPlan): Promise<void> {
  logger.info(`DCA tick #${plan.id}: ${plan.usdAmount} USDC → ${plan.asset} on ${plan.chain} (user ${plan.userId})`);
  const result = await buyAssetWithUsdc({
    userId: plan.userId,
    asset: plan.asset,
    chain: plan.chain,
    usdAmount: plan.usdAmount,
    sourceAddress: `dca#${plan.id}`,
    sourceTxHash: `dca-${plan.id}-${Date.now()}`,
  });
  const now = Date.now();
  const nextRunAt = now + plan.intervalMinutes * 60 * 1000;
  advanceDcaRun(plan.id, now, nextRunAt);

  for (const l of listeners) {
    try {
      await l(plan, {
        status: result.status,
        txHash: result.txHash,
        reason: result.reason,
        usdAmount: result.usdAmount,
      });
    } catch (err) {
      logger.warn(`DCA listener threw: ${(err as Error).message}`);
    }
  }
}

async function tick(): Promise<void> {
  const due = dueDcaPlans(Date.now());
  if (due.length === 0) return;
  for (const plan of due) {
    try {
      await runOnePlan(plan);
    } catch (err) {
      logger.error(`DCA plan #${plan.id} fatal`, err);
      // Still advance so we don't retry the same plan every 30s forever on a bug.
      advanceDcaRun(plan.id, Date.now(), Date.now() + plan.intervalMinutes * 60 * 1000);
    }
  }
}

export function startDcaScheduler(): () => void {
  let running = false;
  const handle = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } finally {
      running = false;
    }
  }, 30_000); // 30-sec resolution — good enough for "every N minutes"
  logger.info(`DCA scheduler started (30s tick)`);
  return () => clearInterval(handle);
}
