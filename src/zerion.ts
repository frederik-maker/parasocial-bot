import { spawn } from "node:child_process";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { Address, HistoryResponse, PortfolioResponse } from "./types.js";

import { zerionThrottle } from "./throttle.js";

function cliCommand(): { cmd: string; prefix: string[] } {
  if (config.zerionCliBin) return { cmd: config.zerionCliBin, prefix: [] };
  return { cmd: "npx", prefix: ["--yes", "zerion-cli@latest"] };
}

interface RunOpts {
  timeoutMs?: number;
  env?: Record<string, string>;
}

export class ZerionError extends Error {
  constructor(public code: string, message: string, public raw?: unknown) {
    super(message);
    this.name = "ZerionError";
  }
}

async function runCli<T>(args: string[], opts: RunOpts = {}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await zerionThrottle(() => runCliNow<T>(args, opts));
    } catch (err) {
      lastErr = err;
      if (!(err instanceof ZerionError)) throw err;
      const msg = (err.message ?? "").toLowerCase();
      const retriable =
        msg.includes("503") ||
        msg.includes("502") ||
        msg.includes("504") ||
        msg.includes("timeout") ||
        err.code === "timeout";
      if (!retriable) throw err;
      const backoff = 1500 * (attempt + 1);
      logger.warn(`zerion ${args[0]} attempt ${attempt + 1} failed (${err.message}); retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

async function runCliNow<T>(args: string[], opts: RunOpts = {}): Promise<T> {
  const { cmd, prefix } = cliCommand();
  const fullArgs = [...prefix, ...args, "--json"];
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const env: NodeJS.ProcessEnv = { ...process.env, ...opts.env };
  if (config.zerionApiKey && !env.ZERION_API_KEY) env.ZERION_API_KEY = config.zerionApiKey;

  logger.debug(`zerion $ ${cmd} ${fullArgs.join(" ")}`);

  return new Promise<T>((resolve, reject) => {
    const child = spawn(cmd, fullArgs, { env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ZerionError("timeout", `zerion ${args[0]} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new ZerionError("spawn_error", err.message));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const raw = stdout.trim() || stderr.trim();
      if (!raw) {
        reject(new ZerionError("empty_output", `zerion ${args[0]} exited with code ${code} and no output`));
        return;
      }
      // Strip npm warnings/notices that bleed into stdout when NODE_ENV=production.
      const jsonStart = raw.search(/[{[]/);
      const text = jsonStart >= 0 ? raw.slice(jsonStart) : raw;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        reject(
          new ZerionError(
            "parse_error",
            `Failed to parse zerion output as JSON. First 200 chars: ${raw.slice(0, 200)}`,
          ),
        );
        return;
      }
      if (parsed && typeof parsed === "object" && "error" in parsed) {
        const err = (parsed as { error: { code?: string; message?: string } }).error;
        reject(new ZerionError(err.code ?? "zerion_error", err.message ?? "Unknown zerion error", parsed));
        return;
      }
      resolve(parsed as T);
    });
  });
}

// ── read ops ──────────────────────────────────────────────

export async function getHistory(
  address: Address,
  opts: { limit?: number; chain?: string } = {},
): Promise<HistoryResponse> {
  const args = ["history", address];
  if (opts.limit) args.push("--limit", String(opts.limit));
  if (opts.chain) args.push("--chain", opts.chain);
  return runCli<HistoryResponse>(args);
}

export async function getPortfolio(address: Address): Promise<PortfolioResponse> {
  return runCli<PortfolioResponse>(["portfolio", address]);
}
