/**
 * Offline integration test for the custody stack:
 * - generate wallet for a fake user
 * - encrypt/decrypt key deterministically
 * - resolve USDC fungible on base
 * - fetch a real swap offer from Zerion (no broadcast)
 *
 * Run:  npx tsx scripts/wallet-selftest.ts
 */
import "dotenv/config";
import { parseUnits } from "viem";
import { chainOf } from "../src/chains.js";
import { decryptForUser, encryptForUser } from "../src/crypto.js";
import { db } from "../src/db.js";
import { findFungibleBySymbol, getSwapOffers, resolveUsdcFungibleId } from "../src/rest.js";
import { getOrCreateUserWallet, exportUserPrivateKey } from "../src/wallet.js";

async function main() {
  const fakeUserId = 999_999_001;
  // Wipe any previous row for a clean run.
  db.prepare("DELETE FROM user_wallets WHERE user_id = ?").run(fakeUserId);

  console.log("1. Generating wallet…");
  const w = getOrCreateUserWallet(fakeUserId);
  console.log(`   address = ${w.address}`);

  console.log("2. Crypto roundtrip…");
  const plain = "the quick brown fox";
  const enc = encryptForUser(fakeUserId, plain);
  const dec = decryptForUser(fakeUserId, enc);
  if (dec !== plain) throw new Error("crypto roundtrip mismatch");
  console.log(`   ok (ciphertext ${enc.length} base64 chars)`);

  console.log("3. Tampering detection…");
  const tampered = enc.slice(0, -4) + "AAAA";
  let tamperedCaught = false;
  try {
    decryptForUser(fakeUserId, tampered);
  } catch {
    tamperedCaught = true;
  }
  if (!tamperedCaught) throw new Error("tampered ciphertext decrypted — GCM auth broken");
  console.log("   ok (tamper rejected)");

  console.log("4. Private key export round-trip…");
  const pk = exportUserPrivateKey(fakeUserId);
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) throw new Error(`bad pk: ${pk}`);
  console.log(`   ok (0x…${pk.slice(-6)})`);

  console.log("5. Resolving USDC on base…");
  const usdcId = await resolveUsdcFungibleId("base");
  console.log(`   fungible_id = ${usdcId}`);

  console.log("6. Resolving WETH on base…");
  const weth = await findFungibleBySymbol("WETH", "base");
  if (!weth) throw new Error("WETH not found on base");
  console.log(`   fungible_id = ${weth.id}`);

  console.log("7. Fetching swap offer: 10 USDC → WETH on base…");
  const offers = await getSwapOffers({
    walletAddress: w.address,
    chain: "base",
    fromFungibleId: usdcId,
    amountRaw: parseUnits("10", 6).toString(),
    toChain: "base",
    toFungibleId: weth.id,
    slippagePercent: 0.5,
  });
  if (offers.length === 0) throw new Error("no swap route returned");
  const best = offers[0]!;
  console.log(`   best route via ${best.attributes.liquidity_source?.name ?? "?"}`);
  console.log(`   expected   ≈ ${best.attributes.estimation?.output_quantity?.float} WETH`);
  console.log(`   preconds   = ${JSON.stringify(best.attributes.preconditions_met)}`);
  console.log(`   tx block   = ${best.attributes.transaction === null ? "null (wallet has no USDC — expected for empty test wallet)" : "present"}`);
  if (best.attributes.transaction) {
    console.log(`   tx.to      = ${best.attributes.transaction.to}`);
    console.log(`   spender    = ${best.attributes.asset_spender}`);
    console.log(`   gas        = ${best.attributes.transaction.gas ?? "(unset)"}`);
  }

  const chain = chainOf("base");
  if (chain.kind === "evm") {
    console.log(
      `\n   (your wallet ${w.address} needs USDC at ${chain.usdc} on base to actually execute)`,
    );
  }

  console.log("\n✓ all offline + read-only steps passed. Swap signing is wired but not broadcast.");

  // Cleanup fake user.
  db.prepare("DELETE FROM user_wallets WHERE user_id = ?").run(fakeUserId);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
