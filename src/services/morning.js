import { generateDigest } from "../ai/router.js";
import { fetchYahooQuote, getQuotes, inferMarketRegime } from "./marketData.js";
import { buildEmailDigest } from "./emailDigest.js";
import { getEarningsOverview, formatEarningsOverview } from "./earnings.js";
import { listUnreadEmails } from "./gmail.js";
import { getMarketSnapshot } from "./marketData.js";
import { formatMarketMovingHeadlines, getMarketMovingHeadlines } from "./news.js";
import { buildWatchlistBrief } from "./watchlist.js";
import { formatPct, formatPrice, formatValue } from "../utils/format.js";

const CLOUD_GMAIL_MESSAGE = "Gmail not connected in cloud mode.";

export async function buildMorningDigest({ env }) {
  const market = await safeSection("market", () => getMarketSnapshot(), null);
  const [gmail, earnings, watchlist, news] = await Promise.all([
    buildGmailSection(env),
    safeSection("earnings", () => getEarningsOverview(), emptyEarnings()),
    safeSection("watchlist", () => buildWatchlistBrief(env), "Watchlist\n\nUnavailable."),
    safeSection("news", () => getMarketMovingHeadlines({ env, limit: 6 }), []),
  ]);
  const structure = await safeSection("market structure", () => getInstitutionalMarketContext(env), emptyStructure());

  const snapshot = market.value;
  const headlines = news.value;
  const fallback = buildFallbackMorning({ snapshot, headlines, gmail, earnings: earnings.value, watchlist: watchlist.value, structure: structure.value });

  const prompt = [
    "Write an institutional-grade cross-asset morning intelligence brief for Telegram.",
    "Voice: hedge-fund morning note / macro desk strategist. Concise, analytical, cause-and-effect driven.",
    "This is not a news summary. Identify market-driving themes and explain why they matter.",
    "Use exactly these section headers:",
    "1. TOP 3 THINGS THAT ACTUALLY MATTER TODAY",
    "2. MACRO REGIME ANALYSIS",
    "3. CROSS-ASSET INTERPRETATION",
    "4. MARKET STRUCTURE ANALYSIS",
    "5. EARNINGS + MEGA CAP INTELLIGENCE",
    "6. CRYPTO + LIQUIDITY",
    "7. POSITIONING + RISK",
    "8. WHAT TO WATCH NEXT",
    "9. ACTIONABLE CONCLUSION",
    "Analyze DXY, US10Y, liquidity backdrop, Nasdaq, breadth proxies, volatility, policy expectations, and whether the rally is healthy or fragile.",
    "Explain relationships: yields vs growth stocks, DXY vs crypto, oil vs inflation, semiconductors vs AI momentum, liquidity vs speculative assets.",
    "Discuss narrow leadership, AI concentration risk, momentum crowding, defensive rotation, cyclicals vs growth, and mega-cap/AI earnings implications.",
    "For crypto, infer speculative appetite and sustainability from BTC/ETH and macro liquidity. Mention stablecoin/ETF flows only if not directly available as unavailable, not invented.",
    "Do not give direct buy/sell advice. Use scenario-based reasoning and state what could invalidate the current trend.",
    "Keep each section readable on mobile: 1 short paragraph or 2-4 tight bullets. Total target: 1800-3200 words max.",
    "Do not expose raw errors, stack traces, file paths, secrets, credentials, or tokens.",
    "End with: Not financial advice.",
    "",
    "Input:",
    JSON.stringify(
      {
        market: snapshot,
        marketReasoning: snapshot ? marketReasoning(snapshot) : "Market data unavailable.",
        structure: structure.value,
        headlines,
        earnings: earnings.value,
        watchlist: watchlist.value,
        emailDigest: gmail.value,
        sectionStatus: {
          gmail: gmail.ok ? "ok" : gmail.message,
          market: market.ok ? "ok" : market.message,
          earnings: earnings.ok ? "ok" : earnings.message,
          watchlist: watchlist.ok ? "ok" : watchlist.message,
          news: news.ok ? "ok" : news.message,
          marketStructure: structure.ok ? "ok" : structure.message,
        },
      },
      null,
      2,
    ),
  ].join("\n");

  return generateDigest(prompt, { env, fallback, maxOutputTokens: 5200 });
}

async function buildGmailSection(env) {
  try {
    const emails = await listUnreadEmails({ env, limit: 10 });
    if (!emails.length) return { ok: true, value: "Daily Digest\n\nNo unread Gmail messages.", message: "" };
    return { ok: true, value: await buildEmailDigest(emails, { env }), message: "" };
  } catch (error) {
    const message = gmailMessage(env, error);
    return { ok: false, value: `Daily Digest\n\n${message}`, message };
  }
}

function buildFallbackMorning({ snapshot, headlines, gmail, earnings, watchlist, structure }) {
  const topThree = topThreeThings({ snapshot, headlines, earnings, structure });
  const marketBlock = snapshot
    ? buildMarketStateBlock(snapshot, structure)
    : "Market state\n\nMarket data unavailable. Watch DXY, US10Y, equity breadth, and BTC/ETH follow-through before reading risk appetite.";

  return [
    "Institutional Morning Intelligence Brief",
    "",
    "1. TOP 3 THINGS THAT ACTUALLY MATTER TODAY",
    ...topThree.map((item, index) => `${index + 1}. ${item}`),
    "",
    "2. MACRO REGIME ANALYSIS",
    marketBlock,
    "",
    "3. CROSS-ASSET INTERPRETATION",
    crossAssetFallback(snapshot, structure),
    "",
    "4. MARKET STRUCTURE ANALYSIS",
    marketStructureFallback(structure),
    "",
    "5. EARNINGS + MEGA CAP INTELLIGENCE",
    [formatEarningsOverview(earnings), "", "Mega-cap watchlist context", watchlist].join("\n"),
    "",
    "6. CRYPTO + LIQUIDITY",
    cryptoLiquidityFallback(snapshot),
    "",
    "7. POSITIONING + RISK",
    positioningFallback(snapshot, structure),
    "",
    "8. WHAT TO WATCH NEXT",
    [
      "Watch CPI/PCE/Fed communication, Treasury auctions, US10Y and DXY confirmation, AI capex commentary, mega-cap earnings revisions, geopolitical risk, and whether crypto beta confirms or rejects easier liquidity.",
      "",
      formatMarketMovingHeadlines(headlines),
      "",
      "Gmail / personal attention",
      gmail.value,
    ].join("\n"),
    "",
    "9. ACTIONABLE CONCLUSION",
    actionableConclusionFallback(snapshot),
    "",
    "Not financial advice.",
  ].join("\n\n");
}

async function safeSection(name, fn, fallback) {
  try {
    return { ok: true, value: await fn(), message: "" };
  } catch (error) {
    const message = safeErrorMessage(name, error);
    console.error(`Morning ${name} section failed: ${message}`);
    return { ok: false, value: fallback, message };
  }
}

async function getInstitutionalMarketContext(env) {
  const megaCapTickers = ["NVDA", "MSFT", "META", "AMZN", "AAPL", "GOOGL", "TSLA", "PLTR", "AMD", "TSM", "MU", "AVGO", "SNOW"];
  const [vix, oil, rsp, iwm, soxx, megaCaps] = await Promise.all([
    fetchYahooQuote("%5EVIX", "VIX"),
    fetchYahooQuote("CL=F", "WTI crude"),
    fetchYahooQuote("RSP", "S&P 500 equal weight"),
    fetchYahooQuote("IWM", "Russell 2000"),
    fetchYahooQuote("SOXX", "Semiconductors"),
    getQuotes(megaCapTickers),
  ]);

  return {
    volatility: vix,
    oil,
    breadthProxies: { equalWeightSp500: rsp, russell2000: iwm },
    semiconductors: soxx,
    megaCaps: megaCaps.filter(Boolean),
    stablecoinFlows: "not available from configured data sources",
    cryptoEtfFlows: "not available from configured data sources",
    policyExpectations: "infer from DXY, US10Y, equities, and volatility; no Fed funds futures feed configured",
  };
}

function topThreeThings({ snapshot, headlines, earnings, structure }) {
  const regime = snapshot ? inferMarketRegime(snapshot) : null;
  const firstHeadline = headlines?.[0]?.title;
  const firstEarnings = earnings?.reportingToday?.[0] || earnings?.upcoming?.[0];
  const semis = structure?.semiconductors;
  const breadth = structure?.breadthProxies?.equalWeightSp500;
  return [
    regime ? `${marketSentence(regime)} What matters is whether lower yields/dollar pressure broaden participation beyond the same AI leaders, or simply invite another chase into crowded duration risk.` : "Market data is unavailable, so the first priority is confirming rates, dollar, breadth, and volatility before trusting index moves.",
    semis ? `AI infrastructure remains the market's swing factor: semiconductors are ${formatQuote(semis)}, while equal-weight breadth is ${formatQuote(breadth)}. That spread helps separate healthy participation from narrow AI-led index strength.` : "AI/semiconductor leadership is still the main market-structure variable; without breadth confirmation, index strength can be fragile.",
    firstHeadline ? `Headline risk to track: ${firstHeadline}. The question is whether it changes liquidity, earnings revisions, AI capex expectations, or policy risk.` : firstEarnings ? `Earnings focus: ${firstEarnings.ticker} around ${firstEarnings.earningsDate || "date n/a"}; guidance and reaction matter more than the headline print.` : "No single scheduled catalyst dominates yet, so the session likely trades on macro confirmation, AI leadership, and positioning.",
  ];
}

function marketReasoning(snapshot) {
  const regime = inferMarketRegime(snapshot);
  return [
    marketSentence(regime),
    `Liquidity reads as ${regime.liquidity} because the dollar/yield complex is the main pressure valve for long-duration equities and crypto beta.`,
    `Crypto sentiment is ${regime.cryptoSentiment}; that matters because BTC and ETH often reveal whether speculative liquidity is improving or merely chasing a narrow equity move.`,
    `Main risks: ${regime.risks.join("; ")}.`,
  ].join(" ");
}

function buildMarketStateBlock(snapshot, structure) {
  const regime = inferMarketRegime(snapshot);
  return [
    "Cross-Asset Snapshot",
    "",
    `BTC: ${formatAsset(snapshot.crypto.btc)}`,
    `ETH: ${formatAsset(snapshot.crypto.eth)}`,
    `S&P 500: ${formatQuote(snapshot.macro.sp500)}`,
    `Nasdaq: ${formatQuote(snapshot.macro.nasdaq)}`,
    `DXY: ${formatQuote(snapshot.macro.dxy)}`,
    `US10Y: ${formatYield(snapshot.macro.us10y)}`,
    `VIX: ${formatQuote(structure?.volatility)}`,
    `WTI crude: ${formatQuote(structure?.oil)}`,
    `Equal-weight S&P proxy: ${formatQuote(structure?.breadthProxies?.equalWeightSp500)}`,
    `Russell 2000 proxy: ${formatQuote(structure?.breadthProxies?.russell2000)}`,
    "",
    "Regime read",
    `${marketReasoning(snapshot)} Current conditions look ${regime.macroPolicy} from a policy/liquidity lens. A healthy rally would show easing yields, softer dollar pressure, stable volatility, and improving breadth; a fragile rally would rely mainly on Nasdaq/AI momentum while cyclicals, small caps, or crypto fail to confirm.`,
  ].join("\n");
}

function crossAssetFallback(snapshot, structure) {
  if (!snapshot) return "Cross-asset data unavailable. The main relationships to monitor are yields versus growth stocks, DXY versus crypto, oil versus inflation expectations, and semiconductors versus AI momentum.";
  return [
    `Yields vs growth: US10Y at ${formatYield(snapshot.macro.us10y)} is the pressure point for long-duration equities. Falling yields can support Nasdaq multiples; a yield reversal would challenge the rally.`,
    `DXY vs crypto: DXY at ${formatQuote(snapshot.macro.dxy)} matters because a softer dollar usually helps liquidity-sensitive assets, while a dollar rebound can drain speculative appetite.`,
    `Oil vs inflation: WTI at ${formatQuote(structure?.oil)} is relevant because an oil spike can reprice inflation risk and reduce Fed easing confidence.`,
    `Semis vs AI: SOXX at ${formatQuote(structure?.semiconductors)} is the cleanest proxy for whether AI infrastructure momentum is still leading or starting to fatigue.`,
  ].join("\n");
}

function marketStructureFallback(structure) {
  const megaCaps = structure?.megaCaps || [];
  const leaders = megaCaps
    .filter((item) => Number.isFinite(item.changePct))
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 4)
    .map((item) => `${item.symbol}: ${formatPct(item.changePct)}`)
    .join(", ");
  const laggards = megaCaps
    .filter((item) => Number.isFinite(item.changePct))
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, 3)
    .map((item) => `${item.symbol}: ${formatPct(item.changePct)}`)
    .join(", ");

  return [
    `Breadth check: equal-weight S&P is ${formatQuote(structure?.breadthProxies?.equalWeightSp500)} and Russell 2000 is ${formatQuote(structure?.breadthProxies?.russell2000)}. If these lag while Nasdaq rises, leadership is narrow and more dependent on mega-cap duration.`,
    `AI concentration: semiconductor proxy ${formatQuote(structure?.semiconductors)}. Persistent semi leadership supports the AI capex narrative; fading semis while indexes hold up raises concentration risk.`,
    leaders ? `Mega-cap leaders today: ${leaders}.` : "Mega-cap leadership data unavailable.",
    laggards ? `Mega-cap laggards today: ${laggards}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function cryptoLiquidityFallback(snapshot) {
  if (!snapshot) return "Crypto data unavailable. Watch BTC/ETH against DXY and US10Y for liquidity confirmation.";
  return [
    `BTC is ${formatAsset(snapshot.crypto.btc)} and ETH is ${formatAsset(snapshot.crypto.eth)}. The signal is less about the absolute move and more about whether crypto confirms the equity/liquidity backdrop.`,
    `With DXY at ${formatQuote(snapshot.macro.dxy)} and US10Y at ${formatYield(snapshot.macro.us10y)}, sustainable crypto strength would require dollar/yield pressure to stay contained.`,
    "Stablecoin and ETF flow feeds are not configured, so institutional participation cannot be confirmed directly from this bot yet.",
  ].join("\n");
}

function positioningFallback(snapshot, structure) {
  const regime = snapshot ? inferMarketRegime(snapshot) : null;
  return [
    regime ? `Positioning risk: ${regime.risks.join("; ")}.` : "Positioning risk is unclear without market data.",
    `Crowding watch: if Nasdaq/semis outperform while equal-weight and Russell proxies lag, the rally is more vulnerable to AI de-risking and momentum unwind.`,
    `Volatility watch: VIX at ${formatQuote(structure?.volatility)}. Low or falling volatility can support carry and chase behavior, but it also masks gap risk if rates or dollar reverse.`,
  ].join("\n");
}

function actionableConclusionFallback(snapshot) {
  if (!snapshot) return "Current posture: neutral until market data confirms. What matters most next is rates, dollar, breadth, and AI leadership. The trend is invalidated if volatility jumps and liquidity-sensitive assets fail together.";
  const regime = inferMarketRegime(snapshot);
  return `Current posture: ${regime.riskTone}, but confirmation matters more than the label. The most important next signal is whether easier liquidity broadens beyond AI/mega-cap leadership. The current trend would be invalidated by a dollar/yield reversal, rising volatility, weak breadth, or crypto failing to confirm speculative appetite.`;
}

function emptyStructure() {
  return {
    volatility: null,
    oil: null,
    breadthProxies: { equalWeightSp500: null, russell2000: null },
    semiconductors: null,
    megaCaps: [],
    stablecoinFlows: "not available",
    cryptoEtfFlows: "not available",
    policyExpectations: "not available",
  };
}

function marketSentence(regime) {
  if (regime.riskTone === "risk-on") {
    return "The tape leans constructive because equities and/or crypto are absorbing the current dollar-yield backdrop, but the setup still needs breadth confirmation.";
  }
  if (regime.riskTone === "risk-off") {
    return "The tape leans defensive because liquidity pressure or weak beta is outweighing equity support, which raises the risk of multiple compression.";
  }
  return "The tape is mixed because cross-asset signals are not aligned; this calls for confirmation rather than chasing the first move.";
}

function gmailMessage(env, error) {
  const message = String(error?.message || "");
  if ((env.AGENT_MODE || "local") === "cloud" && /gmail|token|oauth|not connected|no such file/i.test(message)) return CLOUD_GMAIL_MESSAGE;
  if (message.startsWith("Missing Gmail config")) return message;
  if (message.startsWith("Gmail not connected in cloud")) return CLOUD_GMAIL_MESSAGE;
  if (message.startsWith("Gmail is not connected")) return message;
  return (env.AGENT_MODE || "local") === "cloud" ? CLOUD_GMAIL_MESSAGE : "Gmail unavailable. Run /gmail_auth or try again later.";
}

function safeErrorMessage(name, error) {
  const message = String(error?.message || `${name} unavailable`).replace(/\s+/gu, " ").trim();
  if (/no such file|ENOENT|os error|spawn|stack|\/Users\/|\/app\//iu.test(message)) return `${name} unavailable.`;
  return message.length > 160 ? `${message.slice(0, 160)}...` : message;
}

function emptyEarnings() {
  return { reportingToday: [], upcoming: [], tracked: [] };
}

function formatAsset(asset) {
  if (!asset) return "n/a";
  return `${formatPrice(asset.price)} (${formatPct(asset.changePct)})`;
}

function formatQuote(quote) {
  if (!quote) return "n/a";
  return `${formatValue(quote.price)} (${formatPct(quote.changePct)})`;
}

function formatYield(quote) {
  if (!quote) return "n/a";
  return `${quote.price.toFixed(2)}% (${formatPct(quote.changePct)})`;
}
