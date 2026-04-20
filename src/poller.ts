import { sendTradeAlert } from "./bot.js";
import { config } from "./config.js";
import { extractTrades } from "./credibility.js";
import { allWatches, updateLastSeen } from "./db.js";
import { logger } from "./logger.js";
import { getHistory, ZerionError } from "./zerion.js";
import type { WatchedWallet } from "./types.js";

const MIN_USD = 50;

async function pollWallet(w: WatchedWallet): Promise<void> {
  try {
    const history = await getHistory(w.address, { limit: 15 });
    if (history.transactions.length === 0) return;

    const newestHash = history.transactions[0]?.hash;
    if (!newestHash) return;

    // Nothing to do on first poll — just remember where we are.
    if (!w.lastSeenTxHash) {
      updateLastSeen(w.userId, w.address, newestHash);
      logger.info(`Baselined ${w.address} for user ${w.userId} at ${newestHash.slice(0, 10)}`);
      return;
    }

    if (newestHash === w.lastSeenTxHash) return;

    // Gather txs up to (but not including) the last seen hash.
    const fresh = [];
    for (const tx of history.transactions) {
      if (tx.hash === w.lastSeenTxHash) break;
      fresh.push(tx);
    }

    if (fresh.length === 0) {
      updateLastSeen(w.userId, w.address, newestHash);
      return;
    }

    const trades = extractTrades(fresh).filter(
      (t) =>
        t.usdValue >= MIN_USD &&
        config.defaults.allowedChains.includes(t.chain),
    );

    logger.info(
      `user ${w.userId} wallet ${w.address}: ${fresh.length} new txs, ${trades.length} alertable trades`,
    );

    // Oldest-first so alerts arrive in chronological order.
    for (const trade of trades.reverse()) {
      trade.address = w.address;
      await sendTradeAlert({
        userId: w.userId,
        address: w.address,
        label: w.label,
        trade,
      });
    }

    updateLastSeen(w.userId, w.address, newestHash);
  } catch (err) {
    if (err instanceof ZerionError) {
      logger.warn(`poll ${w.address} failed: ${err.code} ${err.message}`);
    } else {
      logger.error(`poll ${w.address} failed`, err);
    }
  }
}

export async function pollAll(): Promise<void> {
  const watches = allWatches();
  if (watches.length === 0) return;
  logger.info(`Polling ${watches.length} watched wallets`);
  // Sequential to avoid hammering the API / exploding rate limits.
  for (const w of watches) {
    await pollWallet(w);
  }
}

export function startPoller(): () => void {
  const ms = config.pollIntervalMinutes * 60 * 1000;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pollAll();
    } finally {
      running = false;
    }
  };

  // Fire once shortly after boot, then on interval.
  setTimeout(tick, 3_000);
  const handle = setInterval(tick, ms);
  logger.info(`Poller started — every ${config.pollIntervalMinutes}m`);
  return () => clearInterval(handle);
}
