import { parseUnits } from "viem";
import { chainOf, txUrl } from "./chains.js";
import { recordMirror } from "./db.js";
import { logger } from "./logger.js";
import { checkPolicy } from "./policies.js";
import { findFungibleBySymbol, getSwapOffers, resolveUsdcFungibleId } from "./rest.js";
import {
  approveErc20,
  getErc20Allowance,
  readErc20Balance,
  readNativeBalance,
  sendRawTx,
} from "./signer.js";
import {
  LAMPORTS_PER_SOL_N,
  readSolBalanceLamports,
  readSplBalance,
  signAndBroadcastZerionSolanaTx,
} from "./signer_sol.js";
import { getOrCreateUserSolanaWallet, getOrCreateUserWallet } from "./wallet.js";
import type { MirrorEvent } from "./types.js";

export interface MirrorRequest {
  userId: number;
  sourceAddress: string;
  sourceTxHash: string;
  asset: string;
  chain: string;
  usdAmount: number;
  direction: "buy" | "sell";
}

export interface BuyRequest {
  userId: number;
  asset: string;
  chain: string;
  usdAmount: number;
  // audit labels
  sourceAddress: string;
  sourceTxHash: string;
}

/**
 * Core "buy an asset with USDC" primitive. Both /mirror taps and /dca ticks
 * funnel through here — keeping the balance / offer / approve / sign / audit
 * pipeline in a single place and the scoped-policy check in a single place.
 */
export async function buyAssetWithUsdc(req: BuyRequest): Promise<MirrorEvent> {
  return mirrorTrade({
    userId: req.userId,
    sourceAddress: req.sourceAddress,
    sourceTxHash: req.sourceTxHash,
    asset: req.asset,
    chain: req.chain,
    usdAmount: req.usdAmount,
    direction: "buy",
  });
}

const USDC_DECIMALS = 6;
const MIN_NATIVE_GAS_WEI = 500_000_000_000_000n; // ~0.0005 ETH for EVM gas headroom
const MIN_SOL_LAMPORTS = 5_000_000n; // 0.005 SOL for rent + fees

export async function mirrorTrade(req: MirrorRequest): Promise<MirrorEvent> {
  const reject = (status: MirrorEvent["status"], reason: string) =>
    recordMirror({
      userId: req.userId,
      sourceAddress: req.sourceAddress,
      sourceTxHash: req.sourceTxHash,
      asset: req.asset,
      chain: req.chain,
      usdAmount: req.usdAmount,
      txHash: null,
      status,
      reason,
    });

  if (req.direction === "sell") {
    return reject("skipped", "mirror bot only mirrors buys (sells are informational)");
  }

  const policy = checkPolicy({
    userId: req.userId,
    chain: req.chain,
    usdAmount: req.usdAmount,
  });
  if (!policy.ok) return reject("rejected", policy.reason);

  const chain = chainOf(req.chain);
  const spendUsd = policy.amountUsd;
  const spendRaw = parseUnits(spendUsd.toFixed(USDC_DECIMALS), USDC_DECIMALS);

  if (chain.kind === "solana") {
    return mirrorSolana({ req, chain, spendUsd, spendRaw, reject });
  }

  const user = getOrCreateUserWallet(req.userId);
  const userAddr = user.address as `0x${string}`;

  // 1. Sanity-check balances.
  const [usdcBal, nativeBal] = await Promise.all([
    readErc20Balance(req.chain, chain.usdc, user.address),
    readNativeBalance(req.chain, user.address),
  ]);
  if (usdcBal < spendRaw) {
    return reject(
      "rejected",
      `Insufficient USDC on ${req.chain}: have ${Number(usdcBal) / 1e6} USDC, need ${spendUsd}. Fund: ${user.address}`,
    );
  }
  if (nativeBal < MIN_NATIVE_GAS_WEI) {
    return reject(
      "rejected",
      `Insufficient ${chain.nativeSymbol} for gas on ${req.chain}. Fund: ${user.address}`,
    );
  }

  // 2. Resolve target token + USDC fungible IDs.
  let toFungibleId: string;
  try {
    const hit = await findFungibleBySymbol(req.asset, req.chain);
    if (!hit) return reject("rejected", `Could not find ${req.asset} on ${req.chain}`);
    toFungibleId = hit.id;
  } catch (err) {
    return reject("failed", `token lookup: ${(err as Error).message}`);
  }
  let fromFungibleId: string;
  try {
    fromFungibleId = await resolveUsdcFungibleId(req.chain);
  } catch (err) {
    return reject("failed", `USDC lookup: ${(err as Error).message}`);
  }

  // 3. Ask Zerion for a swap offer.
  const offers = await getSwapOffers({
    walletAddress: user.address,
    chain: req.chain,
    fromFungibleId,
    amountRaw: spendRaw.toString(),
    toChain: req.chain,
    toFungibleId,
    slippagePercent: policy.policy.maxSlippage,
  }).catch((err) => {
    logger.error(`swap offers failed`, err);
    return [];
  });
  if (offers.length === 0) {
    return reject("failed", `No swap route found for ${spendUsd} USDC → ${req.asset} on ${req.chain}`);
  }
  const best = offers[0]!;
  const swapTx = best.attributes.transaction;
  const spender = best.attributes.asset_spender;
  if (!swapTx) {
    return reject(
      "failed",
      `Zerion returned an offer without transaction data (preconds: ${JSON.stringify(best.attributes.preconditions_met)})`,
    );
  }

  // 4. Approve if needed (USDC → spender).
  if (spender) {
    try {
      const current = await getErc20Allowance(req.chain, chain.usdc, user.address, spender);
      if (current < spendRaw) {
        logger.info(`approving ${spender} for ${spendUsd} USDC on ${req.chain}`);
        const approval = await approveErc20(user, req.chain, chain.usdc, spender, spendRaw);
        if (approval.status !== "success") {
          return reject("failed", `approval reverted: ${approval.hash}`);
        }
      }
    } catch (err) {
      return reject("failed", `approve: ${(err as Error).message}`);
    }
  }

  // 5. Sign + broadcast the swap transaction.
  try {
    const result = await sendRawTx(user, req.chain, {
      to: swapTx.to,
      data: swapTx.data,
      value: BigInt(swapTx.value || "0"),
      gas: swapTx.gas ? BigInt(swapTx.gas) : undefined,
    });
    if (result.status !== "success") {
      return reject("failed", `swap reverted: ${txUrl(req.chain, result.hash)}`);
    }
    return recordMirror({
      userId: req.userId,
      sourceAddress: req.sourceAddress,
      sourceTxHash: req.sourceTxHash,
      asset: req.asset,
      chain: req.chain,
      usdAmount: spendUsd,
      txHash: result.hash,
      status: "executed",
      reason: null,
    });
  } catch (err) {
    return reject("failed", `broadcast: ${(err as Error).message}`);
  }
}

// ── Solana mirror path ────────────────────────────────────

async function mirrorSolana(args: {
  req: MirrorRequest;
  chain: Extract<ReturnType<typeof chainOf>, { kind: "solana" }>;
  spendUsd: number;
  spendRaw: bigint;
  reject: (status: MirrorEvent["status"], reason: string) => MirrorEvent;
}): Promise<MirrorEvent> {
  const { req, chain, spendUsd, spendRaw, reject } = args;
  const user = getOrCreateUserSolanaWallet(req.userId);

  const [usdcBal, solBal] = await Promise.all([
    readSplBalance(user.address, chain.usdcMint),
    readSolBalanceLamports(user.address),
  ]);
  if (usdcBal < spendRaw) {
    return reject(
      "rejected",
      `Insufficient USDC on Solana: have ${Number(usdcBal) / 1e6} USDC, need ${spendUsd}. Fund: ${user.address}`,
    );
  }
  if (solBal < MIN_SOL_LAMPORTS) {
    return reject("rejected", `Insufficient SOL for fees. Fund: ${user.address}`);
  }

  let toFungibleId: string;
  try {
    const hit = await findFungibleBySymbol(req.asset, "solana");
    if (!hit) return reject("rejected", `Could not find ${req.asset} on Solana`);
    toFungibleId = hit.id;
  } catch (err) {
    return reject("failed", `token lookup: ${(err as Error).message}`);
  }

  const fromFungibleId = await resolveUsdcFungibleId("solana").catch((err) => {
    logger.error(`USDC fungible lookup failed on solana`, err);
    return null;
  });
  if (!fromFungibleId) return reject("failed", "could not resolve USDC fungible on Solana");

  const offers = await getSwapOffers({
    walletAddress: user.address as `0x${string}`, // treated as opaque string by Zerion here
    chain: "solana",
    fromFungibleId,
    amountRaw: spendRaw.toString(),
    toChain: "solana",
    toFungibleId,
    slippagePercent: policyMaxSlippage(req.userId),
  }).catch((err) => {
    logger.error(`solana swap offers failed`, err);
    return [];
  });
  if (offers.length === 0) {
    return reject("failed", `No Solana swap route found for ${spendUsd} USDC → ${req.asset}`);
  }
  const best = offers[0]!;
  const swapTx = best.attributes.transaction;
  if (!swapTx || !swapTx.data) {
    return reject(
      "failed",
      `Zerion returned Solana offer without transaction data (preconds: ${JSON.stringify(best.attributes.preconditions_met)})`,
    );
  }

  try {
    const result = await signAndBroadcastZerionSolanaTx(user, swapTx.data);
    return recordMirror({
      userId: req.userId,
      sourceAddress: req.sourceAddress,
      sourceTxHash: req.sourceTxHash,
      asset: req.asset,
      chain: "solana",
      usdAmount: spendUsd,
      txHash: result.hash,
      status: "executed",
      reason: null,
    });
  } catch (err) {
    return reject("failed", `solana broadcast: ${(err as Error).message}`);
  }
}

function policyMaxSlippage(userId: number): number {
  return checkPolicy({ userId, chain: "solana", usdAmount: 1 }).policy.maxSlippage;
}
// Silence "unused" when LAMPORTS_PER_SOL_N only used for withdrawals.
void LAMPORTS_PER_SOL_N;
