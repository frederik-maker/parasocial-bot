# Parasocial

A Telegram bot that lets you follow "smart money" wallets onchain, scores their
credibility, and with one tap mirrors their trades through your own wallet.

Built on **[Zerion CLI](https://github.com/zeriontech/zerion-ai)** for wallet data
and swap execution. Scoped policies keep every mirror safe and bounded.

```
0xSmart… just bought ETH
Amount: $2,400 on base

Their stats: Hot hand (score 82)
- +340.0% PnL YTD
- 73% win rate (19 closed trades)
- 81% win rate on ETH positions
- Last 5: W W W L W

[Mirror $50]  [Skip]  [More info]
```

---

## Features

- **`/watch 0x…`** — add any wallet to your watchlist
- **Poller** (default 5 min) runs `zerion history` per wallet to catch new trades
- **Credibility score** — computed from 30-tx history + PnL endpoint, weighted by
  overall PnL, overall win rate, asset-specific win rate, and recency
- **One-tap mirror** — executes `zerion swap USDC → asset` on the same chain
  through an agent-token-authenticated wallet
- **Scoped policies** (required, enforced):
  - Max mirror $ per trade
  - Chain lock (local + Zerion agent policy)
  - Slippage cap
  - Daily spend limit
  - Cooldown between mirrors
  - Optional `auto-mirror` (off by default)
- **Audit log** — every mirror attempt recorded in SQLite with status & reason

---

## Quickstart — operator

### 1. Prerequisites

- Node 20+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A Zerion API key from [developers.zerion.io](https://developers.zerion.io)

### 2. Install

```bash
git clone https://github.com/you/parasocial-bot
cd parasocial-bot
npm install
cp .env.example .env    # fill TELEGRAM_BOT_TOKEN, ZERION_API_KEY, MASTER_SECRET
```

Generate `MASTER_SECRET` (encrypts user private keys at rest) once:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Never rotate `MASTER_SECRET` after users have funded wallets** — you'd
> lose the ability to decrypt their keys. Back up `.env` like a production DB.

### 3. Run

```bash
npm run dev     # TS + hot reload
# or
npm run build && npm start
```

That's it. No CLI wallets, no agent tokens, no onchain setup.

## Quickstart — user (in Telegram)

1. Open the bot → `/start`
2. `/wallet` — bot generates a fresh EVM wallet for you. Copy the address.
3. Send **USDC** (+ a bit of ETH for gas) to that address on **base** (or any
   allowed chain).
4. `/balance` — confirm funds arrived.
5. `/watch 0x…` — start tracking a smart-money wallet.
6. When an alert arrives, tap **Mirror**. Swap executes from your wallet in
   ~15 seconds.
7. `/withdraw USDC 10 base 0x…` to move funds out anytime.
8. `/export_key` (DM-only) if you want your raw private key.

---

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Intro + command list |
| `/wallet` | Generate / show your deposit address |
| `/balance` | USDC + native balance per chain |
| `/withdraw USDC 10 base 0xDest…` | Send funds out |
| `/export_key` | Reveal private key (DM only, auto-deletes) |
| `/watch 0x… [label]` | Add wallet to watchlist |
| `/unwatch 0x…` | Remove |
| `/list` | Show watchlist |
| `/stats 0x…` | Full credibility breakdown |
| `/settings` | Inline keyboard to tune policy |
| `/help` | Help text |

---

## Credibility scoring

Pulled from two Zerion endpoints:

- `GET /v1/wallets/<addr>/pnl` → `relative_realized_gain_percentage` (**primary**)
  and `relative_total_gain_percentage` (fallback, flagged if dust-inflated)
- `zerion history <addr> --limit 30` → recent trades

**Why realized-only?** `total_invested` includes external receive flows (NFTs,
airdrops, ENS, random tokens sent to the wallet), which makes `totalGainPercent`
useless — vitalik.eth shows -100% total PnL but +10.3% realized. The realized
number is the honest "closed trades actually made money" signal.

Score ∈ [0, 100]:

```
score = 0.4·pnl_normalized               (primary: realized % if available)
      + 0.3·overall_win_rate
      + 0.2·asset_specific_win_rate      (falls back to overall if sample < 2)
      + 0.1·recency_bias                 (exp decay, 14-day half-life)
```

Flags surfaced in `/stats`:
- `dust-inflated` — `total_invested` >> `realized_cost_basis` AND total% < -50
- `low sample size` — fewer than 3 closed trades

Tiers:

| Range | Label |
|------:|:------|
| `>= 75` | Hot hand |
| `>= 50` | Diamond hands |
| `>= 25` | Mixed bag |
| `<  25` | Bag holder |

"Win" = a closed buy/sell pair where exit price > entry price. Stablecoins are
ignored from the asset classification.

---

## Scoped policies

Enforced locally by the bot *before every mirror tap*. Users edit via `/settings`.

| Policy | Default | What it blocks |
|--------|--------:|----------------|
| `maxMirrorUsd` | $50 | Caps per-trade size |
| `allowedChains` | eth, base | Rejects cross-chain or unlisted chains |
| `maxSlippage` | 0.5% | Rejects quotes over cap |
| `dailySpendLimit` | $200 | Rolling 24-hour cap |
| `mirrorCooldownMinutes` | 30 | Prevents rapid firing |
| `autoMirror` | off | If on, mirrors buys without tap |

Balance-level guards: the bot checks USDC + native-gas balance before asking
Zerion for a quote, so a reject always carries a clear "fund your wallet" reason.

---

## Architecture

```
┌──────────────┐   5 min    ┌──────────────┐
│   poller.ts  │◀──────────│  zerion CLI  │   read: history, pnl, portfolio
│              │            └──────────────┘
│ detects new  │
│ trades per   │
│ watched addr │
└──────┬───────┘
       │ alert()
       ▼
┌──────────────┐   button    ┌──────────────┐
│    bot.ts    │──tap───────▶│   mirror.ts  │
│              │             │              │
│ Telegram UX  │             │  check       │
│  /watch      │             │  policy      │
│  /stats      │             │  → zerion    │
│  /settings   │             │    swap      │
└──────────────┘             └──────────────┘
       │                            │
       └──────────┬─────────────────┘
                  ▼
            ┌───────────┐
            │  SQLite   │
            │ watchlist │
            │ policies  │
            │ mirrors   │
            └───────────┘
```

Source files:

- `src/bot.ts` — grammy bot, commands, inline keyboards, alert sender
- `src/wallet_commands.ts` — `/wallet /balance /withdraw /export_key`
- `src/wallet.ts` — per-user EVM key generation (viem) + encrypted storage
- `src/crypto.ts` — AES-256-GCM with scrypt-derived per-user keys
- `src/chains.ts` — viem chain registry + USDC addresses + explorer URLs
- `src/signer.ts` — build / sign / broadcast EVM txs
- `src/rest.ts` — Zerion REST (PnL, fungible search, swap offers)
- `src/zerion.ts` — Zerion CLI wrapper (only for history polling)
- `src/throttle.ts` — shared 1 req/sec limiter for all Zerion calls
- `src/poller.ts` — 5-min interval, diff against `last_seen_tx_hash`
- `src/credibility.ts` — scoring algorithm
- `src/policies.ts` — local scoped-policy checks
- `src/mirror.ts` — balance → quote → approve → sign → broadcast → audit
- `src/db.ts` — better-sqlite3 schema + helpers

---

## Configuration

All tunable via `.env` (see `.env.example`). Per-user policy overrides live in
SQLite and are edited via `/settings` inline keyboard.

---

## Friction log

See [FRICTION_LOG.md](./FRICTION_LOG.md) — honest notes on rough edges we
hit in Zerion CLI while building this.

---

## License

MIT
