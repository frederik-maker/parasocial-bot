import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number, got "${v}"`);
  return n;
}

function list(name: string, fallback: string[] = []): string[] {
  const v = process.env[name];
  if (!v) return fallback;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  telegramToken: required("TELEGRAM_BOT_TOKEN"),
  zerionApiKey: required("ZERION_API_KEY"),
  masterSecret: required("MASTER_SECRET"),
  zerionCliBin: process.env.ZERION_CLI_BIN ?? "",
  rpcOverrides: {
    ethereum: process.env.RPC_ETHEREUM,
    base: process.env.RPC_BASE,
    arbitrum: process.env.RPC_ARBITRUM,
    optimism: process.env.RPC_OPTIMISM,
    polygon: process.env.RPC_POLYGON,
  } as Record<string, string | undefined>,
  solanaRpcUrl: process.env.RPC_SOLANA ?? "https://api.mainnet-beta.solana.com",
  defaults: {
    maxMirrorUsd: num("MAX_MIRROR_USD", 50),
    allowedChains: list("ALLOWED_CHAINS", ["ethereum", "base"]),
    maxSlippage: num("MAX_SLIPPAGE", 0.5),
    dailySpendLimit: num("DAILY_SPEND_LIMIT", 200),
    mirrorCooldownMinutes: num("MIRROR_COOLDOWN_MINUTES", 30),
  },
  pollIntervalMinutes: num("POLL_INTERVAL_MINUTES", 5),
  adminUserIds: list("ADMIN_USER_IDS").map((s) => Number(s)).filter((n) => !Number.isNaN(n)),
  dbPath: process.env.DB_PATH ?? "./data/parasocial.db",
} as const;

export type Config = typeof config;
