/**
 * /dca Telegram commands — create, list, cancel recurring USDC→asset buys.
 */
import type { Bot } from "grammy";
import { chainOf, CHAINS, txUrl } from "./chains.js";
import { config } from "./config.js";
import { deactivateDca, insertDcaPlan, listUserDca } from "./db.js";
import { describeInterval, onDcaTick, parseInterval, intervalToMinutes } from "./dca.js";
import { escapeMd, fmtUsd } from "./format.js";
import { logger } from "./logger.js";

export function registerDcaCommands(bot: Bot): void {
  bot.command("dca", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    const raw = (ctx.match ?? "").trim();
    const parts = raw.split(/\s+/).filter(Boolean);

    // /dca list
    if (parts[0]?.toLowerCase() === "list") {
      const plans = listUserDca(userId);
      if (plans.length === 0) {
        await ctx.reply("No DCA plans. Set one up with `/dca <asset> <usd> <interval> <chain>`.", {
          parse_mode: "Markdown",
        });
        return;
      }
      const lines = plans.map((p) => {
        const when = p.active
          ? `next ${new Date(p.nextRunAt).toISOString().replace("T", " ").slice(0, 16)}`
          : `cancelled`;
        return `• *#${p.id}* — ${fmtUsd(p.usdAmount)} → *${escapeMd(p.asset)}* on ${p.chain}, ${describeInterval(p.intervalMinutes)} — _${when}_`;
      });
      await ctx.reply(`*Your DCA plans*\n${lines.join("\n")}`, { parse_mode: "Markdown" });
      return;
    }

    // /dca cancel <id>
    if (parts[0]?.toLowerCase() === "cancel") {
      const id = Number(parts[1]);
      if (!id) {
        await ctx.reply("Usage: `/dca cancel <id>`", { parse_mode: "Markdown" });
        return;
      }
      const ok = deactivateDca(id, userId);
      await ctx.reply(ok ? `Cancelled DCA #${id}.` : `No DCA #${id} found for you.`);
      return;
    }

    // /dca <asset> <usd> <interval> <chain>
    if (parts.length !== 4) {
      await ctx.reply(
        [
          "*DCA — dollar-cost average*",
          "",
          "`/dca <asset> <usd> <interval> <chain>` — create a plan",
          "`/dca list` — show your plans",
          "`/dca cancel <id>` — stop a plan",
          "",
          "*Intervals:* `hourly` · `daily` · `weekly` · `30m` · `6h` · `3d`",
          "*Examples:*",
          "• `/dca ETH 25 daily base` — $25 into ETH every 24h on base",
          "• `/dca SOL 10 6h solana` — $10 into SOL every 6 hours",
          "",
          "_Each tick is gated by your /settings policy: max $/trade, daily cap,_",
          "_chain lock, slippage cap, cooldown. Ticks that violate policy are_",
          "_skipped — the schedule keeps running._",
        ].join("\n"),
        { parse_mode: "Markdown" },
      );
      return;
    }

    const [assetRaw, usdRaw, intervalRaw, chainId] = parts;
    if (!assetRaw || !usdRaw || !intervalRaw || !chainId) return;

    const asset = assetRaw.toUpperCase();
    const usdAmount = Number(usdRaw);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      await ctx.reply(`Invalid USD amount: "${usdRaw}".`);
      return;
    }
    const spec = parseInterval(intervalRaw);
    if (!spec) {
      await ctx.reply(`Invalid interval "${intervalRaw}". Try: daily, weekly, 6h, 30m, 3d.`);
      return;
    }
    if (!config.defaults.allowedChains.includes(chainId)) {
      await ctx.reply(
        `Chain "${chainId}" not allowed. Allowed: ${config.defaults.allowedChains.join(", ")}`,
      );
      return;
    }
    const chain = chainOf(chainId);
    if (usdAmount > config.defaults.maxMirrorUsd * 10) {
      await ctx.reply(
        `Per-tick amount $${usdAmount} is too large. Your policy caps single trades at $${config.defaults.maxMirrorUsd} — each tick will be capped to that.`,
      );
    }

    const intervalMinutes = intervalToMinutes(spec);
    if (intervalMinutes < 1) {
      await ctx.reply("Interval must be at least 1 minute.");
      return;
    }

    const now = Date.now();
    const plan = insertDcaPlan({
      userId,
      asset,
      chain: chainId,
      usdAmount,
      intervalMinutes,
      nextRunAt: now + 10_000, // first tick in ~10s so the user sees it fire
      createdAt: now,
    });

    await ctx.reply(
      [
        `✅ *DCA plan #${plan.id} created*`,
        `${fmtUsd(plan.usdAmount)} → *${escapeMd(plan.asset)}* on *${chain.name}*`,
        `${describeInterval(plan.intervalMinutes)} · first tick in ~10 seconds`,
        ``,
        `_Your scoped policy still applies — /settings to review caps._`,
        `_/dca list to review, /dca cancel ${plan.id} to stop._`,
      ].join("\n"),
      { parse_mode: "Markdown" },
    );
  });

  // Notify the user whenever a tick fires.
  onDcaTick(async (plan, outcome) => {
    const chain = CHAINS[plan.chain];
    try {
      if (outcome.status === "executed") {
        const hash = outcome.txHash ?? "";
        const url = hash ? txUrl(plan.chain, hash) : "";
        await bot.api.sendMessage(
          plan.userId,
          `🤖 *DCA #${plan.id}* bought *${fmtUsd(outcome.usdAmount ?? plan.usdAmount)}* of *${escapeMd(plan.asset)}* on *${chain?.name ?? plan.chain}*` +
            (url ? `\n[tx ↗](${url})` : ""),
          { parse_mode: "Markdown", link_preview_options: { is_disabled: true } },
        );
      } else if (outcome.status === "rejected" || outcome.status === "skipped") {
        await bot.api.sendMessage(
          plan.userId,
          `⏭ *DCA #${plan.id}* skipped this tick: ${outcome.reason ?? "(no reason)"}\nSchedule still active — next tick scheduled.`,
          { parse_mode: "Markdown" },
        );
      } else {
        await bot.api.sendMessage(
          plan.userId,
          `❌ *DCA #${plan.id}* failed: ${outcome.reason ?? "(unknown)"}\nSchedule still active.`,
          { parse_mode: "Markdown" },
        );
      }
    } catch (err) {
      logger.warn(`failed to notify user ${plan.userId} of DCA outcome: ${(err as Error).message}`);
    }
  });
}
