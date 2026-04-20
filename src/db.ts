import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";
import type {
  Address,
  MirrorEvent,
  UserPolicy,
  WatchedWallet,
} from "./types.js";

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS policies (
    user_id INTEGER PRIMARY KEY,
    max_mirror_usd REAL NOT NULL,
    allowed_chains TEXT NOT NULL,
    max_slippage REAL NOT NULL,
    daily_spend_limit REAL NOT NULL,
    mirror_cooldown_minutes INTEGER NOT NULL,
    auto_mirror INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS watched (
    user_id INTEGER NOT NULL,
    address TEXT NOT NULL,
    label TEXT,
    added_at INTEGER NOT NULL,
    last_seen_tx_hash TEXT,
    last_polled_at INTEGER,
    PRIMARY KEY (user_id, address)
  );

  CREATE INDEX IF NOT EXISTS idx_watched_address ON watched(address);

  CREATE TABLE IF NOT EXISTS mirrors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source_address TEXT NOT NULL,
    source_tx_hash TEXT NOT NULL,
    asset TEXT NOT NULL,
    chain TEXT NOT NULL,
    usd_amount REAL NOT NULL,
    tx_hash TEXT,
    status TEXT NOT NULL,
    reason TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_mirrors_user ON mirrors(user_id, created_at);

  CREATE TABLE IF NOT EXISTS pending_alerts (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    source_address TEXT NOT NULL,
    source_tx_hash TEXT NOT NULL,
    asset TEXT NOT NULL,
    chain TEXT NOT NULL,
    usd_value REAL NOT NULL,
    direction TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_wallets (
    user_id INTEGER PRIMARY KEY,
    address TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_sol_wallets (
    user_id INTEGER PRIMARY KEY,
    address TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dca_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    asset TEXT NOT NULL,
    chain TEXT NOT NULL,
    usd_amount REAL NOT NULL,
    interval_minutes INTEGER NOT NULL,
    next_run_at INTEGER NOT NULL,
    last_run_at INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_dca_user ON dca_plans(user_id);
  CREATE INDEX IF NOT EXISTS idx_dca_next ON dca_plans(active, next_run_at);
`);

// ── policies ──────────────────────────────────────────────
const getPolicyStmt = db.prepare(`SELECT * FROM policies WHERE user_id = ?`);
const upsertPolicyStmt = db.prepare(`
  INSERT INTO policies (user_id, max_mirror_usd, allowed_chains, max_slippage,
                        daily_spend_limit, mirror_cooldown_minutes, auto_mirror)
  VALUES (@userId, @maxMirrorUsd, @allowedChains, @maxSlippage,
          @dailySpendLimit, @mirrorCooldownMinutes, @autoMirror)
  ON CONFLICT(user_id) DO UPDATE SET
    max_mirror_usd = excluded.max_mirror_usd,
    allowed_chains = excluded.allowed_chains,
    max_slippage = excluded.max_slippage,
    daily_spend_limit = excluded.daily_spend_limit,
    mirror_cooldown_minutes = excluded.mirror_cooldown_minutes,
    auto_mirror = excluded.auto_mirror
`);

interface PolicyRow {
  user_id: number;
  max_mirror_usd: number;
  allowed_chains: string;
  max_slippage: number;
  daily_spend_limit: number;
  mirror_cooldown_minutes: number;
  auto_mirror: number;
}

function rowToPolicy(row: PolicyRow): UserPolicy {
  return {
    userId: row.user_id,
    maxMirrorUsd: row.max_mirror_usd,
    allowedChains: row.allowed_chains.split(",").filter(Boolean),
    maxSlippage: row.max_slippage,
    dailySpendLimit: row.daily_spend_limit,
    mirrorCooldownMinutes: row.mirror_cooldown_minutes,
    autoMirror: row.auto_mirror === 1,
  };
}

export function getPolicy(userId: number): UserPolicy {
  const row = getPolicyStmt.get(userId) as PolicyRow | undefined;
  if (row) return rowToPolicy(row);
  const d = config.defaults;
  const policy: UserPolicy = {
    userId,
    maxMirrorUsd: d.maxMirrorUsd,
    allowedChains: [...d.allowedChains],
    maxSlippage: d.maxSlippage,
    dailySpendLimit: d.dailySpendLimit,
    mirrorCooldownMinutes: d.mirrorCooldownMinutes,
    autoMirror: false,
  };
  savePolicy(policy);
  return policy;
}

export function savePolicy(p: UserPolicy): void {
  upsertPolicyStmt.run({
    userId: p.userId,
    maxMirrorUsd: p.maxMirrorUsd,
    allowedChains: p.allowedChains.join(","),
    maxSlippage: p.maxSlippage,
    dailySpendLimit: p.dailySpendLimit,
    mirrorCooldownMinutes: p.mirrorCooldownMinutes,
    autoMirror: p.autoMirror ? 1 : 0,
  });
}

// ── watchlist ────────────────────────────────────────────
const addWatchStmt = db.prepare(`
  INSERT INTO watched (user_id, address, label, added_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, address) DO UPDATE SET label = excluded.label
`);
const removeWatchStmt = db.prepare(`DELETE FROM watched WHERE user_id = ? AND address = ?`);
const listWatchesStmt = db.prepare(`SELECT * FROM watched WHERE user_id = ? ORDER BY added_at DESC`);
const allWatchesStmt = db.prepare(`SELECT * FROM watched`);
const updateSeenStmt = db.prepare(`
  UPDATE watched SET last_seen_tx_hash = ?, last_polled_at = ?
  WHERE user_id = ? AND address = ?
`);

interface WatchRow {
  user_id: number;
  address: string;
  label: string | null;
  added_at: number;
  last_seen_tx_hash: string | null;
  last_polled_at: number | null;
}

function rowToWatch(row: WatchRow): WatchedWallet {
  return {
    userId: row.user_id,
    address: row.address,
    label: row.label,
    addedAt: row.added_at,
    lastSeenTxHash: row.last_seen_tx_hash,
    lastPolledAt: row.last_polled_at,
  };
}

export function addWatch(userId: number, address: Address, label: string | null): void {
  addWatchStmt.run(userId, address.toLowerCase(), label, Date.now());
}

export function removeWatch(userId: number, address: Address): boolean {
  const r = removeWatchStmt.run(userId, address.toLowerCase());
  return r.changes > 0;
}

export function listWatches(userId: number): WatchedWallet[] {
  return (listWatchesStmt.all(userId) as WatchRow[]).map(rowToWatch);
}

export function allWatches(): WatchedWallet[] {
  return (allWatchesStmt.all() as WatchRow[]).map(rowToWatch);
}

export function updateLastSeen(userId: number, address: Address, txHash: string): void {
  updateSeenStmt.run(txHash, Date.now(), userId, address.toLowerCase());
}

// ── mirrors ──────────────────────────────────────────────
const insertMirrorStmt = db.prepare(`
  INSERT INTO mirrors (user_id, source_address, source_tx_hash, asset, chain,
                       usd_amount, tx_hash, status, reason, created_at)
  VALUES (@userId, @sourceAddress, @sourceTxHash, @asset, @chain,
          @usdAmount, @txHash, @status, @reason, @createdAt)
`);
const recentMirrorsStmt = db.prepare(`
  SELECT * FROM mirrors
  WHERE user_id = ? AND status = 'executed' AND created_at > ?
  ORDER BY created_at DESC
`);
const lastExecutedMirrorStmt = db.prepare(`
  SELECT * FROM mirrors
  WHERE user_id = ? AND status = 'executed'
  ORDER BY created_at DESC LIMIT 1
`);

interface MirrorRow {
  id: number;
  user_id: number;
  source_address: string;
  source_tx_hash: string;
  asset: string;
  chain: string;
  usd_amount: number;
  tx_hash: string | null;
  status: string;
  reason: string | null;
  created_at: number;
}

function rowToMirror(row: MirrorRow): MirrorEvent {
  return {
    id: row.id,
    userId: row.user_id,
    sourceAddress: row.source_address,
    sourceTxHash: row.source_tx_hash,
    asset: row.asset,
    chain: row.chain,
    usdAmount: row.usd_amount,
    txHash: row.tx_hash,
    status: row.status as MirrorEvent["status"],
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export function recordMirror(m: Omit<MirrorEvent, "id" | "createdAt"> & { createdAt?: number }): MirrorEvent {
  const createdAt = m.createdAt ?? Date.now();
  const info = insertMirrorStmt.run({
    userId: m.userId,
    sourceAddress: m.sourceAddress,
    sourceTxHash: m.sourceTxHash,
    asset: m.asset,
    chain: m.chain,
    usdAmount: m.usdAmount,
    txHash: m.txHash,
    status: m.status,
    reason: m.reason,
    createdAt,
  });
  return { ...m, id: Number(info.lastInsertRowid), createdAt };
}

export function recentExecutedSpendUsd(userId: number, sinceMs: number): number {
  const rows = recentMirrorsStmt.all(userId, sinceMs) as MirrorRow[];
  return rows.reduce((sum, r) => sum + r.usd_amount, 0);
}

export function lastExecutedMirror(userId: number): MirrorEvent | null {
  const row = lastExecutedMirrorStmt.get(userId) as MirrorRow | undefined;
  return row ? rowToMirror(row) : null;
}

// ── pending alerts (mirror button context) ───────────────
const addPendingStmt = db.prepare(`
  INSERT INTO pending_alerts (token, user_id, source_address, source_tx_hash,
                              asset, chain, usd_value, direction, created_at)
  VALUES (@token, @userId, @sourceAddress, @sourceTxHash, @asset, @chain,
          @usdValue, @direction, @createdAt)
`);
const getPendingStmt = db.prepare(`SELECT * FROM pending_alerts WHERE token = ?`);
const deletePendingStmt = db.prepare(`DELETE FROM pending_alerts WHERE token = ?`);

export interface PendingAlert {
  token: string;
  userId: number;
  sourceAddress: Address;
  sourceTxHash: string;
  asset: string;
  chain: string;
  usdValue: number;
  direction: "buy" | "sell";
  createdAt: number;
}

export function savePendingAlert(a: PendingAlert): void {
  addPendingStmt.run({
    token: a.token,
    userId: a.userId,
    sourceAddress: a.sourceAddress,
    sourceTxHash: a.sourceTxHash,
    asset: a.asset,
    chain: a.chain,
    usdValue: a.usdValue,
    direction: a.direction,
    createdAt: a.createdAt,
  });
}

// ── user wallets ─────────────────────────────────────────
const getWalletStmt = db.prepare(`SELECT * FROM user_wallets WHERE user_id = ?`);
const insertWalletStmt = db.prepare(`
  INSERT INTO user_wallets (user_id, address, encrypted_key, created_at)
  VALUES (?, ?, ?, ?)
`);

export interface UserWalletRow {
  userId: number;
  address: string;
  encryptedKey: string;
  createdAt: number;
}

export function getUserWallet(userId: number): UserWalletRow | null {
  const row = getWalletStmt.get(userId) as
    | { user_id: number; address: string; encrypted_key: string; created_at: number }
    | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    address: row.address,
    encryptedKey: row.encrypted_key,
    createdAt: row.created_at,
  };
}

export function insertUserWallet(w: UserWalletRow): void {
  insertWalletStmt.run(w.userId, w.address, w.encryptedKey, w.createdAt);
}

const getSolWalletStmt = db.prepare(`SELECT * FROM user_sol_wallets WHERE user_id = ?`);
const insertSolWalletStmt = db.prepare(`
  INSERT INTO user_sol_wallets (user_id, address, encrypted_key, created_at)
  VALUES (?, ?, ?, ?)
`);

export function getUserSolWallet(userId: number): UserWalletRow | null {
  const row = getSolWalletStmt.get(userId) as
    | { user_id: number; address: string; encrypted_key: string; created_at: number }
    | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    address: row.address,
    encryptedKey: row.encrypted_key,
    createdAt: row.created_at,
  };
}

export function insertUserSolWallet(w: UserWalletRow): void {
  insertSolWalletStmt.run(w.userId, w.address, w.encryptedKey, w.createdAt);
}

// ── DCA plans ────────────────────────────────────────────

export interface DcaPlan {
  id: number;
  userId: number;
  asset: string;
  chain: string;
  usdAmount: number;
  intervalMinutes: number;
  nextRunAt: number;
  lastRunAt: number | null;
  active: boolean;
  createdAt: number;
}

interface DcaRow {
  id: number;
  user_id: number;
  asset: string;
  chain: string;
  usd_amount: number;
  interval_minutes: number;
  next_run_at: number;
  last_run_at: number | null;
  active: number;
  created_at: number;
}

function rowToDca(r: DcaRow): DcaPlan {
  return {
    id: r.id,
    userId: r.user_id,
    asset: r.asset,
    chain: r.chain,
    usdAmount: r.usd_amount,
    intervalMinutes: r.interval_minutes,
    nextRunAt: r.next_run_at,
    lastRunAt: r.last_run_at,
    active: r.active === 1,
    createdAt: r.created_at,
  };
}

const insertDcaStmt = db.prepare(`
  INSERT INTO dca_plans (user_id, asset, chain, usd_amount, interval_minutes,
                         next_run_at, active, created_at)
  VALUES (@userId, @asset, @chain, @usdAmount, @intervalMinutes,
          @nextRunAt, 1, @createdAt)
`);
const listUserDcaStmt = db.prepare(
  `SELECT * FROM dca_plans WHERE user_id = ? ORDER BY id DESC`,
);
const getDcaStmt = db.prepare(`SELECT * FROM dca_plans WHERE id = ?`);
const deactivateDcaStmt = db.prepare(`UPDATE dca_plans SET active = 0 WHERE id = ? AND user_id = ?`);
const dueDcaStmt = db.prepare(
  `SELECT * FROM dca_plans WHERE active = 1 AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT 20`,
);
const advanceDcaStmt = db.prepare(
  `UPDATE dca_plans SET last_run_at = ?, next_run_at = ? WHERE id = ?`,
);

export function insertDcaPlan(p: Omit<DcaPlan, "id" | "active" | "lastRunAt">): DcaPlan {
  const info = insertDcaStmt.run({
    userId: p.userId,
    asset: p.asset,
    chain: p.chain,
    usdAmount: p.usdAmount,
    intervalMinutes: p.intervalMinutes,
    nextRunAt: p.nextRunAt,
    createdAt: p.createdAt,
  });
  return {
    ...p,
    id: Number(info.lastInsertRowid),
    active: true,
    lastRunAt: null,
  };
}

export function listUserDca(userId: number): DcaPlan[] {
  return (listUserDcaStmt.all(userId) as DcaRow[]).map(rowToDca);
}

export function getDca(id: number): DcaPlan | null {
  const row = getDcaStmt.get(id) as DcaRow | undefined;
  return row ? rowToDca(row) : null;
}

export function deactivateDca(id: number, userId: number): boolean {
  const r = deactivateDcaStmt.run(id, userId);
  return r.changes > 0;
}

export function dueDcaPlans(now: number): DcaPlan[] {
  return (dueDcaStmt.all(now) as DcaRow[]).map(rowToDca);
}

export function advanceDcaRun(id: number, lastRunAt: number, nextRunAt: number): void {
  advanceDcaStmt.run(lastRunAt, nextRunAt, id);
}

export function takePendingAlert(token: string): PendingAlert | null {
  const row = getPendingStmt.get(token) as
    | {
        token: string;
        user_id: number;
        source_address: string;
        source_tx_hash: string;
        asset: string;
        chain: string;
        usd_value: number;
        direction: string;
        created_at: number;
      }
    | undefined;
  if (!row) return null;
  deletePendingStmt.run(token);
  return {
    token: row.token,
    userId: row.user_id,
    sourceAddress: row.source_address,
    sourceTxHash: row.source_tx_hash,
    asset: row.asset,
    chain: row.chain,
    usdValue: row.usd_value,
    direction: row.direction as "buy" | "sell",
    createdAt: row.created_at,
  };
}
