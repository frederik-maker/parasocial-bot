import { parseUnits } from "viem";
import { chainOf, txUrl } from "./chains.js";
import { recordMirror } from "./db.js";
import { logger } from "./logger.js";
import { checkPolicy } from "./policies.js";
import {
  findFungibleBySymbol,
  getSwapOffers,
  getTokenPriceUsd,
  resolveNativeFungibleId,
  resolveUsdcFungibleId,
} from "./rest.js";
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
  sourceAddress: string;
  sourceTxHash: string;
}

/**
 * Core "buy an asset" primitive. Both /mirror taps and /dca ticks funnel
 * through here — same balance/offer/approve/sign/audit pipeline, same policy
 * check. Input token is auto-picked: USDC if sufficient, else native gas token.
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
const EVM_NATIVE_DECIMALS = 18;
const SOL_DECIMALS = 9;
const MIN_NATIVE_GAS_WEI = 500_000_000_000_000n; // ~0.0005 ETH reserve
const MIN_SOL_LAMPORTS = 5_000_000n; // 0.005 SOL reserve

function usdToRaw(usd: number, decimals: number, pricePerUnitUsd: number): bigint {
  const native = usd / pricePerUnitUsd;
  const whole = BigInt(Math.floor(native));
  const frac = native - Math.floor(native);
  const fracRaw = BigInt(Math.round(frac * 10 ** decimals));
  return whole * 10n ** BigInt(decimals) + fracRaw;
}

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

  if (chain.kind === "solana") {
    return mirrorSolana({ req, chain, spendUsd, reject, slippagePercent: policy.policy.maxSlippage });
  }

  const user = getOrCreateUserWallet(req.userId);
  const userAddr = user.address;

  const usdcSpendRaw = parseUnits(spendUsd.toFixed(USDC_DECIMALS), USDC_DECIMALS);

  // ── 1. Balance check + source selection ─────────────────
  const [usdcBal, nativeBal] = await Promise.all([
    readErc20Balance(req.chain, chain.usdc, userAddr),
    readNativeBalance(req.chain, userAddr),
  ]);

  interface EvmSource {
    kind: "usdc" | "native";
    fungibleId: string;
    amountRaw: string;
    symbol: string;
  }
  let src: EvmSource;

  if (usdcBal >= usdcSpendRaw) {
    // USDC path
    if (nativeBal < MIN_NATIVE_GAS_WEI) {
      return reject(
        "rejected",
        `Insufficient ${chain.nativeSymbol} for gas on ${chain.name}. Send a bit of ${chain.nativeSymbol} to ${userAddr}.`,
      );
    }
    const fungibleId = await resolveUsdcFungibleId(req.chain).catch(() => null);
    if (!fungibleId) return reject("failed", `USDC fungible lookup failed on ${req.chain}`);
    src = {
      kind: "usdc",
      fungibleId,
      amountRaw: usdcSpendRaw.toString(),
      symbol: "USDC",
    };
  } else {
    // Try native fallback
    try {
      const nativeFungibleId = await resolveNativeFungibleId(req.chain, chain.nativeSymbol);
      const priceUsd = await getTokenPriceUsd(nativeFungibleId);
      const nativeNeeded = usdToRaw(spendUsd, EVM_NATIVE_DECIMALS, priceUsd);
      const totalNeeded = nativeNeeded + MIN_NATIVE_GAS_WEI;

      if (nativeBal < totalNeeded) {
        const haveUsdc = Number(usdcBal) / 10 ** USDC_DECIMALS;
        const haveNative = Number(nativeBal) / 10 ** EVM_NATIVE_DECIMALS;
        return reject(
          "rejected",
          `Insufficient funds on ${chain.name}: have $${haveUsdc.toFixed(2)} USDC + ${haveNative.toFixed(5)} ${chain.nativeSymbol} (~$${(haveNative * priceUsd).toFixed(2)}), need $${spendUsd} worth. Fund ${userAddr}.`,
        );
      }

      src = {
        kind: "native",
        fungibleId: nativeFungibleId,
        amountRaw: nativeNeeded.toString(),
        symbol: chain.nativeSymbol,
      };
      logger.info(
        `EVM source fallback: using ${chain.nativeSymbol} @ $${priceUsd.toFixed(2)} for ${spendUsd} USD on ${chain.name}`,
      );
    } catch (err) {
      return reject("failed", `native fallback resolve: ${(err as Error).message}`);
    }
  }

  // ── 2. Resolve target token ─────────────────────────────
  // Catch same-token no-op before hitting Zerion (e.g. DCA ETH funded with ETH).
  if (req.asset.toUpperCase() === chain.nativeSymbol.toUpperCase() && src.kind === "native") {
    return reject(
      "rejected",
      `Can't buy ${req.asset} with ${chain.nativeSymbol} — same token. Fund with USDC instead.`,
    );
  }

  let toFungibleId: string;
  try {
    const hit = await findFungibleBySymbol(req.asset, req.chain);
    if (!hit) return reject("rejected", `Could not find ${req.asset} on ${req.chain}`);
    toFungibleId = hit.id;
  } catch (err) {
    return reject("failed", `token lookup: ${(err as Error).message}`);
  }

  // ── 3. Get swap offer ───────────────────────────────────
  const offers = await getSwapOffers({
    walletAddress: userAddr,
    chain: req.chain,
    fromFungibleId: src.fungibleId,
    amountRaw: src.amountRaw,
    toChain: req.chain,
    toFungibleId,
    slippagePercent: policy.policy.maxSlippage,
  }).catch((err) => {
    logger.error(`swap offers failed`, err);
    return [];
  });
  if (offers.length === 0) {
    return reject("failed", `No swap route for ${src.symbol} → ${req.asset} on ${req.chain}`);
  }
  const best = offers[0]!;
  const swapTx = best.attributes.transaction;
  const spender = best.attributes.asset_spender;
  if (!swapTx) {
    return reject(
      "failed",
      `Zerion returned offer without tx data (preconds: ${JSON.stringify(best.attributes.preconditions_met)})`,
    );
  }

  // ── 4. Approve (ERC-20 only) ────────────────────────────
  if (src.kind === "usdc" && spender) {
    try {
      const current = await getErc20Allowance(req.chain, chain.usdc, userAddr, spender);
      if (current < usdcSpendRaw) {
        logger.info(`approving ${spender} for ${spendUsd} USDC on ${req.chain}`);
        const approval = await approveErc20(user, req.chain, chain.usdc, spender, usdcSpendRaw);
        if (approval.status !== "success") {
          return reject("failed", `approval reverted: ${approval.hash}`);
        }
      }
    } catch (err) {
      return reject("failed", `approve: ${(err as Error).message}`);
    }
  }

  // ── 5. Sign + broadcast ─────────────────────────────────
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
      reason: `source=${src.symbol}`,
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
  reject: (status: MirrorEvent["status"], reason: string) => MirrorEvent;
  slippagePercent: number;
}): Promise<MirrorEvent> {
  const { req, chain, spendUsd, reject, slippagePercent } = args;
  const user = getOrCreateUserSolanaWallet(req.userId);
  const usdcSpendRaw = parseUnits(spendUsd.toFixed(USDC_DECIMALS), USDC_DECIMALS);

  const [usdcBal, solBal] = await Promise.all([
    readSplBalance(user.address, chain.usdcMint),
    readSolBalanceLamports(user.address),
  ]);

  interface SolSource {
    kind: "usdc" | "native";
    fungibleId: string;
    amountRaw: string;
    symbol: string;
  }
  let src: SolSource;

  if (usdcBal >= usdcSpendRaw) {
    if (solBal < MIN_SOL_LAMPORTS) {
      return reject(
        "rejected",
        `Insufficient SOL for fees. Send a tiny bit of SOL to ${user.address}.`,
      );
    }
    const fungibleId = await resolveUsdcFungibleId("solana").catch(() => null);
    if (!fungibleId) return reject("failed", "could not resolve USDC fungible on Solana");
    src = {
      kind: "usdc",
      fungibleId,
      amountRaw: usdcSpendRaw.toString(),
      symbol: "USDC",
    };
  } else {
    try {
      const solFungibleId = await resolveNativeFungibleId("solana", "SOL");
      const priceUsd = await getTokenPriceUsd(solFungibleId);
      const lamportsNeeded = usdToRaw(spendUsd, SOL_DECIMALS, priceUsd);
      const totalNeeded = lamportsNeeded + MIN_SOL_LAMPORTS;

      if (solBal < totalNeeded) {
        const haveUsdc = Number(usdcBal) / 10 ** USDC_DECIMALS;
        const haveSol = Number(solBal) / 10 ** SOL_DECIMALS;
        return reject(
          "rejected",
          `Insufficient funds on Solana: have $${haveUsdc.toFixed(2)} USDC + ${haveSol.toFixed(4)} SOL (~$${(haveSol * priceUsd).toFixed(2)}), need $${spendUsd} worth. Fund ${user.address}.`,
        );
      }

      src = {
        kind: "native",
        fungibleId: solFungibleId,
        amountRaw: lamportsNeeded.toString(),
        symbol: "SOL",
      };
      logger.info(
        `Solana source fallback: using SOL @ $${priceUsd.toFixed(2)} for ${spendUsd} USD`,
      );
    } catch (err) {
      return reject("failed", `SOL fallback resolve: ${(err as Error).message}`);
    }
  }

  let toFungibleId: string;
  try {
    const hit = await findFungibleBySymbol(req.asset, "solana");
    if (!hit) return reject("rejected", `Could not find ${req.asset} on Solana`);
    toFungibleId = hit.id;
  } catch (err) {
    return reject("failed", `token lookup: ${(err as Error).message}`);
  }

  const offers = await getSwapOffers({
    walletAddress: user.address as `0x${string}`,
    chain: "solana",
    fromFungibleId: src.fungibleId,
    amountRaw: src.amountRaw,
    toChain: "solana",
    toFungibleId,
    slippagePercent,
  }).catch((err) => {
    logger.error(`solana swap offers failed`, err);
    return [];
  });
  if (offers.length === 0) {
    return reject("failed", `No Solana swap route for ${src.symbol} → ${req.asset}`);
  }
  const best = offers[0]!;
  const swapTx = best.attributes.transaction;
  if (!swapTx || !swapTx.data) {
    return reject(
      "failed",
      `Zerion returned Solana offer without tx data (preconds: ${JSON.stringify(best.attributes.preconditions_met)})`,
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
      reason: `source=${src.symbol}`,
    });
  } catch (err) {
    return reject("failed", `solana broadcast: ${(err as Error).message}`);
  }
}

// Keep the import referenced so tsc doesn't complain about unused.
void LAMPORTS_PER_SOL_N;
