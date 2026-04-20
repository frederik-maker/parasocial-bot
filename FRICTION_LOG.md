# Friction log — Zerion CLI 0.4.2

Honest notes from building Parasocial on top of `zerion-cli`. Where things were
great, where they stubbed a toe.

## Wins

1. **`--json` is the default and consistently shaped.** `history`, `pnl`,
   `portfolio`, `positions` all return predictable objects. We could write
   TypeScript types directly from the command source without guesswork.
2. **Agent tokens + policies are the killer feature for copy-trading bots.**
   The combination of `agent create-policy --chains ... --deny-transfers` + a
   named wallet gives us *on-chain-scoped* execution. We didn't need to invent
   our own policy gating — Zerion enforces chain lock at sign time. That's the
   difference between "trust my bot" and "the key literally can't do harm".
3. **`zerion analyze` parallelises portfolio/positions/history/pnl** — saved us
   from writing our own `Promise.allSettled` fan-out for `/stats`.
4. **x402 fallback** (`--x402`, no API key) was a pleasant surprise — we
   recommend it in the README as a zero-friction path for hackers who don't
   want to register.

## The big one: CLI is not bot-shaped

**`zerion wallet create/import` are interactive — blocking for unattended bots.**
This is the single biggest friction for this use case. A Telegram trading bot
generates a wallet *per user* on `/wallet` — there's no TTY, no passphrase
prompt to fulfill. We ended up bypassing `zerion swap` entirely: generate the
key with `viem.generatePrivateKey`, store encrypted (AES-GCM + scrypt per-user),
and call `/swap/offers/` directly, signing with viem.

The CLI is clearly designed for hackers-at-a-keyboard, not for downstream bots.
That's a valid design choice, but it leaves a gap where a lot of the interesting
value (agent tokens + policies) is *only* accessible if you have a terminal.

**Fixes we wished for:**
- `wallet create --passphrase-from-env PARASOCIAL_PASSPHRASE` for headless use
- `wallet create --stdout-key` for ephemeral use
- A JSON API for "give me a new scoped agent key for wallet X" that can be
  called via fetch, not spawned as a subprocess
- First-party `@zerion/node` SDK that doesn't require the CLI binary at all

**PnL unit is *percent*, not ratio, in the JSON** — documented nowhere I could
find. `relative_total_gain_percentage: -99.95` means -99.95%, not -99.95×100%.
My first scoring implementation multiplied by 100 and showed -9995%. 5 minutes
wasted; would have taken 30s if the field were named `..._ratio` or `..._pct`
explicitly.

**The `total_invested` metric is weaponized against normal wallets.** Receiving
ENS names (or any "free" asset) inflates `total_invested` by the asset's market
price, so `totalGainPercent` trends toward -100% forever. Vitalik shows -100%
total PnL. Clear fix: always prefer `relative_realized_gain_percentage` for
credibility scoring. This isn't a Zerion bug exactly, but the CLI should
surface realized-% prominently alongside total-% with a warning that total-%
can be "infected" by received assets.

## Rough edges

1. **Ambiguous binary / package name.** The npm package is `zerion-cli`, the
   binary installed into `$PATH` is `zerion`. Took a minute to discover. A
   `bin` mention on the first line of the README would help.
2. **`--json` flag is technically redundant** (JSON is the default) but the
   `--help` output puts `--pretty` next to it, suggesting `--json` is opt-in.
   We kept `--json` explicitly in our spawn args for safety — worth documenting
   that the flag is a no-op when set twice or when the default is already JSON.
3. **Error shapes are *also* JSON but with a different top-level key.**
   Successful calls: `{ wallet, transactions, ... }`. Failures:
   `{ error: { code, message } }`. Our wrapper sniffs for `error` in the parsed
   output — standard, but it'd be nicer if the CLI exited non-zero *and* wrote
   the error to stderr instead of stdout. We had to parse stdout even on
   failure, which conflicts with "normal unix tool behaviour".
4. **x402 mode still needs a key** — `WALLET_PRIVATE_KEY` env var is required
   even in pay-per-call mode. The docs suggest `--x402` = "no key needed",
   which isn't quite true. A blurb in `--help` clarifying "`--x402` uses
   pay-per-call on-chain, but you still need a signing key" would be useful.
5. **No server-side filter on tx type.** `zerion history --limit 30` returns
   all tx types (trade, send, receive, approve, execute…). For a copy-trading
   bot we only want trades. We filter client-side. A `--type trade` flag would
   save bandwidth and make polling cheaper.
6. **`history` doesn't expose block number.** We only get `mined_at` timestamps.
   For robust "resume from last seen" logic in a poller, a monotonic block
   number would be more reliable than comparing by `hash` (the current approach
   works, but fails if Zerion's backend reorders txs during a reorg window).
7. **No webhook / pushed-event option.** Polling every 5 min is fine for a
   hackathon demo, but for real use we'd want `zerion subscribe <addr>` or
   similar. Current CLI is strictly pull-based.
8. **Wallet creation / import prompts interactively** even with `--json`. This
   makes scripted onboarding awkward — our `npm run setup` script can create a
   policy and token non-interactively, but creating the underlying wallet
   requires a human at the terminal. A `--passphrase-from-env` flag would
   enable fully headless provisioning.
9. **`swap` error codes vary.** `insufficient_funds`, `slippage_exceeded`,
   `quote_expired` are all surfaced with different shapes. A documented enum of
   error codes (we found them by reading the source in `cli/lib/trading/`)
   would let wrappers handle them cleanly.
10. **Agent token config is global, not per-invocation.** Once `zerion agent
    use-token --wallet X` is called, every subsequent swap in the process uses
    that token. For a multi-tenant bot, we had to pin ourselves to a single
    wallet. A `--agent-token <name>` flag on `swap` would enable per-user
    agent wallets inside one bot process.

## Shape-of-things wishlist

- `zerion stream <addr>` — push events to stdout as they arrive
- `zerion quote <from> <to> <amount>` — quote without executing (useful for
  showing the user *exactly* what they'll get before they tap Mirror)
- `zerion simulate <tx>` — dry-run a swap; we'd love to show slippage in the
  alert card before the user commits
- `zerion history --since <timestamp>` — poll delta, don't re-pull 30 every tick

---

Overall: very glad we built on this. Agent tokens + policies are genuinely a
better primitive than rolling our own key management, and `--json` first means
we spent ~zero time fighting I/O.
