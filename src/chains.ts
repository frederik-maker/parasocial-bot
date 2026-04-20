/**
 * Chain registry — EVM chains (via viem) + Solana. A `kind` discriminator
 * lets downstream code branch on signing model.
 */
import { arbitrum, base, mainnet, optimism, polygon } from "viem/chains";
import type { Address, Chain, PublicClient } from "viem";
import { createPublicClient, http } from "viem";
import { config } from "./config.js";

export type ChainKind = "evm" | "solana";

interface EvmChainConfig {
  zerionId: string;
  kind: "evm";
  viem: Chain;
  usdc: Address;
  nativeSymbol: string;
  name: string;
  explorer: string;
}

interface SolanaChainConfig {
  zerionId: "solana";
  kind: "solana";
  usdcMint: string;
  nativeSymbol: "SOL";
  name: "Solana";
  explorer: string;
}

export type ChainConfig = EvmChainConfig | SolanaChainConfig;

export const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    zerionId: "ethereum",
    kind: "evm",
    viem: mainnet,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    nativeSymbol: "ETH",
    name: "Ethereum",
    explorer: "https://etherscan.io",
  },
  base: {
    zerionId: "base",
    kind: "evm",
    viem: base,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    nativeSymbol: "ETH",
    name: "Base",
    explorer: "https://basescan.org",
  },
  arbitrum: {
    zerionId: "arbitrum",
    kind: "evm",
    viem: arbitrum,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    nativeSymbol: "ETH",
    name: "Arbitrum",
    explorer: "https://arbiscan.io",
  },
  optimism: {
    zerionId: "optimism",
    kind: "evm",
    viem: optimism,
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    nativeSymbol: "ETH",
    name: "Optimism",
    explorer: "https://optimistic.etherscan.io",
  },
  polygon: {
    zerionId: "polygon",
    kind: "evm",
    viem: polygon,
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    nativeSymbol: "POL",
    name: "Polygon",
    explorer: "https://polygonscan.com",
  },
  solana: {
    zerionId: "solana",
    kind: "solana",
    usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    nativeSymbol: "SOL",
    name: "Solana",
    explorer: "https://solscan.io",
  },
};

export function chainOf(id: string): ChainConfig {
  const c = CHAINS[id];
  if (!c) throw new Error(`Unsupported chain: ${id}`);
  return c;
}

export function getPublicClient(chainId: string): PublicClient {
  const c = chainOf(chainId);
  if (c.kind !== "evm") throw new Error(`getPublicClient called on non-EVM chain ${chainId}`);
  const override = config.rpcOverrides[chainId];
  return createPublicClient({
    chain: c.viem,
    transport: http(override, { timeout: 10_000, retryCount: 2, retryDelay: 500 }),
  });
}

export function txUrl(chainId: string, hash: string): string {
  const c = CHAINS[chainId];
  if (c?.kind === "solana") return `${c.explorer}/tx/${hash}`;
  return `${c?.explorer ?? "https://etherscan.io"}/tx/${hash}`;
}

export function addressUrl(chainId: string, address: string): string {
  const c = CHAINS[chainId];
  if (c?.kind === "solana") return `${c.explorer}/account/${address}`;
  return `${c?.explorer ?? "https://etherscan.io"}/address/${address}`;
}
