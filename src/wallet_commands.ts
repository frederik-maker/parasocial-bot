/**
 * Telegram handlers for wallet UX: /wallet /balance /withdraw /export_key.
 * Mirror execution lives in mirror.ts — these commands are for onboarding
 * and self-custody ergonomics.
 */
import { Bot, InlineKeyboard } from "grammy";
import { encodeFunctionData, isAddress, parseAbi, parseUnits } from "viem";
import type { Address, Hex } from "viem";
import { addressUrl, chainOf, CHAINS, txUrl } from "./chains.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { readErc20Balance, readNativeBalance, sendRawTx } from "./signer.js";
import {
  readSolBalanceLamports,
  readSplBalance,
  withdrawSol,
  withdrawUsdc as withdrawSolUsdc,
} from "./signer_sol.js";
import {
  exportUserPrivateKey,
  exportUserSolPrivateKey,
  getOrCreateUserSolanaWallet,
  getOrCreateUserWallet,
  getUserAccountIfExists,
  getUserSolAccountIfExists,
} from "./wallet.js";
import { escapeMd, shortAddr } from "./format.js";

const ERC20_TRANSFER_ABI = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

function fmtAmount(wei: bigint, decimals: number): string {
  if (wei === 0n) return "0";
  const divisor = 10n ** BigInt(decimals);
  const whole = wei / divisor;
  const frac = wei % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr.slice(0, 6)}` : whole.toString();
}

export function registerWalletCommands(bot: Bot): void {
  bot.command("wallet", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    const evm = getOrCreateUserWallet(userId);
    const hasSolanaAllowed = config.defaults.allowedChains.includes("solana");
    const sol = hasSolanaAllowed ? getOrCreateUserSolanaWallet(userId) : null;

    const evmChainsText = config.defaults.allowedChains
      .filter((c) => CHAINS[c]?.kind === "evm")
      .map((c) => {
        const cc = CHAINS[c];
        if (cc?.kind !== "evm") return "";
        return `• *${cc.name}* — USDC: \`${cc.usdc}\``;
      })
      .filter(Boolean)
      .join("\n");

    const lines: string[] = [];
    lines.push(`*Your EVM deposit address*`, `\`${evm.address}\``, ``);
    if (sol) {
      lines.push(`*Your Solana deposit address*`, `\`${sol.address}\``, ``);
    }
    lines.push(
      `Send *USDC* — or just *ETH / SOL* — to your address on any allowed chain.`,
      `The bot picks the best source at trade time; a tiny gas reserve is kept aside.`,
      ``,
      evmChainsText,
    );
    if (hasSolanaAllowed) {
      const sc = CHAINS["solana"];
      if (sc?.kind === "solana") lines.push(`• *Solana* — USDC: \`${sc.usdcMint}\``);
    }
    lines.push(
      ``,
      `/balance — check funds · /withdraw — send funds out · /export\\_key — reveal keys`,
    );

    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  });

  bot.command("balance", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    const evm = getUserAccountIfExists(userId);
    const sol = getUserSolAccountIfExists(userId);
    if (!evm && !sol) {
      await ctx.reply("No wallet yet — run /wallet first.");
      return;
    }

    const lines: string[] = [`*Balances*`, ``];
    if (evm) lines.push(`EVM: \`${evm.address}\``);
    if (sol) lines.push(`SOL: \`${sol.address}\``);
    lines.push(``);

    for (const id of config.defaults.allowedChains) {
      const chain = chainOf(id);
      try {
        if (chain.kind === "evm" && evm) {
          const [usdc, native] = await Promise.all([
            readErc20Balance(id, chain.usdc, evm.address),
            readNativeBalance(id, evm.address),
          ]);
          lines.push(
            `*${chain.name}* — ${fmtAmount(usdc, 6)} USDC · ${fmtAmount(native, 18)} ${chain.nativeSymbol}`,
          );
        } else if (chain.kind === "solana" && sol) {
          const [usdc, native] = await Promise.all([
            readSplBalance(sol.address, chain.usdcMint),
            readSolBalanceLamports(sol.address),
          ]);
          lines.push(
            `*${chain.name}* — ${fmtAmount(usdc, 6)} USDC · ${fmtAmount(native, 9)} SOL`,
          );
        }
      } catch (err) {
        lines.push(`*${chain.name}* — _rpc error: ${(err as Error).message.slice(0, 60)}_`);
      }
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  });

  bot.command("withdraw", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    const raw = (ctx.match ?? "").trim();
    const parts = raw.split(/\s+/);
    if (parts.length !== 4) {
      await ctx.reply(
        "Usage: `/withdraw <USDC|ETH|SOL> <amount> <chain> <dest>`\nExamples:\n• `/withdraw USDC 10 base 0x123…`\n• `/withdraw SOL 0.1 solana 5xYq…`",
        { parse_mode: "Markdown" },
      );
      return;
    }
    const [symRaw, amtStr, chainId, destRaw] = parts;
    if (!symRaw || !amtStr || !chainId || !destRaw) {
      await ctx.reply("Usage: `/withdraw <USDC|ETH|SOL> <amount> <chain> <dest>`", {
        parse_mode: "Markdown",
      });
      return;
    }
    const sym = symRaw.toUpperCase();
    if (!config.defaults.allowedChains.includes(chainId)) {
      await ctx.reply(
        `Chain "${chainId}" not allowed. Allowed: ${config.defaults.allowedChains.join(", ")}`,
      );
      return;
    }
    const chain = chainOf(chainId);

    try {
      if (chain.kind === "solana") {
        const sol = getUserSolAccountIfExists(userId);
        if (!sol) {
          await ctx.reply("No Solana wallet yet — run /wallet first.");
          return;
        }
        await ctx.reply(`Preparing ${amtStr} ${sym} withdrawal on Solana…`);
        if (sym === "USDC") {
          const amount = BigInt(Math.floor(Number(amtStr) * 1_000_000));
          const result = await withdrawSolUsdc(sol, destRaw, amount, chain.usdcMint, 6);
          await ctx.reply(
            `✅ Sent *${amtStr} USDC* to \`${destRaw}\`\n[tx ↗](${txUrl("solana", result.hash)})`,
            { parse_mode: "Markdown", link_preview_options: { is_disabled: true } },
          );
        } else if (sym === "SOL") {
          const lamports = BigInt(Math.floor(Number(amtStr) * 1_000_000_000));
          const result = await withdrawSol(sol, destRaw, lamports);
          await ctx.reply(
            `✅ Sent *${amtStr} SOL* to \`${destRaw}\`\n[tx ↗](${txUrl("solana", result.hash)})`,
            { parse_mode: "Markdown", link_preview_options: { is_disabled: true } },
          );
        } else {
          await ctx.reply(`Unsupported asset on Solana: ${sym}. Use USDC or SOL.`);
        }
        return;
      }

      // EVM path
      const dest = destRaw as `0x${string}`;
      if (!isAddress(dest)) {
        await ctx.reply("Destination is not a valid EVM address.");
        return;
      }
      const account = getUserAccountIfExists(userId);
      if (!account) {
        await ctx.reply("No wallet yet — run /wallet first.");
        return;
      }
      await ctx.reply(`Preparing ${amtStr} ${sym} withdrawal on ${chain.name}…`);
      if (sym === "USDC") {
        const amount = parseUnits(amtStr, 6);
        const data: Hex = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [dest, amount],
        });
        const result = await sendRawTx(account, chainId, {
          to: chain.usdc,
          data,
          value: 0n,
        });
        if (result.status !== "success") {
          await ctx.reply(`Withdrawal reverted: ${txUrl(chainId, result.hash)}`);
          return;
        }
        await ctx.reply(
          `✅ Sent *${amtStr} USDC* to \`${dest}\`\n[tx ↗](${txUrl(chainId, result.hash)})`,
          { parse_mode: "Markdown", link_preview_options: { is_disabled: true } },
        );
      } else if (sym === "ETH" || sym === chain.nativeSymbol) {
        const amount = parseUnits(amtStr, 18);
        const result = await sendRawTx(account, chainId, {
          to: dest as Address,
          data: "0x" as Hex,
          value: amount,
          gas: 21_000n,
        });
        if (result.status !== "success") {
          await ctx.reply(`Withdrawal reverted: ${txUrl(chainId, result.hash)}`);
          return;
        }
        await ctx.reply(
          `✅ Sent *${amtStr} ${chain.nativeSymbol}* to \`${dest}\`\n[tx ↗](${txUrl(chainId, result.hash)})`,
          { parse_mode: "Markdown", link_preview_options: { is_disabled: true } },
        );
      } else {
        await ctx.reply(`Unsupported asset for withdraw: ${sym}. Only USDC and native gas supported.`);
      }
    } catch (err) {
      logger.error(`withdraw failed`, err);
      await ctx.reply(`Withdrawal failed: ${(err as Error).message}`);
    }
  });

  // Safety-gated key export. Flow:
  //   1st /export_key → show warning + button "I understand, reveal"
  //   2nd tap          → DM the key, delete after 60s
  const pendingExports = new Map<number, number>();

  bot.command("export_key", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;
    if (ctx.chat?.type !== "private") {
      await ctx.reply("For your own safety, /export\\_key only works in a direct DM with the bot.", {
        parse_mode: "Markdown",
      });
      return;
    }
    const account = getUserAccountIfExists(userId);
    if (!account) {
      await ctx.reply("No wallet yet — run /wallet first.");
      return;
    }
    pendingExports.set(userId, Date.now());
    const kb = new InlineKeyboard().text("⚠️ I understand, reveal my key", `exp:${userId}`);
    await ctx.reply(
      [
        `*Reveal private key?*`,
        ``,
        `Anyone with this key can drain all your funds on every chain.`,
        `Copy it to a secure place *immediately* and delete the message.`,
        ``,
        `Address: \`${account.address}\``,
      ].join("\n"),
      { parse_mode: "Markdown", reply_markup: kb },
    );
  });

  bot.callbackQuery(/^exp:(\d+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    const wantUser = Number(ctx.match![1]);
    if (userId !== wantUser) {
      await ctx.answerCallbackQuery({ text: "Not yours.", show_alert: true });
      return;
    }
    const requested = pendingExports.get(userId);
    if (!requested || Date.now() - requested > 5 * 60 * 1000) {
      await ctx.answerCallbackQuery({ text: "Request expired. Run /export_key again." });
      return;
    }
    pendingExports.delete(userId);
    const evmPk = exportUserPrivateKey(userId);
    const solPk = exportUserSolPrivateKey(userId);
    if (!evmPk && !solPk) {
      await ctx.answerCallbackQuery({ text: "No wallet found." });
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    const lines: string[] = [];
    if (evmPk) lines.push(`EVM key:\n<code>${evmPk}</code>`);
    if (solPk) lines.push(`Solana key (base58):\n<code>${solPk}</code>`);
    lines.push(`\n(auto-deletes in 60s)`);
    const msg = await ctx.reply(lines.join("\n\n"), { parse_mode: "HTML" });
    setTimeout(() => {
      ctx.api
        .deleteMessage(msg.chat.id, msg.message_id)
        .catch((err) => logger.warn(`key auto-delete failed: ${err.message}`));
    }, 60_000);
  });
}

export function userAddressSummary(userId: number): string {
  const account = getUserAccountIfExists(userId);
  if (!account) return "No wallet yet — run /wallet.";
  return `Wallet: \`${shortAddr(account.address)}\` · [explorer](${addressUrl(config.defaults.allowedChains[0] ?? "ethereum", account.address)})`;
}
