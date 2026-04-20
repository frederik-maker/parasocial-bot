/**
 * Per-user custodial wallets — one EVM key + one Solana keypair per user,
 * each encrypted with deriveKey(MASTER_SECRET, userId) and stored in SQLite.
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { decryptForUser, encryptForUser } from "./crypto.js";
import {
  getUserSolWallet,
  getUserWallet,
  insertUserSolWallet,
  insertUserWallet,
} from "./db.js";
import { logger } from "./logger.js";
import type { Account, Hex } from "viem";

export interface UserAccount {
  userId: number;
  address: `0x${string}`;
  account: Account;
}

export interface UserSolAccount {
  userId: number;
  address: string;
  keypair: Keypair;
}

export function getOrCreateUserWallet(userId: number): UserAccount {
  const existing = getUserWallet(userId);
  if (existing) {
    const pk = decryptForUser(userId, existing.encryptedKey) as Hex;
    const account = privateKeyToAccount(pk);
    return { userId, address: account.address, account };
  }
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  insertUserWallet({
    userId,
    address: account.address,
    encryptedKey: encryptForUser(userId, pk),
    createdAt: Date.now(),
  });
  logger.info(`Generated EVM wallet ${account.address} for user ${userId}`);
  return { userId, address: account.address, account };
}

export function getUserAccountIfExists(userId: number): UserAccount | null {
  const row = getUserWallet(userId);
  if (!row) return null;
  const pk = decryptForUser(userId, row.encryptedKey) as Hex;
  const account = privateKeyToAccount(pk);
  return { userId, address: account.address, account };
}

export function exportUserPrivateKey(userId: number): Hex | null {
  const row = getUserWallet(userId);
  if (!row) return null;
  return decryptForUser(userId, row.encryptedKey) as Hex;
}

// ── Solana ───────────────────────────────────────────────

export function getOrCreateUserSolanaWallet(userId: number): UserSolAccount {
  const existing = getUserSolWallet(userId);
  if (existing) {
    const secret = bs58.decode(decryptForUser(userId, existing.encryptedKey));
    const keypair = Keypair.fromSecretKey(secret);
    return { userId, address: keypair.publicKey.toBase58(), keypair };
  }
  const keypair = Keypair.generate();
  const encoded = bs58.encode(keypair.secretKey);
  insertUserSolWallet({
    userId,
    address: keypair.publicKey.toBase58(),
    encryptedKey: encryptForUser(userId, encoded),
    createdAt: Date.now(),
  });
  logger.info(`Generated Solana wallet ${keypair.publicKey.toBase58()} for user ${userId}`);
  return { userId, address: keypair.publicKey.toBase58(), keypair };
}

export function getUserSolAccountIfExists(userId: number): UserSolAccount | null {
  const row = getUserSolWallet(userId);
  if (!row) return null;
  const secret = bs58.decode(decryptForUser(userId, row.encryptedKey));
  const keypair = Keypair.fromSecretKey(secret);
  return { userId, address: keypair.publicKey.toBase58(), keypair };
}

export function exportUserSolPrivateKey(userId: number): string | null {
  const row = getUserSolWallet(userId);
  if (!row) return null;
  return decryptForUser(userId, row.encryptedKey);
}
