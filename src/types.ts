export type Address = string;

export interface Transfer {
  direction: "in" | "out" | "self";
  fungible: string | null;
  quantity: number | null;
  value: number | null;
}

export interface Transaction {
  hash: string;
  type: string;
  status: string;
  timestamp: string;
  chain: string;
  fee: number | null;
  transfers: Transfer[];
}

export interface HistoryResponse {
  wallet: { name: string; address: Address };
  transactions: Transaction[];
  count: number;
}

export interface PnLResponse {
  wallet: { name: string; address: Address };
  pnl: {
    totalGain: number | null;
    realizedGain: number | null;
    unrealizedGain: number | null;
    totalGainPercent: number | null;
    totalInvested: number | null;
    netInvested: number | null;
    totalFees: number | null;
  };
}

export interface Position {
  name: string | null;
  symbol: string | null;
  chain: string;
  quantity: number | null;
  value: number | null;
  price: number | null;
}

export interface PortfolioResponse {
  wallet: { name: string; address: Address };
  portfolio: { total: number; change_24h: number | null; currency: string };
  positions: Position[];
  positionCount: number;
}

export interface SwapResult {
  swap: {
    input: string;
    output: string;
    minOutput: string;
    fee: string | number;
    source: string;
    estimatedTime: string;
    fromChain: string;
    toChain?: string;
    chain: string;
  };
  tx: { hash: string; status: string; blockNumber?: number; gasUsed?: string };
  executed: boolean;
}

export interface UserPolicy {
  userId: number;
  maxMirrorUsd: number;
  allowedChains: string[];
  maxSlippage: number;
  dailySpendLimit: number;
  mirrorCooldownMinutes: number;
  autoMirror: boolean;
}

export interface WatchedWallet {
  userId: number;
  address: Address;
  label: string | null;
  addedAt: number;
  lastSeenTxHash: string | null;
  lastPolledAt: number | null;
}

export interface MirrorEvent {
  id: number;
  userId: number;
  sourceAddress: Address;
  sourceTxHash: string;
  asset: string;
  chain: string;
  usdAmount: number;
  txHash: string | null;
  status: "pending" | "skipped" | "rejected" | "executed" | "failed";
  reason: string | null;
  createdAt: number;
}

export interface CredibilityScore {
  overallPnLPercent: number | null;      // fallback: total gain %
  realizedPnLPercent: number | null;     // primary signal: closed-trade return
  winRate: number;
  assetWinRate: number | null;
  recencyBonus: number;
  score: number;
  tier: "🔥" | "💎" | "🤔" | "💀";
  label: string;
  sampleSize: number;
  lastFiveOutcomes: ("✅" | "❌" | "➖")[];
  flags: string[];                        // e.g. "dust-inflated", "low-sample"
}

export interface DetectedTrade {
  address: Address;
  txHash: string;
  chain: string;
  direction: "buy" | "sell";
  asset: string;
  quantity: number;
  usdValue: number;
  timestamp: string;
}
