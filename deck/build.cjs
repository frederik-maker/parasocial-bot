/**
 * Parasocial — submission deck.
 * Generates parasocial.pptx with 10 slides. Dark, premium, no emojis.
 */
const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3" × 7.5"
pres.author = "Frederik Bussler";
pres.title = "Parasocial";

const SLIDE_W = 13.3;
const SLIDE_H = 7.5;

const C = {
  bg: "0A0A0A",
  bgSoft: "141414",
  bgCard: "111111",
  ink: "FAFAF9",
  muted: "A1A1AA",
  dim: "71717A",
  line: "232323",
  lineSoft: "1C1C1C",
  accent: "22C55E",
  accentSoft: "142418",
};

const SERIF = "Georgia";
const SANS = "Calibri";
const MONO = "Consolas";

// ── Shared helpers ────────────────────────────────────────
function bg(slide) {
  slide.background = { color: C.bg };
}

function kicker(slide, x, y, label) {
  slide.addShape(pres.shapes.OVAL, {
    x,
    y: y + 0.06,
    w: 0.18,
    h: 0.18,
    fill: { color: C.accent },
    line: { color: C.accent, width: 0 },
  });
  slide.addText(label.toUpperCase(), {
    x: x + 0.28,
    y,
    w: 6,
    h: 0.3,
    fontFace: SANS,
    fontSize: 10,
    color: C.accent,
    bold: true,
    charSpacing: 3,
    margin: 0,
  });
}

function headline(slide, x, y, w, text, size = 44) {
  slide.addText(text, {
    x,
    y,
    w,
    h: size * 0.025,
    fontFace: SERIF,
    fontSize: size,
    color: C.ink,
    margin: 0,
    paraSpaceAfter: 0,
  });
}

function subhead(slide, x, y, w, text, size = 16) {
  slide.addText(text, {
    x,
    y,
    w,
    h: 1,
    fontFace: SANS,
    fontSize: size,
    color: C.muted,
    margin: 0,
    paraSpaceAfter: 0,
  });
}

function footerLine(slide) {
  slide.addShape(pres.shapes.LINE, {
    x: 0.7,
    y: 6.95,
    w: SLIDE_W - 1.4,
    h: 0,
    line: { color: C.line, width: 0.5 },
  });
  slide.addText("PARASOCIAL", {
    x: 0.7,
    y: 7.05,
    w: 4,
    h: 0.3,
    fontFace: SANS,
    fontSize: 9,
    color: C.dim,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  slide.addText("COLOSSEUM FRONTIER × ZERION", {
    x: SLIDE_W - 4.7,
    y: 7.05,
    w: 4,
    h: 0.3,
    fontFace: SANS,
    fontSize: 9,
    color: C.dim,
    charSpacing: 3,
    bold: true,
    align: "right",
    margin: 0,
  });
}

// ═════════════════════════════════════════════════════════════
// SLIDE 1 — TITLE
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s);

  // Tiny brand mark (P in an outlined box)
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7,
    y: 0.7,
    w: 0.5,
    h: 0.5,
    fill: { color: C.accentSoft },
    line: { color: C.accent, width: 0.5 },
    rectRadius: 0.08,
  });
  s.addText("P", {
    x: 0.7,
    y: 0.68,
    w: 0.5,
    h: 0.54,
    fontFace: SERIF,
    fontSize: 24,
    italic: true,
    color: C.accent,
    align: "center",
    valign: "middle",
    margin: 0,
  });
  s.addText("Parasocial", {
    x: 1.35,
    y: 0.75,
    w: 3,
    h: 0.45,
    fontFace: SANS,
    fontSize: 16,
    color: C.ink,
    valign: "middle",
    margin: 0,
  });

  // Status chip
  s.addShape(pres.shapes.OVAL, {
    x: SLIDE_W - 4.7,
    y: 0.92,
    w: 0.14,
    h: 0.14,
    fill: { color: C.accent },
    line: { color: C.accent, width: 0 },
  });
  s.addText("Live on Base + Solana   ·   Real onchain txs", {
    x: SLIDE_W - 4.45,
    y: 0.78,
    w: 3.9,
    h: 0.4,
    fontFace: SANS,
    fontSize: 10,
    color: C.muted,
    valign: "middle",
    margin: 0,
  });

  // Big title
  s.addText("Parasocial.", {
    x: 0.7,
    y: 2.3,
    w: SLIDE_W - 1.4,
    h: 2.2,
    fontFace: SERIF,
    fontSize: 150,
    color: C.ink,
    margin: 0,
    paraSpaceAfter: 0,
  });

  // Subtitle — two-line italic
  s.addText("Copy smart money onchain.", {
    x: 0.7,
    y: 4.9,
    w: SLIDE_W - 1.4,
    h: 0.7,
    fontFace: SERIF,
    fontSize: 34,
    color: C.ink,
    margin: 0,
  });
  s.addText("After you know who's actually smart.", {
    x: 0.7,
    y: 5.55,
    w: SLIDE_W - 1.4,
    h: 0.7,
    fontFace: SERIF,
    fontSize: 34,
    italic: true,
    color: C.muted,
    margin: 0,
  });

  // Footer
  s.addShape(pres.shapes.LINE, {
    x: 0.7,
    y: 6.95,
    w: SLIDE_W - 1.4,
    h: 0,
    line: { color: C.line, width: 0.5 },
  });
  s.addText("APR 2026", {
    x: 0.7,
    y: 7.05,
    w: 4,
    h: 0.3,
    fontFace: SANS,
    fontSize: 9,
    color: C.dim,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  s.addText("COLOSSEUM FRONTIER × ZERION", {
    x: SLIDE_W - 4.7,
    y: 7.05,
    w: 4,
    h: 0.3,
    fontFace: SANS,
    fontSize: 9,
    color: C.dim,
    charSpacing: 3,
    bold: true,
    align: "right",
    margin: 0,
  });
}

// ═════════════════════════════════════════════════════════════
// SLIDE 2 — PROBLEM
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s);
  kicker(s, 0.7, 0.75, "01  /  Problem");
  // Keep headline clear of the right-side caption column (starts at x=10.0).
  headline(
    s,
    0.7,
    1.3,
    9.1,
    "Copy trading is a billion-dollar market.",
    50,
  );

  // Body
  s.addText(
    "Banana Gun does roughly $4B/year in volume. Maestro and Unibot, similar. But none answer the only question that matters:",
    {
      x: 0.7,
      y: 3.4,
      w: 9,
      h: 1.5,
      fontFace: SANS,
      fontSize: 18,
      color: C.muted,
      margin: 0,
      paraSpaceAfter: 4,
    },
  );

  s.addText("Which wallets do you actually trust?", {
    x: 0.7,
    y: 4.5,
    w: 9,
    h: 0.8,
    fontFace: SERIF,
    italic: true,
    fontSize: 30,
    color: C.ink,
    margin: 0,
  });

  // Divider + subtext right
  s.addShape(pres.shapes.LINE, {
    x: 10.0,
    y: 1.4,
    w: 0,
    h: 4.8,
    line: { color: C.line, width: 0.5 },
  });
  s.addText("THE FAILURE MODE", {
    x: 10.3,
    y: 1.4,
    w: 2.6,
    h: 0.3,
    fontFace: SANS,
    fontSize: 9,
    color: C.accent,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  s.addText(
    "Most \u201Csmart money\u201D feeds surface whoever's loudest — not whoever's right. Leaderboards reward visibility, not realized PnL.",
    {
      x: 10.3,
      y: 1.8,
      w: 2.6,
      h: 3,
      fontFace: SANS,
      fontSize: 13,
      color: C.muted,
      margin: 0,
      paraSpaceAfter: 6,
    },
  );

  footerLine(s);
}

// ═════════════════════════════════════════════════════════════
// SLIDE 3 — SOLUTION
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s);
  kicker(s, 0.7, 0.75, "02  /  Solution");
  headline(
    s,
    0.7,
    1.3,
    SLIDE_W - 1.4,
    "A credibility score before you ape.",
    54,
  );

  // Three pillars — columns
  const colY = 3.4;
  const colH = 3.0;
  const colW = (SLIDE_W - 1.4 - 0.6) / 3; // two gaps of 0.3
  const pillars = [
    {
      k: "CREDIBILITY SCORE",
      t: "Scored, not ranked.",
      b: "Realized PnL, overall win rate, asset-specific win rate, recency. Auto-flags dust-inflated wallets.",
    },
    {
      k: "ONE-TAP MIRROR",
      t: "Watch, alert, tap.",
      b: "Poller catches every trade from a watched wallet. You get a scored alert and a single button. Swap settles in roughly 15 seconds.",
    },
    {
      k: "DCA ON RAILS",
      t: "Auto-buy on a schedule.",
      b: "/dca ETH 5 hourly base. Runs on a 30-second scheduler. Persists. Every tick hits the same policy gate.",
    },
  ];
  pillars.forEach((p, i) => {
    const x = 0.7 + i * (colW + 0.3);
    s.addShape(pres.shapes.LINE, {
      x,
      y: colY - 0.3,
      w: colW,
      h: 0,
      line: { color: C.line, width: 0.5 },
    });
    s.addText(p.k, {
      x,
      y: colY,
      w: colW,
      h: 0.3,
      fontFace: SANS,
      fontSize: 10,
      color: C.accent,
      charSpacing: 3,
      bold: true,
      margin: 0,
    });
    s.addText(p.t, {
      x,
      y: colY + 0.3,
      w: colW,
      h: 0.7,
      fontFace: SERIF,
      fontSize: 24,
      color: C.ink,
      margin: 0,
    });
    s.addText(p.b, {
      x,
      y: colY + 1.1,
      w: colW,
      h: 2,
      fontFace: SANS,
      fontSize: 13,
      color: C.muted,
      margin: 0,
      paraSpaceAfter: 4,
    });
  });

  footerLine(s);
}

// ═════════════════════════════════════════════════════════════
// SLIDE 4 — HOW IT WORKS
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s);
  kicker(s, 0.7, 0.75, "03  /  How it works");
  headline(
    s,
    0.7,
    1.3,
    SLIDE_W - 1.4,
    "Four steps from message to onchain tx.",
    46,
  );

  const stages = [
    { n: "01", t: "Generate wallets", b: "/wallet auto-creates an EVM key and a Solana keypair. AES-256-GCM encrypted, scrypt-derived per-user." },
    { n: "02", t: "Fund the address", b: "Send USDC (and a little gas) to the deposit address. /balance confirms." },
    { n: "03", t: "Watch or DCA", b: "/watch 0x... for copy-trading. /dca ETH 5 hourly base for scheduled buys. Policies apply to both." },
    { n: "04", t: "Sign & broadcast", b: "Bot quotes Zerion /swap/offers, signs with viem (EVM) or ed25519 (Solana), broadcasts. Real tx hash." },
  ];

  const stageY = 3.0;
  const stageW = (SLIDE_W - 1.4 - 0.6) / 4;

  stages.forEach((st, i) => {
    const x = 0.7 + i * (stageW + 0.2);
    s.addText(st.n, {
      x,
      y: stageY,
      w: stageW,
      h: 0.5,
      fontFace: MONO,
      fontSize: 14,
      color: C.accent,
      bold: true,
      margin: 0,
    });
    s.addShape(pres.shapes.LINE, {
      x,
      y: stageY + 0.45,
      w: stageW - 0.3,
      h: 0,
      line: { color: C.accent, width: 0.7 },
    });
    s.addText(st.t, {
      x,
      y: stageY + 0.6,
      w: stageW,
      h: 0.6,
      fontFace: SERIF,
      fontSize: 22,
      color: C.ink,
      margin: 0,
    });
    s.addText(st.b, {
      x,
      y: stageY + 1.4,
      w: stageW - 0.2,
      h: 2.4,
      fontFace: SANS,
      fontSize: 12,
      color: C.muted,
      margin: 0,
      paraSpaceAfter: 3,
    });
  });

  // Bottom emphasis
  s.addText("From Telegram message to confirmed tx in roughly 15 seconds.", {
    x: 0.7,
    y: 6.3,
    w: SLIDE_W - 1.4,
    h: 0.5,
    fontFace: SERIF,
    italic: true,
    fontSize: 18,
    color: C.muted,
    margin: 0,
  });

  footerLine(s);
}

// ═════════════════════════════════════════════════════════════
// SLIDE 5 — CREDIBILITY SCORING
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s);
  kicker(s, 0.7, 0.75, "04  /  Credibility scoring");
  headline(
    s,
    0.7,
    1.3,
    SLIDE_W - 1.4,
    "Realized PnL is the honest signal.",
    46,
  );

  // Left — narrative
  s.addText(
    "Vitalik.eth shows \u221299% total PnL — his wallet is polluted by ENS names and received airdrops inflating total-invested.",
    {
      x: 0.7,
      y: 3.0,
      w: 6.0,
      h: 1.5,
      fontFace: SANS,
      fontSize: 16,
      color: C.muted,
      margin: 0,
      paraSpaceAfter: 6,
    },
  );
  s.addText(
    "Our score auto-detects this and falls back to realized PnL only: +10.3%. That's the number a copy-trader actually needs.",
    {
      x: 0.7,
      y: 4.5,
      w: 6.0,
      h: 1.5,
      fontFace: SANS,
      fontSize: 16,
      color: C.ink,
      margin: 0,
      paraSpaceAfter: 6,
    },
  );

  // Right — formula card
  s.addShape(pres.shapes.RECTANGLE, {
    x: 7.4,
    y: 2.8,
    w: 5.2,
    h: 2.5,
    fill: { color: C.bgCard },
    line: { color: C.line, width: 0.5 },
  });
  s.addText("FORMULA", {
    x: 7.7,
    y: 2.95,
    w: 4.8,
    h: 0.3,
    fontFace: SANS,
    fontSize: 9,
    color: C.accent,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  const formulaLines = [
    "score = 0.4 \u00B7 realized_pnl_norm",
    "      + 0.3 \u00B7 overall_win_rate",
    "      + 0.2 \u00B7 asset_win_rate",
    "      + 0.1 \u00B7 recency",
  ];
  s.addText(
    formulaLines.map((t, i) => ({
      text: t,
      options: { breakLine: i < formulaLines.length - 1 },
    })),
    {
      x: 7.7,
      y: 3.35,
      w: 4.8,
      h: 1.8,
      fontFace: MONO,
      fontSize: 14,
      color: C.ink,
      margin: 0,
      paraSpaceAfter: 2,
    },
  );

  // Tiers row
  s.addText("TIERS", {
    x: 7.7,
    y: 5.55,
    w: 4.8,
    h: 0.3,
    fontFace: SANS,
    fontSize: 9,
    color: C.accent,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  s.addText(
    [
      { text: "\u226575  Hot hand    ", options: { color: C.ink } },
      { text: "\u226550  Diamond hands    ", options: { color: C.muted } },
      { text: "\u226525  Mixed bag    ", options: { color: C.muted } },
      { text: "<25  Bag holder", options: { color: C.dim } },
    ],
    {
      x: 0.7,
      y: 5.9,
      w: SLIDE_W - 1.4,
      h: 0.5,
      fontFace: MONO,
      fontSize: 13,
      margin: 0,
    },
  );

  footerLine(s);
}

// ═════════════════════════════════════════════════════════════
// SLIDE 6 — SCOPED POLICIES
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s);
  kicker(s, 0.7, 0.75, "05  /  Scoped policies");
  headline(
    s,
    0.7,
    1.3,
    SLIDE_W - 1.4,
    "Every swap, every tick, gated.",
    46,
  );
  subhead(
    s,
    0.7,
    2.55,
    SLIDE_W - 1.4,
    "Mirror taps and DCA ticks funnel through one checkPolicy() call. No bypass. No god-mode agent.",
    16,
  );

  // Two-column table with divider lines
  const policies = [
    ["Max $ per trade", "$50"],
    ["Daily spend limit", "$200"],
    ["Allowed chains", "ethereum, base, solana"],
    ["Slippage cap", "0.5%"],
    ["Cooldown between trades", "30 min"],
    ["Auto-mirror", "off by default"],
  ];
  const rowY0 = 3.35;
  const rowH = 0.55;
  const tblX = 0.7;
  const tblW = SLIDE_W - 1.4;

  s.addShape(pres.shapes.LINE, {
    x: tblX,
    y: rowY0,
    w: tblW,
    h: 0,
    line: { color: C.line, width: 0.5 },
  });

  policies.forEach((row, i) => {
    const y = rowY0 + i * rowH + 0.1;
    s.addText(row[0], {
      x: tblX + 0.15,
      y,
      w: tblW * 0.55,
      h: rowH - 0.1,
      fontFace: SANS,
      fontSize: 15,
      color: C.muted,
      valign: "middle",
      margin: 0,
    });
    s.addText(row[1], {
      x: tblX + tblW * 0.55,
      y,
      w: tblW * 0.45 - 0.15,
      h: rowH - 0.1,
      fontFace: SERIF,
      fontSize: 20,
      color: C.ink,
      valign: "middle",
      align: "right",
      margin: 0,
    });
    s.addShape(pres.shapes.LINE, {
      x: tblX,
      y: rowY0 + (i + 1) * rowH,
      w: tblW,
      h: 0,
      line: { color: C.lineSoft, width: 0.5 },
    });
  });

  s.addText(
    "Rejections surface with a clear reason in the audit log. The schedule keeps running.",
    {
      x: 0.7,
      y: 6.6,
      w: SLIDE_W - 1.4,
      h: 0.3,
      fontFace: SANS,
      italic: true,
      fontSize: 12,
      color: C.dim,
      margin: 0,
    },
  );

  footerLine(s);
}

// ═════════════════════════════════════════════════════════════
// SLIDE 7 — ARCHITECTURE
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s);
  kicker(s, 0.7, 0.75, "06  /  Architecture");
  headline(
    s,
    0.7,
    1.3,
    SLIDE_W - 1.4,
    "One primitive. Every path funnels through it.",
    42,
  );

  // Three stacked rows
  const rowX = 0.7;
  const rowW = 9.0;

  // Row 1 — surfaces
  s.addShape(pres.shapes.RECTANGLE, {
    x: rowX,
    y: 2.9,
    w: rowW,
    h: 0.8,
    fill: { color: C.bgCard },
    line: { color: C.line, width: 0.5 },
  });
  s.addText("SURFACE", {
    x: rowX + 0.25,
    y: 3.0,
    w: 2,
    h: 0.3,
    fontFace: SANS,
    fontSize: 9,
    color: C.dim,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  s.addText("Telegram   \u2192   grammy runner (concurrent handlers)", {
    x: rowX + 0.25,
    y: 3.3,
    w: rowW - 0.5,
    h: 0.4,
    fontFace: SANS,
    fontSize: 16,
    color: C.ink,
    margin: 0,
  });

  // Row 2 — triggers
  s.addShape(pres.shapes.RECTANGLE, {
    x: rowX,
    y: 3.95,
    w: rowW,
    h: 0.8,
    fill: { color: C.bgCard },
    line: { color: C.line, width: 0.5 },
  });
  s.addText("TRIGGERS", {
    x: rowX + 0.25,
    y: 4.05,
    w: 2,
    h: 0.3,
    fontFace: SANS,
    fontSize: 9,
    color: C.dim,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  s.addText(
    [
      { text: "/wallet", options: { color: C.ink, fontFace: MONO } },
      { text: "     \u00B7     ", options: { color: C.dim } },
      { text: "/watch", options: { color: C.ink, fontFace: MONO } },
      { text: "     \u00B7     ", options: { color: C.dim } },
      { text: "/dca", options: { color: C.ink, fontFace: MONO } },
      { text: "     \u00B7     ", options: { color: C.dim } },
      { text: "Mirror tap", options: { color: C.ink } },
      { text: "     \u00B7     ", options: { color: C.dim } },
      { text: "/balance", options: { color: C.ink, fontFace: MONO } },
    ],
    {
      x: rowX + 0.25,
      y: 4.35,
      w: rowW - 0.5,
      h: 0.4,
      fontSize: 15,
      margin: 0,
    },
  );

  // Row 3 — primitive
  s.addShape(pres.shapes.RECTANGLE, {
    x: rowX,
    y: 5.0,
    w: rowW,
    h: 1.4,
    fill: { color: C.accentSoft },
    line: { color: C.accent, width: 0.7 },
  });
  s.addText("SHARED PRIMITIVE", {
    x: rowX + 0.25,
    y: 5.12,
    w: 4,
    h: 0.3,
    fontFace: SANS,
    fontSize: 9,
    color: C.accent,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  s.addText("buyAssetWithUsdc()", {
    x: rowX + 0.25,
    y: 5.4,
    w: rowW - 0.5,
    h: 0.5,
    fontFace: MONO,
    fontSize: 22,
    color: C.ink,
    bold: true,
    margin: 0,
  });
  s.addText(
    "balance check   \u2192   Zerion /swap/offers   \u2192   approve USDC   \u2192   sign (viem or ed25519)   \u2192   broadcast",
    {
      x: rowX + 0.25,
      y: 5.95,
      w: rowW - 0.5,
      h: 0.4,
      fontFace: SANS,
      fontSize: 13,
      color: C.muted,
      margin: 0,
    },
  );

  // Right caption box
  const capX = 10.0;
  s.addShape(pres.shapes.LINE, {
    x: capX,
    y: 2.9,
    w: 0,
    h: 3.5,
    line: { color: C.line, width: 0.5 },
  });
  s.addText("HOW IT CONNECTS", {
    x: capX + 0.3,
    y: 2.9,
    w: 2.6,
    h: 0.3,
    fontFace: SANS,
    fontSize: 9,
    color: C.accent,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  s.addText(
    "Zerion REST for swap offers, pnl, and history. Zerion CLI kept only for history polling. viem + @solana/web3.js handle signing locally on a per-user key.",
    {
      x: capX + 0.3,
      y: 3.3,
      w: 2.6,
      h: 3.0,
      fontFace: SANS,
      fontSize: 12,
      color: C.muted,
      margin: 0,
      paraSpaceAfter: 4,
    },
  );

  footerLine(s);
}

// ═════════════════════════════════════════════════════════════
// SLIDE 8 — WHAT'S ON TOP OF THE FORKED CLI
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s);
  kicker(s, 0.7, 0.75, "07  /  What we built");
  headline(
    s,
    0.7,
    1.3,
    SLIDE_W - 1.4,
    "Where we extended Zerion CLI.",
    46,
  );

  const colY = 2.9;
  const colW = (SLIDE_W - 1.4 - 0.4) / 2;

  // Left
  s.addText("FROM ZERION CLI", {
    x: 0.7,
    y: colY,
    w: colW,
    h: 0.3,
    fontFace: SANS,
    fontSize: 10,
    color: C.dim,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  s.addShape(pres.shapes.LINE, {
    x: 0.7,
    y: colY + 0.35,
    w: colW,
    h: 0,
    line: { color: C.line, width: 0.5 },
  });
  const left = [
    ["Swap routing", "/swap/offers endpoint for quotes and transactions"],
    ["Wallet analysis", "history, pnl, portfolio, positions"],
    ["Solana tx format", "versioned + legacy deserialization reference"],
  ];
  left.forEach((row, i) => {
    const y = colY + 0.6 + i * 0.95;
    s.addText(row[0], {
      x: 0.7,
      y,
      w: colW,
      h: 0.4,
      fontFace: SERIF,
      fontSize: 20,
      color: C.ink,
      margin: 0,
    });
    s.addText(row[1], {
      x: 0.7,
      y: y + 0.4,
      w: colW,
      h: 0.4,
      fontFace: SANS,
      fontSize: 12,
      color: C.muted,
      margin: 0,
    });
  });

  // Right
  s.addText("WE ADDED", {
    x: 0.7 + colW + 0.4,
    y: colY,
    w: colW,
    h: 0.3,
    fontFace: SANS,
    fontSize: 10,
    color: C.accent,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  s.addShape(pres.shapes.LINE, {
    x: 0.7 + colW + 0.4,
    y: colY + 0.35,
    w: colW,
    h: 0,
    line: { color: C.accent, width: 0.7 },
  });
  const right = [
    ["Per-user custodial wallets", "EVM + Solana, AES-256-GCM + scrypt per-user"],
    ["Credibility scoring engine", "realized PnL, win rate, asset win rate, recency"],
    ["Telegram interface", "grammy + runner for concurrent handlers"],
    ["DCA scheduler", "30-second tick, persisted in SQLite"],
    ["Scoped policy engine", "six caps, one checkPolicy() gate"],
    ["Unified buyAssetWithUsdc()", "one primitive for mirror + DCA + future"],
  ];
  const rightX = 0.7 + colW + 0.4;
  right.forEach((row, i) => {
    const y = colY + 0.6 + i * 0.5;
    s.addText(row[0], {
      x: rightX,
      y,
      w: colW,
      h: 0.3,
      fontFace: SANS,
      fontSize: 13,
      color: C.ink,
      bold: true,
      margin: 0,
    });
    s.addText(row[1], {
      x: rightX,
      y: y + 0.24,
      w: colW,
      h: 0.26,
      fontFace: SANS,
      fontSize: 10.5,
      color: C.muted,
      margin: 0,
    });
  });

  s.addText(
    "Telegram bots need unattended wallet generation per user. The CLI's interactive wallet create wasn't bot-shaped. Full friction log in repo.",
    {
      x: 0.7,
      y: 6.55,
      w: SLIDE_W - 1.4,
      h: 0.32,
      fontFace: SANS,
      italic: true,
      fontSize: 11,
      color: C.dim,
      margin: 0,
    },
  );

  footerLine(s);
}

// ═════════════════════════════════════════════════════════════
// SLIDE 9 — DEMO
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s);
  kicker(s, 0.7, 0.75, "08  /  Demo");
  headline(
    s,
    0.7,
    1.3,
    SLIDE_W - 1.4,
    "Live bot — @FrankRealBot.",
    46,
  );
  subhead(
    s,
    0.7,
    2.55,
    SLIDE_W - 1.4,
    "Telegram demo running 24/7 on Railway with a persistent SQLite volume. Code open-source. Real onchain txs confirmed on Basescan and Solscan.",
    15,
  );

  // Link cards
  const cardY = 3.8;
  const cardH = 2.0;
  const cards = [
    { label: "TELEGRAM", v: "t.me/FrankRealBot" },
    { label: "GITHUB", v: "github.com/frederik-maker/parasocial-bot" },
    { label: "WEBSITE", v: "frederik-maker.github.io/parasocial-bot" },
  ];
  const cardW = (SLIDE_W - 1.4 - 0.6) / cards.length;
  cards.forEach((c, i) => {
    const x = 0.7 + i * (cardW + 0.3);
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: C.bgCard },
      line: { color: C.line, width: 0.5 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y: cardY,
      w: 0.08,
      h: cardH,
      fill: { color: C.accent },
      line: { color: C.accent, width: 0 },
    });
    s.addText(c.label, {
      x: x + 0.35,
      y: cardY + 0.35,
      w: cardW - 0.5,
      h: 0.3,
      fontFace: SANS,
      fontSize: 10,
      color: C.accent,
      charSpacing: 3,
      bold: true,
      margin: 0,
    });
    s.addText(c.v, {
      x: x + 0.35,
      y: cardY + 0.8,
      w: cardW - 0.5,
      h: 1.0,
      fontFace: MONO,
      fontSize: 15,
      color: C.ink,
      margin: 0,
    });
  });

  s.addText("Every swap signed by a per-user key. Every swap policy-gated. No simulations.", {
    x: 0.7,
    y: 6.4,
    w: SLIDE_W - 1.4,
    h: 0.4,
    fontFace: SERIF,
    italic: true,
    fontSize: 16,
    color: C.muted,
    margin: 0,
  });

  footerLine(s);
}

// ═════════════════════════════════════════════════════════════
// SLIDE 10 — CLOSING
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  bg(s);

  // Small green line top-left as accent
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7,
    y: 0.75,
    w: 0.7,
    h: 0.08,
    fill: { color: C.accent },
    line: { color: C.accent, width: 0 },
  });

  s.addText("Parasocial", {
    x: 0.7,
    y: 2.3,
    w: SLIDE_W - 1.4,
    h: 2.8,
    fontFace: SERIF,
    fontSize: 140,
    color: C.ink,
    margin: 0,
  });

  s.addText(
    "Built by Frederik Bussler.  Forked Zerion CLI.  Real onchain.  No god-mode agents.",
    {
      x: 0.7,
      y: 5.4,
      w: SLIDE_W - 1.4,
      h: 0.5,
      fontFace: SERIF,
      italic: true,
      fontSize: 22,
      color: C.muted,
      margin: 0,
    },
  );

  s.addText("THANK YOU", {
    x: 0.7,
    y: 7.05,
    w: 4,
    h: 0.3,
    fontFace: SANS,
    fontSize: 10,
    color: C.accent,
    charSpacing: 4,
    bold: true,
    margin: 0,
  });
  s.addText("COLOSSEUM FRONTIER × ZERION  ·  APR 2026", {
    x: SLIDE_W - 5.7,
    y: 7.05,
    w: 5,
    h: 0.3,
    fontFace: SANS,
    fontSize: 10,
    color: C.dim,
    charSpacing: 3,
    bold: true,
    align: "right",
    margin: 0,
  });
  s.addShape(pres.shapes.LINE, {
    x: 0.7,
    y: 6.95,
    w: SLIDE_W - 1.4,
    h: 0,
    line: { color: C.line, width: 0.5 },
  });
}

// ──────────────────────────────────────────────────────────
pres
  .writeFile({ fileName: "/Users/frederikbussler/parasocial-bot/deck/parasocial.pptx" })
  .then((file) => console.log("WROTE:", file));
