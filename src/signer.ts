/**
 * Build, sign, and broadcast EVM transactions using each user's custodial key.
 */
import { encodeFunctionData, parseAbi, erc20Abi } from "viem";
import type { Address, Hex, PublicClient, TransactionReceipt } from "viem";
import { chainOf, getPublicClient } from "./chains.js";
import { logger } from "./logger.js";
import type { UserAccount } from "./wallet.js";

const ERC20_APPROVE_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export interface BroadcastResult {
  hash: Hex;
  status: "success" | "reverted";
  blockNumber: number;
  gasUsed: string;
}

async function signAndSend(
  user: UserAccount,
  chainId: string,
  tx: { to: Address; data: Hex; value: bigint; gas: bigint },
  label: string,
): Promise<BroadcastResult> {
  const client = getPublicClient(chainId);
  const chain = chainOf(chainId);
  if (chain.kind !== "evm") throw new Error(`signer.ts called on non-EVM chain ${chainId}`);

  const [nonce, fees] = await Promise.all([
    client.getTransactionCount({ address: user.address, blockTag: "pending" }),
    client.estimateFeesPerGas(),
  ]);

  const signed = await user.account.signTransaction!({
    chainId: chain.viem.id,
    type: "eip1559",
    to: tx.to,
    data: tx.data,
    value: tx.value,
    gas: tx.gas,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    nonce,
  });

  logger.info(`${label} broadcasting on ${chainId} from ${user.address}`);
  const hash = await client.sendRawTransaction({ serializedTransaction: signed });
  logger.info(`${label} tx hash: ${hash}`);

  const receipt: TransactionReceipt = await client.waitForTransactionReceipt({
    hash,
    timeout: 180_000,
  });

  return {
    hash,
    status: receipt.status,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString(),
  };
}

export async function getErc20Allowance(
  chainId: string,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  const client = getPublicClient(chainId);
  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  }) as Promise<bigint>;
}

export async function approveErc20(
  user: UserAccount,
  chainId: string,
  token: Address,
  spender: Address,
  amount: bigint,
): Promise<BroadcastResult> {
  const client = getPublicClient(chainId);
  const data = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [spender, amount],
  });

  let gas: bigint;
  try {
    const estimate = await client.estimateGas({
      account: user.address,
      to: token,
      data,
      value: 0n,
    });
    gas = (estimate * 120n) / 100n;
  } catch (err) {
    logger.warn(`approve gas estimate failed (${(err as Error).message}), defaulting to 100000`);
    gas = 100_000n;
  }

  return signAndSend(user, chainId, { to: token, data, value: 0n, gas }, "approve");
}

export async function sendRawTx(
  user: UserAccount,
  chainId: string,
  tx: { to: Address; data: Hex; value: bigint; gas?: bigint },
): Promise<BroadcastResult> {
  const client = getPublicClient(chainId);
  let gas = tx.gas;
  if (!gas || gas <= 0n) {
    try {
      const estimate = await client.estimateGas({
        account: user.address,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      });
      gas = (estimate * 120n) / 100n;
    } catch (err) {
      logger.warn(`swap gas estimate failed (${(err as Error).message}), defaulting to 400000`);
      gas = 400_000n;
    }
  }
  return signAndSend(user, chainId, { to: tx.to, data: tx.data, value: tx.value, gas }, "swap");
}

export async function readErc20Balance(
  chainId: string,
  token: Address,
  owner: Address,
): Promise<bigint> {
  const client: PublicClient = getPublicClient(chainId);
  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  }) as Promise<bigint>;
}

export async function readNativeBalance(chainId: string, owner: Address): Promise<bigint> {
  const client = getPublicClient(chainId);
  return client.getBalance({ address: owner });
}
