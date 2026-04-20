/**
 * Solana signer: sign + broadcast a Zerion-provided swap transaction,
 * plus helpers to read native SOL and SPL USDC balances.
 */
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  sendAndConfirmRawTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { UserSolAccount } from "./wallet.js";

let _connection: Connection | null = null;
export function solanaConnection(): Connection {
  if (!_connection) _connection = new Connection(config.solanaRpcUrl, "confirmed");
  return _connection;
}

export async function readSolBalanceLamports(owner: string): Promise<bigint> {
  const conn = solanaConnection();
  const lamports = await conn.getBalance(new PublicKey(owner), "confirmed");
  return BigInt(lamports);
}

export async function readSplBalance(owner: string, mint: string): Promise<bigint> {
  const conn = solanaConnection();
  const ownerPk = new PublicKey(owner);
  const mintPk = new PublicKey(mint);
  const ata = await getAssociatedTokenAddress(mintPk, ownerPk);
  try {
    const acc = await getAccount(conn, ata);
    return acc.amount;
  } catch {
    return 0n;
  }
}

export interface SolanaBroadcastResult {
  hash: string;
  status: "success" | "reverted";
}

/**
 * Sign and broadcast a Zerion swap tx. Zerion's Solana swap offer returns
 * `transaction.data` as a hex-encoded serialized transaction that may be
 * either a legacy Transaction or a VersionedTransaction. We deserialize,
 * sign with the user's keypair, and broadcast.
 */
export async function signAndBroadcastZerionSolanaTx(
  user: UserSolAccount,
  hexTxData: string,
): Promise<SolanaBroadcastResult> {
  const conn = solanaConnection();
  const raw = Buffer.from(hexTxData.startsWith("0x") ? hexTxData.slice(2) : hexTxData, "hex");

  // Try versioned first (most DEX routers ship v0 now), fall back to legacy.
  let signed: Buffer;
  try {
    const vtx = VersionedTransaction.deserialize(raw);
    vtx.sign([user.keypair]);
    signed = Buffer.from(vtx.serialize());
  } catch (vErr) {
    try {
      const ltx = Transaction.from(raw);
      ltx.partialSign(user.keypair);
      signed = ltx.serialize();
    } catch (lErr) {
      throw new Error(
        `Could not deserialize Zerion Solana tx as v0 (${(vErr as Error).message}) or legacy (${(lErr as Error).message})`,
      );
    }
  }

  logger.info(`solana broadcasting from ${user.address}`);
  const hash = await sendAndConfirmRawTransaction(conn, signed, {
    skipPreflight: false,
    commitment: "confirmed",
    maxRetries: 3,
  });
  logger.info(`solana tx hash ${hash}`);
  return { hash, status: "success" };
}

export async function withdrawSol(
  user: UserSolAccount,
  destination: string,
  lamports: bigint,
): Promise<SolanaBroadcastResult> {
  const conn = solanaConnection();
  const ix = SystemProgram.transfer({
    fromPubkey: user.keypair.publicKey,
    toPubkey: new PublicKey(destination),
    lamports: Number(lamports),
  });
  const tx = new Transaction().add(ix);
  tx.feePayer = user.keypair.publicKey;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  const hash = await sendAndConfirmTransaction(conn, tx, [user.keypair], {
    commitment: "confirmed",
  });
  return { hash, status: "success" };
}

export async function withdrawUsdc(
  user: UserSolAccount,
  destination: string,
  amount: bigint,
  mint: string,
  decimals: number,
): Promise<SolanaBroadcastResult> {
  const conn = solanaConnection();
  const mintPk = new PublicKey(mint);
  const destPk = new PublicKey(destination);
  const srcAta = await getAssociatedTokenAddress(mintPk, user.keypair.publicKey);
  const dstAta = await getAssociatedTokenAddress(mintPk, destPk);
  const ix = createTransferCheckedInstruction(
    srcAta,
    mintPk,
    dstAta,
    user.keypair.publicKey,
    amount,
    decimals,
    [],
    TOKEN_PROGRAM_ID,
  );
  const tx = new Transaction().add(ix);
  tx.feePayer = user.keypair.publicKey;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  const hash = await sendAndConfirmTransaction(conn, tx, [user.keypair], {
    commitment: "confirmed",
  });
  return { hash, status: "success" };
}

export const LAMPORTS_PER_SOL_N = BigInt(LAMPORTS_PER_SOL);
