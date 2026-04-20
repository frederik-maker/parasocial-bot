/* eslint-disable no-console */
type Level = "info" | "warn" | "error" | "debug";

const COLORS: Record<Level, string> = {
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  debug: "\x1b[90m",
};
const RESET = "\x1b[0m";

function log(level: Level, msg: string, extra?: unknown) {
  const ts = new Date().toISOString();
  const prefix = `${COLORS[level]}[${level.toUpperCase()}]${RESET} ${ts}`;
  if (extra !== undefined) console.log(prefix, msg, extra);
  else console.log(prefix, msg);
}

export const logger = {
  info: (msg: string, extra?: unknown) => log("info", msg, extra),
  warn: (msg: string, extra?: unknown) => log("warn", msg, extra),
  error: (msg: string, extra?: unknown) => log("error", msg, extra),
  debug: (msg: string, extra?: unknown) => {
    if (process.env.DEBUG) log("debug", msg, extra);
  },
};
