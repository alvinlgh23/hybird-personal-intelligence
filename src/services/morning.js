import { generateDigest } from "../ai/router.js";
import { formatPct, formatPrice, formatValue } from "../utils/format.js";
import { buildEmailDigest } from "./emailDigest.js";
import { getEarningsOverview, formatEarningsOverview } from "./earnings.js";
import { listUnreadEmails } from "./gmail.js";
import { fetchYahooQuote, getMarketSnapshot, getQuotes, inferMarketRegime } from "./marketData.js";
import { formatMarketMovingHeadlines, getMarketMovingHeadlines } from "./news.js";
import { buildWatchlistBrief } from "./watchlist.js";

const CLOUD_GMAIL_MESSAGE = "Gmail not connected in cloud. Run /gmail_auth or configure GOOGLE_OAUTH_TOKEN_JSON.";
const FOCUS_TICKERS = ["NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "META", "TSLA", "PLTR", "MU", "TSM", "AMD", "AVGO", "CRM", "SNOW", "COST", "DELL"];

export async function buildMorningDigest({ env }) {
  const context = await loadMorningContext(env);
  const fallback = buildMorningFallback(context);
  const prompt = [
    "Write a fast, high-signal morning dashboard for Telegram. Optimize for a 30-60 second read right after waking up.",
    "Answer: what happened overnight, what earnings/news matter, and what should I watch today?",
    "Do not write a long macro essay. Use crisp sections, tight bullets, and every item must answer 'so what?'.",
    "Use exactly these section headers:",
    "1. OVERNIGHT HEADLINES THAT MATTER",
    "2. EARNINGS RADAR",
    "3. MARKET SNAPSHOT",
    "4. TODAY'S FOCUS",
    "5. PERSONAL / GMAIL",
    "For each headline include: Headline, Source, Why it matters, Market narrative impact.",
    "Use only high-relevance headlines affecting Fed/rates, inflation, AI/semiconductors, mega-cap tech, crypto, China/geopolitics, energy shock, major earnings, or liquidity.",
    "For earnings, include reported/upcoming, reaction if available, and narrative impact. Focus on NVDA, MSFT, AAPL, AMZN, GOOGL, META, TSLA, PLTR, MU, TSM, AMD, AVGO, CRM, SNOW, COST, DELL.",
    "For market snapshot, include key numbers but add 3-5 sentences on what the market is pricing, whether the move is broad or narrow, and what confirms/invalidates it.",
    "Avoid generic finance filler and unexplained risk-on/risk-off labels. No direct buy/sell advice.",
    "Keep it concise and mobile-readable. Target 500-900 words max.",
    "",
    "Input:",
    JSON.stringify(buildAiInput(context), null, 2),
  ].join("\n");

  return generateDigest(prompt, { env, fallback, maxOutputTokens: 2600 });
}

export async function buildDeepBrief({ env }) {
  const context = await loadMorningContext(env);
  const fallback = buildDeepBriefFallback(context);
  const prompt = [
    "Write an institutional-grade cross-asset morning intelligence brief for Telegram.",
    "Voice: hedge-fund morning note / macro desk strategist. Detailed, analytical, and cause-and-effect driven.",
    "Use exactly these section headers:",
    "1. TOP 3 THINGS THAT ACTUALLY MATTER",
    "2. MACRO REGIME",
    "3. CROSS-ASSET INTERPRETATION",
    "4. MARKET STRUCTURE",
    "5. EARNINGS + MEGA CAP INTELLIGENCE",
    "6. CRYPTO + LIQUIDITY",
    "7. POSITIONING + RISK",
    "8. WHAT TO WATCH NEXT",
    "9. FINAL INTERPRETATION",
    "Use scenario-based thinking and second-order effects.",
    "Explain yields vs growth stocks, DXY vs crypto, oil vs inflation, semiconductors vs AI momentum, and liquidity vs speculative assets.",
    "Discuss narrow leadership, AI concentration risk, momentum crowding, defensive rotation, cyclicals vs growth, mega-cap/AI earnings, and what would invalidate the current trend.",
    "Do not give direct buy/sell advice. End with: Not financial advice.",
    "",
    "Input:",
    JSON.stringify(buildAiInput(context), null, 2),
  ].join("\n");

  return generateDigest(prompt, { env, fallback, maxOutputTokens: 5200 });
}

async function loadMorningContext(env) {
  const market = await safeSection("market", () => getMarketSnapshot(), null);
  const [gmail, earnings, watchlist, news, structure] = await Promise.all([
    buildGmailSection(env),
    safeSection("earnings", () => getEarningsOverview({ tickers: FOCUS_TICKERS }), emptyEarnings()),
    safeSection("watchlist", () => buildWatchlistBrief(env), "Watchlist\n\nUnavailable."),
    safeSection("news", () => getMarketMovingHeadlines({ env, limit: 5 }), []),
    safeSection("market structure", () => getMarketStructure(), emptyStructure()),
  ]);

  return {
    snapshot: market.value,
    gmail,
    earnings,
    watchlist,
    headlines: news.value,
    structure,
    sectionStatus: {
      gmail: gmail.ok ? "ok" : gmail.message,
      market: market.ok ? "ok" : market.message,
      earnings: earnings.ok ? "ok" : earnings.message,
      watchlist: watchlist.ok ? "ok" : watchlist.message,
      news: news.ok ? "ok" : news.message,
      marketStructure: structure.ok ? "ok" : structure.message,
    },
  };
}

function buildAiInput(context) {
  return {
    market: context.snapshot,
    marketReasoning: context.snapshot ? marketReasoning(context.snapshot) : "Market data unavailable.",
    headlines: context.headlines,
    earnings: context.earnings.value,
    watchlist: context.watchlist.value,
    structure: context.structure.value,
    emailDigest: context.gmail.value,
    sectionStatus: context.sectionStatus,
  };
}

async function buildGmailSection(env) {
  try {
    const emails = await listUnreadEmails({ env, limit: 10 });
    if (!emails.length) return { ok: true, value: "No important unread Gmail messages.", message: "" };
    return { ok: true, value: await buildEmailDigest(emails, { env }), message: "" };
  } catch (error) {
    const message = gmailMessage(env, error);
    return { ok: false, value: message, message };
  }
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

async function getMarketStructure() {
  const [vix, oil, rsp, iwm, soxx, focusQuotes] = await Promise.all([
    fetchYahooQuote("%5EVIX", "VIX"),
    fetchYahooQuote("CL=F", "WTI crude"),
    fetchYahooQuote("RSP", "S&P 500 equal weight"),
    fetchYahooQuote("IWM", "Russell 2000"),
    fetchYahooQuote("SOXX", "Semiconductors"),
    getQuotes(FOCUS_TICKERS),
  ]);

  return {
    volatility: vix,
    oil,
    breadthProxies: { equalWeightSp500: rsp, russell2000: iwm },
    semiconductors: soxx,
    focusQuotes: focusQuotes.filter(Boolean),
    stablecoinFlows: "not available from configured data sources",
    cryptoEtfFlows: "not available from configured data sources",
  };
}

function buildMorningFallback(context) {
  return [
    "Morning Dashboard",
    "",
    "1. OVERNIGHT HEADLINES THAT MATTER",
    formatDashboardHeadlines(context.headlines),
    "",
    "2. EARNINGS RADAR",
    earningsRadarFallback(context.earnings.value, context.structure.value),
    "",
    "3. MARKET SNAPSHOT",
    context.snapshot ? [marketSnapshotLines(context.snapshot, context.structure.value), "", morningMarketRead(context.snapshot, context.structure.value)].join("\n") : "Market data unavailable. Watch rates, DXY, breadth, and Nasdaq futures first.",
    "",
    "4. TODAY'S FOCUS",
    todaysFocusFallback(context),
    "",
    "5. PERSONAL / GMAIL",
    context.gmail.value,
    "",
    "Not financial advice.",
  ].join("\n\n");
}

function buildDeepBriefFallback(context) {
  const topThree = topThreeThings(context);
  return [
    "Institutional Deep Brief",
    "",
    "1. TOP 3 THINGS THAT ACTUALLY MATTER",
    ...topThree.map((item, index) => `${index + 1}. ${item}`),
    "",
    "2. MACRO REGIME",
    context.snapshot ? [marketSnapshotLines(context.snapshot, context.structure.value), "", marketReasoning(context.snapshot)].join("\n") : "Market data unavailable.",
    "",
    "3. CROSS-ASSET INTERPRETATION",
    crossAssetFallback(context.snapshot, context.structure.value),
    "",
    "4. MARKET STRUCTURE",
    marketStructureFallback(context.structure.value),
    "",
    "5. EARNINGS + MEGA CAP INTELLIGENCE",
    [formatEarningsOverview(context.earnings.value), "", "Mega-cap/watchlist context", context.watchlist.value].join("\n"),
    "",
    "6. CRYPTO + LIQUIDITY",
    cryptoLiquidityFallback(context.snapshot),
    "",
    "7. POSITIONING + RISK",
    positioningFallback(context.snapshot, context.structure.value),
    "",
    "8. WHAT TO WATCH NEXT",
    [todaysFocusFallback(context), "", formatMarketMovingHeadlines(context.headlines)].join("\n"),
    "",
    "9. FINAL INTERPRETATION",
    actionableConclusionFallback(context.snapshot),
    "",
    "Not financial advice.",
  ].join("\n\n");
}

function formatDashboardHeadlines(headlines) {
  if (!headlines.length) return "No high-signal overnight headlines found. Avoid over-reading generic market chatter.";
  return headlines
    .slice(0, 4)
    .map((item) =>
      [
        `Headline: ${item.title}`,
        `Source: ${item.source || "RSS"}`,
        `Why it matters: ${item.why}`,
        `Market narrative impact: ${item.marketNarrativeImpact}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function earningsRadarFallback(earnings, structure) {
  const tracked = [...(earnings.reportingToday || []), ...(earnings.upcoming || [])].slice(0, 8);
  const reactions = quoteMap(structure?.focusQuotes || []);
  if (!tracked.length) return "No focus-name earnings date is flagged for today. Watch guidance read-through from AI infrastructure, mega-cap software, consumer demand, and margin commentary.";
  return tracked
    .map((item) => {
      const reaction = reactions.get(item.ticker);
      return [
        `${item.ticker}: ${item.earningsDate?.startsWith(new Date().toISOString().slice(0, 10)) ? "reporting today" : "upcoming"} (${item.earningsDate || "date n/a"})`,
        `Reaction: ${reaction ? formatQuote(reaction) : "n/a"}`,
        `Narrative impact: Watch whether guidance confirms earnings revisions, AI/capex demand, margin resilience, or consumer softness.`,
      ].join("\n");
    })
    .join("\n\n");
}

function marketSnapshotLines(snapshot, structure) {
  return [
    `S&P 500: ${formatQuote(snapshot.macro.sp500)}`,
    `Nasdaq: ${formatQuote(snapshot.macro.nasdaq)}`,
    `DXY: ${formatQuote(snapshot.macro.dxy)}`,
    `US10Y: ${formatYield(snapshot.macro.us10y)}`,
    `VIX: ${formatQuote(structure?.volatility)}`,
    `BTC: ${formatAsset(snapshot.crypto.btc)}`,
    `ETH: ${formatAsset(snapshot.crypto.eth)}`,
    `Semis proxy: ${formatQuote(structure?.semiconductors)}`,
    `Equal-weight / breadth proxy: ${formatQuote(structure?.breadthProxies?.equalWeightSp500)}`,
  ].join("\n");
}

function morningMarketRead(snapshot, structure) {
  const regime = inferMarketRegime(snapshot);
  const breadth = structure?.breadthProxies?.equalWeightSp500;
  const semis = structure?.semiconductors;
  return [
    `The market is pricing ${regime.liquidity} with ${formatQuote(snapshot.macro.dxy)} DXY and ${formatYield(snapshot.macro.us10y)} US10Y, which is supportive only if rates and the dollar stay contained.`,
    `The move looks ${breadth && semis && Number.isFinite(breadth.changePct) && Number.isFinite(semis.changePct) && breadth.changePct >= semis.changePct * 0.5 ? "healthier because breadth is participating" : "potentially narrow because AI/semis still need breadth confirmation"}.`,
    `Crypto is ${regime.cryptoSentiment}; if BTC/ETH keep fading while Nasdaq rallies, speculative liquidity is not fully confirming the equity move.`,
    "Confirmation comes from breadth, semis, lower volatility, and stable yields. Invalidation comes from a DXY/yield reversal, rising VIX, or mega-cap AI leadership fading.",
  ].join(" ");
}

function todaysFocusFallback(context) {
  const firstEarnings = context.earnings.value.reportingToday?.[0] || context.earnings.value.upcoming?.[0];
  return [
    "1. Rates/dollar: US10Y and DXY need to stay contained for growth-stock multiples and crypto beta to hold.",
    "2. AI follow-through: semis and data-center beneficiaries must confirm that the AI capex story is broadening, not exhausting.",
    "3. Breadth: equal-weight and small-cap proxies need to participate; otherwise the index move is fragile.",
    firstEarnings ? `4. Earnings: ${firstEarnings.ticker} ${firstEarnings.earningsDate || ""} matters for guidance and narrative read-through.` : "4. Earnings: watch focus-name guidance, capex, margins, and market reaction.",
    "5. Gmail/action items: scan the personal section for anything time-sensitive.",
  ].join("\n");
}

function topThreeThings(context) {
  const regime = context.snapshot ? inferMarketRegime(context.snapshot) : null;
  const firstHeadline = context.headlines?.[0];
  const semis = context.structure.value?.semiconductors;
  const breadth = context.structure.value?.breadthProxies?.equalWeightSp500;
  return [
    regime ? `${marketSentence(regime)} The real question is whether liquidity support broadens beyond crowded AI/mega-cap leadership.` : "Market data is unavailable, so prioritize rates, dollar, breadth, and volatility confirmation.",
    semis ? `AI infrastructure remains the swing factor: semis are ${formatQuote(semis)} versus equal-weight breadth at ${formatQuote(breadth)}.` : "AI/semiconductor leadership remains the key market-structure variable.",
    firstHeadline ? `${firstHeadline.title}: ${firstHeadline.marketNarrativeImpact}` : "No high-signal headline dominates yet; avoid over-reading generic overnight noise.",
  ];
}

function marketReasoning(snapshot) {
  const regime = inferMarketRegime(snapshot);
  return [
    marketSentence(regime),
    `Liquidity reads as ${regime.liquidity}; the dollar/yield complex is the pressure valve for long-duration equities and crypto beta.`,
    `Crypto sentiment is ${regime.cryptoSentiment}, which matters because BTC/ETH often reveal whether speculative liquidity is confirming the equity tape.`,
    `Main risks: ${regime.risks.join("; ")}.`,
  ].join(" ");
}

function crossAssetFallback(snapshot, structure) {
  if (!snapshot) return "Cross-asset data unavailable.";
  return [
    `Yields vs growth: US10Y at ${formatYield(snapshot.macro.us10y)} is the pressure point for Nasdaq multiples.`,
    `DXY vs crypto: DXY at ${formatQuote(snapshot.macro.dxy)} can either release or drain speculative liquidity.`,
    `Oil vs inflation: WTI at ${formatQuote(structure?.oil)} matters because an oil shock can reprice inflation and Fed expectations.`,
    `Semis vs AI: SOXX at ${formatQuote(structure?.semiconductors)} shows whether AI infrastructure momentum is still leading.`,
  ].join("\n");
}

function marketStructureFallback(structure) {
  const quotes = structure?.focusQuotes || [];
  const leaders = quotes
    .filter((item) => Number.isFinite(item.changePct))
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 4)
    .map((item) => `${item.symbol}: ${formatPct(item.changePct)}`)
    .join(", ");
  const laggards = quotes
    .filter((item) => Number.isFinite(item.changePct))
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, 3)
    .map((item) => `${item.symbol}: ${formatPct(item.changePct)}`)
    .join(", ");

  return [
    `Breadth check: equal-weight S&P is ${formatQuote(structure?.breadthProxies?.equalWeightSp500)} and Russell 2000 is ${formatQuote(structure?.breadthProxies?.russell2000)}.`,
    `AI concentration: semis proxy is ${formatQuote(structure?.semiconductors)}. If semis fade while indexes hold, concentration risk rises.`,
    leaders ? `Focus-name leaders: ${leaders}.` : "Focus-name leadership data unavailable.",
    laggards ? `Focus-name laggards: ${laggards}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function cryptoLiquidityFallback(snapshot) {
  if (!snapshot) return "Crypto data unavailable.";
  return [
    `BTC is ${formatAsset(snapshot.crypto.btc)} and ETH is ${formatAsset(snapshot.crypto.eth)}.`,
    `Sustainable crypto strength needs DXY at ${formatQuote(snapshot.macro.dxy)} and US10Y at ${formatYield(snapshot.macro.us10y)} to stay contained.`,
    "Stablecoin and ETF flow feeds are not configured, so institutional participation cannot be confirmed directly.",
  ].join("\n");
}

function positioningFallback(snapshot, structure) {
  const regime = snapshot ? inferMarketRegime(snapshot) : null;
  return [
    regime ? `Positioning risk: ${regime.risks.join("; ")}.` : "Positioning risk is unclear without market data.",
    "Crowding risk rises if Nasdaq/semis outperform while equal-weight and Russell proxies lag.",
    `Volatility watch: VIX at ${formatQuote(structure?.volatility)}. Low volatility supports chase behavior but can mask gap risk.`,
  ].join("\n");
}

function actionableConclusionFallback(snapshot) {
  if (!snapshot) return "Current posture: neutral until market data confirms. Watch rates, dollar, breadth, AI leadership, and volatility.";
  const regime = inferMarketRegime(snapshot);
  return `Current posture: ${regime.riskTone}, but confirmation matters more than the label. The trend needs breadth and liquidity confirmation; it is invalidated by a dollar/yield reversal, rising volatility, weak breadth, or crypto failing to confirm speculative appetite.`;
}

function marketSentence(regime) {
  if (regime.riskTone === "risk-on") return "The tape leans constructive, but it still needs breadth confirmation.";
  if (regime.riskTone === "risk-off") return "The tape leans defensive because liquidity pressure or weak beta is outweighing equity support.";
  return "The tape is mixed because cross-asset signals are not aligned.";
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

function emptyStructure() {
  return {
    volatility: null,
    oil: null,
    breadthProxies: { equalWeightSp500: null, russell2000: null },
    semiconductors: null,
    focusQuotes: [],
    stablecoinFlows: "not available",
    cryptoEtfFlows: "not available",
  };
}

function quoteMap(quotes) {
  return new Map(quotes.map((quote) => [quote.symbol, quote]));
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
