import { Bot, InlineKeyboard } from "grammy";
import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import {
  addWatch,
  allWatches,
  getPolicy,
  listWatches,
  removeWatch,
  savePendingAlert,
  savePolicy,
  takePendingAlert,
} from "./db.js";
import { computeCredibility } from "./credibility.js";
import { alertMessage, escapeMd, fmtUsd, scoreBreakdown, shortAddr } from "./format.js";
import { logger } from "./logger.js";
import { mirrorTrade } from "./mirror.js";
import { formatPolicy } from "./policies.js";
import { registerDcaCommands } from "./dca_commands.js";
import { registerWalletCommands } from "./wallet_commands.js";
import { getUserAccountIfExists } from "./wallet.js";
import { addressUrl, txUrl } from "./chains.js";
import type { DetectedTrade } from "./types.js";

export const bot = new Bot(config.telegramToken);

bot.use(async (ctx, next) => {
  const who = ctx.from?.username ?? ctx.from?.id ?? "?";
  const what = ctx.message?.text ?? ctx.callbackQuery?.data ?? "(non-text)";
  logger.info(`← ${who}: ${what}`);
  await next();
});

const ADDR_RE = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;

function assertAllowedUser(userId: number | undefined): boolean {
  if (config.adminUserIds.length === 0) return true;
  return userId !== undefined && config.adminUserIds.includes(userId);
}

// ── commands ──────────────────────────────────────────────

bot.command("start", async (ctx) => {
  await ctx.reply(
    [
      "<b>Parasocial</b> 🧠 — copy-trade smart money with credibility scoring.",
      "",
      "<b>Setup</b>",
      "1. /wallet — generate your custodial wallet (1 sec, no keys to manage)",
      "2. Send USDC + a little ETH for gas on <b>base</b>",
      "3. /watch 0x… to start tracking a trader",
      "",
      "<b>Commands</b>",
      "• /watch 0x… [label] — track a wallet",
      "• /unwatch 0x… — stop tracking",
      "• /list — your watched wallets",
      "• /stats 0x… — credibility report",
      "• /wallet — deposit address",
      "• /balance — check funds",
      "• /withdraw USDC 10 base 0x… — move funds out",
      "• /export_key — reveal private key (DM only)",
      "• /dca ETH 25 daily base — auto-buy on a schedule",
      "• /settings — scoped mirror policy",
    ].join("\n"),
    { parse_mode: "HTML" },
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "When a watched wallet trades, you'll get an alert with their credibility score",
      "and a *Mirror* button that swaps USDC → the asset they bought — capped by your",
      "scoped policy (max per trade, daily limit, chain lock, slippage, cooldown).",
      "",
      "The bot uses a per-user custodial wallet. You hold the keys — /export_key",
      "reveals them, /withdraw moves funds out. No CLI, no seed phrases to manage.",
      "",
      "Chains: " + config.defaults.allowedChains.join(", "),
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
});

registerWalletCommands(bot);
registerDcaCommands(bot);

bot.command("watch", async (ctx) => {
  if (!assertAllowedUser(ctx.from?.id)) return;
  const parts = (ctx.match ?? "").trim().split(/\s+/);
  const addr = parts[0];
  const label = parts.slice(1).join(" ") || null;
  if (!addr || !ADDR_RE.test(addr)) {
    await ctx.reply("Usage: `/watch <0xEVM or SolanaAddress> [label]`", { parse_mode: "Markdown" });
    return;
  }
  addWatch(ctx.from!.id, addr, label);
  await ctx.reply(
    `Watching *${escapeMd(label ?? shortAddr(addr))}* — new trades on ${config.defaults.allowedChains.join("/")} will be polled every ${config.pollIntervalMinutes} min.`,
    { parse_mode: "Markdown" },
  );
});

bot.command("unwatch", async (ctx) => {
  if (!assertAllowedUser(ctx.from?.id)) return;
  const addr = (ctx.match ?? "").trim();
  if (!ADDR_RE.test(addr)) {
    await ctx.reply("Usage: `/unwatch <0xEVM or SolanaAddress>`", { parse_mode: "Markdown" });
    return;
  }
  const removed = removeWatch(ctx.from!.id, addr);
  await ctx.reply(removed ? `Unwatched ${shortAddr(addr)}.` : `Not in your watchlist.`);
});

bot.command("list", async (ctx) => {
  if (!assertAllowedUser(ctx.from?.id)) return;
  const rows = listWatches(ctx.from!.id);
  if (rows.length === 0) {
    await ctx.reply("Watchlist empty — add one with `/watch 0x…`.", { parse_mode: "Markdown" });
    return;
  }
  const lines = rows.map((w) => `• \`${w.address}\`${w.label ? ` — ${escapeMd(w.label)}` : ""}`);
  await ctx.reply(`*Watching ${rows.length} wallets*\n${lines.join("\n")}`, { parse_mode: "Markdown" });
});

bot.command("stats", async (ctx) => {
  if (!assertAllowedUser(ctx.from?.id)) return;
  const addr = (ctx.match ?? "").trim();
  if (!ADDR_RE.test(addr)) {
    await ctx.reply("Usage: `/stats <0xEVM or SolanaAddress>`", { parse_mode: "Markdown" });
    return;
  }
  await ctx.reply("Fetching PnL…");
  try {
    const score = await computeCredibility({ address: addr });
    await ctx.reply(scoreBreakdown(score, addr), { parse_mode: "Markdown" });
  } catch (err) {
    logger.error("stats failed", err);
    await ctx.reply(
      `Couldn't fetch credibility: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

bot.command("settings", async (ctx) => {
  if (!assertAllowedUser(ctx.from?.id)) return;
  const policy = getPolicy(ctx.from!.id);
  const kb = new InlineKeyboard()
    .text("Max/trade −10", "pol:max:-10")
    .text("Max/trade +10", "pol:max:+10")
    .row()
    .text("Daily −50", "pol:daily:-50")
    .text("Daily +50", "pol:daily:+50")
    .row()
    .text("Cooldown −15m", "pol:cool:-15")
    .text("Cooldown +15m", "pol:cool:+15")
    .row()
    .text(`Auto-mirror: ${policy.autoMirror ? "ON" : "OFF"}`, "pol:auto:toggle");
  await ctx.reply(formatPolicy(policy), { parse_mode: "Markdown", reply_markup: kb });
});

// ── policy callback handlers ──────────────────────────────

bot.callbackQuery(/^pol:(max|daily|cool|auto):(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  if (userId === undefined || !assertAllowedUser(userId)) {
    await ctx.answerCallbackQuery({ text: "Not allowed." });
    return;
  }
  const [, field, raw] = ctx.match!;
  if (!field || !raw) {
    await ctx.answerCallbackQuery();
    return;
  }
  const policy = getPolicy(userId);
  if (field === "max") {
    policy.maxMirrorUsd = Math.max(1, policy.maxMirrorUsd + Number(raw));
  } else if (field === "daily") {
    policy.dailySpendLimit = Math.max(10, policy.dailySpendLimit + Number(raw));
  } else if (field === "cool") {
    policy.mirrorCooldownMinutes = Math.max(0, policy.mirrorCooldownMinutes + Number(raw));
  } else if (field === "auto") {
    policy.autoMirror = !policy.autoMirror;
  }
  savePolicy(policy);

  const kb = new InlineKeyboard()
    .text("Max/trade −10", "pol:max:-10")
    .text("Max/trade +10", "pol:max:+10")
    .row()
    .text("Daily −50", "pol:daily:-50")
    .text("Daily +50", "pol:daily:+50")
    .row()
    .text("Cooldown −15m", "pol:cool:-15")
    .text("Cooldown +15m", "pol:cool:+15")
    .row()
    .text(`Auto-mirror: ${policy.autoMirror ? "ON" : "OFF"}`, "pol:auto:toggle");

  await ctx.editMessageText(formatPolicy(policy), { parse_mode: "Markdown", reply_markup: kb });
  await ctx.answerCallbackQuery({ text: "Updated." });
});

// ── mirror / skip / info callbacks ────────────────────────

bot.callbackQuery(/^mir:(.+)$/, async (ctx) => {
  const token = ctx.match![1];
  if (!token) {
    await ctx.answerCallbackQuery();
    return;
  }
  const pending = takePendingAlert(token);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: "This alert expired.", show_alert: true });
    return;
  }
  if (pending.userId !== ctx.from?.id) {
    await ctx.answerCallbackQuery({ text: "Not your alert.", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery({ text: "Mirroring…" });
  await ctx.editMessageReplyMarkup({ reply_markup: undefined });

  const result = await mirrorTrade({
    userId: pending.userId,
    sourceAddress: pending.sourceAddress,
    sourceTxHash: pending.sourceTxHash,
    asset: pending.asset,
    chain: pending.chain,
    usdAmount: pending.usdValue,
    direction: pending.direction,
  });

  if (result.status === "executed") {
    const explorerUrl = txUrl(result.chain, result.txHash!);
    await ctx.reply(
      `✅ Mirrored *${fmtUsd(result.usdAmount)}* into *${escapeMd(result.asset)}* on ${result.chain}\n[tx ↗](${explorerUrl})`,
      { parse_mode: "Markdown", link_preview_options: { is_disabled: true } },
    );
  } else if (result.status === "skipped") {
    await ctx.reply(`⏭  Skipped (${result.reason})`);
  } else if (result.status === "rejected") {
    await ctx.reply(`🛡  Blocked by policy: ${result.reason}`);
  } else {
    await ctx.reply(`❌ Mirror failed: ${result.reason ?? "unknown"}`);
  }
});

bot.callbackQuery(/^skip:(.+)$/, async (ctx) => {
  const token = ctx.match![1];
  if (token) takePendingAlert(token);
  await ctx.answerCallbackQuery({ text: "Skipped." });
  await ctx.editMessageReplyMarkup({ reply_markup: undefined });
});

bot.callbackQuery(/^info:(.+)$/, async (ctx) => {
  const token = ctx.match![1];
  if (!token) {
    await ctx.answerCallbackQuery();
    return;
  }
  const pending = takePendingAlert(token);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: "This alert expired." });
    return;
  }
  savePendingAlert(pending); // put it back — info doesn't consume
  await ctx.answerCallbackQuery();
  try {
    const score = await computeCredibility({ address: pending.sourceAddress, asset: pending.asset });
    await ctx.reply(scoreBreakdown(score, pending.sourceAddress), { parse_mode: "Markdown" });
  } catch (err) {
    await ctx.reply(`Couldn't load breakdown: ${err instanceof Error ? err.message : err}`);
  }
});

// ── send alert (called from poller) ───────────────────────

export async function sendTradeAlert(opts: {
  userId: number;
  address: string;
  label: string | null;
  trade: DetectedTrade;
}): Promise<void> {
  try {
    const score = await computeCredibility({
      address: opts.address,
      asset: opts.trade.asset,
    });

    const token = randomBytes(8).toString("hex");
    savePendingAlert({
      token,
      userId: opts.userId,
      sourceAddress: opts.address,
      sourceTxHash: opts.trade.txHash,
      asset: opts.trade.asset,
      chain: opts.trade.chain,
      usdValue: opts.trade.usdValue,
      direction: opts.trade.direction,
      createdAt: Date.now(),
    });

    const policy = getPolicy(opts.userId);
    const mirrorAmt = Math.min(opts.trade.usdValue, policy.maxMirrorUsd);
    const kb = new InlineKeyboard()
      .text(`✅ Mirror ${fmtUsd(mirrorAmt)}`, `mir:${token}`)
      .text("❌ Skip", `skip:${token}`)
      .row()
      .text("📊 More info", `info:${token}`);

    await bot.api.sendMessage(
      opts.userId,
      alertMessage({
        address: opts.address,
        label: opts.label,
        direction: opts.trade.direction,
        trade: opts.trade,
        score,
      }),
      { parse_mode: "Markdown", reply_markup: kb },
    );

    if (policy.autoMirror && opts.trade.direction === "buy") {
      const result = await mirrorTrade({
        userId: opts.userId,
        sourceAddress: opts.address,
        sourceTxHash: opts.trade.txHash,
        asset: opts.trade.asset,
        chain: opts.trade.chain,
        usdAmount: opts.trade.usdValue,
        direction: opts.trade.direction,
      });
      if (result.status === "executed") {
        const url = txUrl(result.chain, result.txHash!);
        await bot.api.sendMessage(
          opts.userId,
          `🤖 Auto-mirrored *${fmtUsd(result.usdAmount)}* → *${escapeMd(result.asset)}*\n[tx ↗](${url})`,
          { parse_mode: "Markdown", link_preview_options: { is_disabled: true } },
        );
      } else if (result.status !== "skipped") {
        await bot.api.sendMessage(
          opts.userId,
          `🤖 Auto-mirror ${result.status}: ${result.reason ?? ""}`,
        );
      }
    }
  } catch (err) {
    logger.error(`sendTradeAlert for user ${opts.userId}`, err);
  }
}

bot.catch((err) => {
  const req = err.ctx?.update;
  logger.error(
    `bot error on update ${req?.update_id} (${req?.message?.text ?? req?.callback_query?.data ?? "?"}): ${err.error instanceof Error ? err.error.message : String(err.error)}`,
  );
});

export function uniqueUsersBeingWatched(): Set<number> {
  return new Set(allWatches().map((w) => w.userId));
}
