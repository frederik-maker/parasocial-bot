/**
 * Thin REST client for Zerion's HTTP API — used where the CLI drops data
 * we care about (e.g. realized-gain %).
 */
import { config } from "./config.js";
import { logger } from "./logger.js";
import { zerionThrottle } from "./throttle.js";
import type { Address as ViemAddress } from "viem";
import type { Address } from "./types.js";

const BASE = "https://api.zerion.io/v1";

function authHeader(): string {
  const encoded = Buffer.from(`${config.zerionApiKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  if (!config.zerionApiKey) throw new Error("ZERION_API_KEY is not set");
  const url = new URL(`${BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await zerionThrottle(async () => {
        logger.debug(`rest GET ${url.toString()}`);
        const res = await fetch(url, {
          headers: { accept: "application/json", authorization: authHeader() },
        });
        if (res.status === 429 || res.status === 503) {
          const body = await res.text().catch(() => "");
          const err = new Error(`Zerion REST ${res.status}: ${body.slice(0, 200)}`);
          (err as Error & { retriable: boolean }).retriable = true;
          throw err;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Zerion REST ${res.status}: ${body.slice(0, 200)}`);
        }
        return (await res.json()) as T;
      });
    } catch (err) {
      if (!(err as { retriable?: boolean }).retriable || attempt === 3) throw err;
      const backoff = 2000 * (attempt + 1);
      logger.warn(`rest ${path} attempt ${attempt + 1} got 429/503, retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new Error("unreachable");
}

export interface RestPnl {
  data: {
    attributes: {
      total_gain: number;
      realized_gain: number;
      unrealized_gain: number;
      relative_total_gain_percentage: number;
      relative_realized_gain_percentage: number;
      relative_unrealized_gain_percentage: number;
      total_invested: number;
      net_invested: number;
      realized_cost_basis: number;
      total_fee: number;
      received_external: number;
      sent_external: number;
    };
  };
}

export async function getPnlRest(address: Address): Promise<RestPnl> {
  return get<RestPnl>(`/wallets/${address.toLowerCase()}/pnl`);
}

// ── token discovery ───────────────────────────────────────

export interface FungibleHit {
  id: string;
  attributes: {
    name: string;
    symbol: string;
    implementations: { chain_id: string; address: string; decimals: number }[];
  };
}

/**
 * Look up a token by symbol on a specific chain. Returns the Zerion fungible
 * hit whose `implementations` includes the requested chain and whose symbol
 * matches case-insensitively.
 */
export async function findFungibleBySymbol(symbol: string, chain: string): Promise<FungibleHit | null> {
  const json = await get<{ data: FungibleHit[] }>(`/fungibles/`, {
    "filter[search_query]": symbol,
    "filter[implementation_chain_id]": chain,
    "page[size]": 20,
  });
  const wanted = symbol.toUpperCase();
  const exact = json.data.find(
    (f) =>
      f.attributes.symbol.toUpperCase() === wanted &&
      f.attributes.implementations.some((i) => i.chain_id === chain),
  );
  return exact ?? null;
}

// ── swap offers ───────────────────────────────────────────

export interface SwapOffer {
  id: string;
  attributes: {
    transaction: {
      to: ViemAddress;
      data: `0x${string}`;
      value: string;
      gas?: string;
      from?: ViemAddress;
    };
    asset_spender?: ViemAddress;
    preconditions_met?: { enough_balance?: boolean; enough_allowance?: boolean };
    output_quantity_min?: { float: number };
    estimation?: { output_quantity?: { float: number }; gas?: string; seconds?: number };
    liquidity_source?: { name?: string };
  };
}

export interface SwapOffersRequest {
  walletAddress: ViemAddress;
  chain: string;
  fromFungibleId: string;
  amountRaw: string;
  toChain: string;
  toFungibleId: string;
  slippagePercent: number;
}

export async function getSwapOffers(req: SwapOffersRequest): Promise<SwapOffer[]> {
  const json = await get<{ data: SwapOffer[] }>(`/swap/offers/`, {
    "input[from]": req.walletAddress,
    "input[chain_id]": req.chain,
    "input[fungible_id]": req.fromFungibleId,
    "input[amount]": req.amountRaw,
    "output[chain_id]": req.toChain,
    "output[fungible_id]": req.toFungibleId,
    slippage_percent: req.slippagePercent,
    sort: "amount",
  });
  return json.data ?? [];
}

/**
 * Resolve USDC on a chain — Zerion uses a canonical fungible_id like
 * "usd-coin" across chains, but we look it up defensively to avoid hardcoding.
 */
export async function resolveUsdcFungibleId(chain: string): Promise<string> {
  const hit = await findFungibleBySymbol("USDC", chain);
  if (!hit) throw new Error(`USDC fungible not found on ${chain}`);
  return hit.id;
}
