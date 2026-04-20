import { run } from "@grammyjs/runner";
import { bot } from "./bot.js";
import { startDcaScheduler } from "./dca.js";
import { logger } from "./logger.js";
import { startPoller } from "./poller.js";

async function main() {
  const runner = run(bot, {
    runner: { fetch: { allowed_updates: ["message", "callback_query"] } },
  });
  bot.api.getMe().then((me) => logger.info(`Telegram bot @${me.username} online (concurrent)`));
  const stopPoller = startPoller();
  const stopDca = startDcaScheduler();

  const shutdown = async (sig: string) => {
    logger.info(`Received ${sig} — shutting down`);
    stopPoller();
    stopDca();
    await runner.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("fatal", err);
  process.exit(1);
});
