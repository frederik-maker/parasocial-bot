/**
 * AES-256-GCM encryption for private keys at rest.
 *
 * Key derivation: scrypt(master_secret, salt="parasocial:user:<userId>", N=16384)
 * Format on disk: base64( nonce[12] | ciphertext | tag[16] )
 *
 * Each user gets a deterministic per-user key derived from (MASTER_SECRET, userId).
 * Rotating MASTER_SECRET invalidates all stored keys — documented in .env.example.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "./config.js";

const ALGO = "aes-256-gcm";
const NONCE_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function deriveKey(userId: number): Buffer {
  const salt = `parasocial:user:${userId}`;
  return scryptSync(config.masterSecret, salt, KEY_LEN, { N: 16384, r: 8, p: 1 });
}

export function encryptForUser(userId: number, plaintext: string): string {
  const key = deriveKey(userId);
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGO, key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ct, tag]).toString("base64");
}

export function decryptForUser(userId: number, blob: string): string {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < NONCE_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const nonce = buf.subarray(0, NONCE_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(NONCE_LEN, buf.length - TAG_LEN);
  const key = deriveKey(userId);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
