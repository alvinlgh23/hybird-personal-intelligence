import { generateDeepBrief, generateDigest } from "../ai/router.js";
import { formatPct, formatPrice, formatValue } from "../utils/format.js";
import { buildEmailDigest } from "./emailDigest.js";
import { getEarningsOverview, formatEarningsOverview } from "./earnings.js";
import { listUnreadEmails } from "./gmail.js";
import { fetchYahooQuote, getMarketSnapshot, getQuotes, inferMarketRegime } from "./marketData.js";
import { formatMarketMovingHeadlines, getMarketMovingHeadlines } from "./news.js";
import { runValuation, valuationAvailable } from "./valuation.js";
import { buildWatchlistBrief } from "./watchlist.js";

const CLOUD_GMAIL_MESSAGE = "Gmail not connected in cloud. Run /gmail_auth or configure GMAIL_TOKEN_JSON.";
const FOCUS_TICKERS = ["NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "META", "TSLA", "PLTR", "MU", "TSM", "AMD", "AVGO", "CRM", "SNOW", "COST", "DELL"];

export async function buildMorningDigest({ env }) {
  const context = await loadMorningContext(env, { includeModel: false });
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
  const context = await loadMorningContext(env, { includeModel: true });
  const fallback = buildDeepBriefFallback(context);
  const prompt = [
    "Write a complete institutional capital-flow intelligence report for Telegram.",
    "Voice: hedge-fund strategist / capital-flow analyst. Detailed, structured, and cause-and-effect driven.",
    "Use modelOutput as the core input when present; otherwise synthesize from market, news, earnings, and structure data.",
    "Use exactly these section headers:",
    "1. GLOBAL LIQUIDITY CONDITIONS",
    "2. MACRO FRAGILITY ANALYSIS",
    "3. MACRO CATALYST MONITOR",
    "4. SECTOR ROTATION ANALYSIS",
    "5. SECTOR POSITIONING ANALYSIS",
    "6. COMPANY INTELLIGENCE",
    "7. POSITIONING / OVERHEAT",
    "8. FINAL MARKET INTERPRETATION",
    "9. CAPITAL FLOW STORY",
    "10. MARKET PHASE",
    "11. LEADERSHIP DURABILITY",
    "12. REGIME PLAYBOOK",
    "13. MARKET RISK MAP",
    "14. SCENARIO ANALYSIS",
    "15. EARLY ROTATION CANDIDATES",
    "16. CROWDING VS QUALITY MATRIX",
    "17. NARRATIVE DECAY WARNINGS",
    "Include US10Y, US30Y, DXY, USDJPY/carry, VIX, liquidity regime, breadth, sector rotation, capital flow story, market phase, risk map, scenario analysis, and narrative decay warnings.",
    "Do not give direct buy/sell advice. End with: Not financial advice.",
    "",
    "Input:",
    JSON.stringify(buildAiInput(context), null, 2),
  ].join("\n");

  return generateDeepBrief(prompt, { env, fallback, maxOutputTokens: 5200 });
}

async function loadMorningContext(env, { includeModel = false } = {}) {
  const market = await safeSection("market", () => getMarketSnapshot(), null);
  const [gmail, earnings, watchlist, news, structure] = await Promise.all([
    buildGmailSection(env),
    safeSection("earnings", () => getEarningsOverview({ tickers: FOCUS_TICKERS }), emptyEarnings()),
    safeSection("watchlist", () => buildWatchlistBrief(env), "Watchlist\n\nUnavailable."),
    safeSection("news", () => getMarketMovingHeadlines({ env, limit: 5 }), []),
    safeSection("market structure", () => getMarketStructure(), emptyStructure()),
  ]);
  const modelOutput = includeModel ? await safeSection("model output", () => getModelOutput(env, structure.value), []) : { ok: true, value: [], message: "" };

  return {
    snapshot: market.value,
    gmail,
    earnings,
    watchlist,
    headlines: news.value,
    structure,
    modelOutput,
    sectionStatus: {
      gmail: gmail.ok ? "ok" : gmail.message,
      market: market.ok ? "ok" : market.message,
      earnings: earnings.ok ? "ok" : earnings.message,
      watchlist: watchlist.ok ? "ok" : watchlist.message,
      news: news.ok ? "ok" : news.message,
      marketStructure: structure.ok ? "ok" : structure.message,
      modelOutput: modelOutput.ok ? "ok" : modelOutput.message,
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
    modelOutput: context.modelOutput.value,
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
  const [vix, oil, us30y, usdJpy, rsp, iwm, soxx, focusQuotes] = await Promise.all([
    fetchYahooQuote("%5EVIX", "VIX"),
    fetchYahooQuote("CL=F", "WTI crude"),
    fetchYahooQuote("%5ETYX", "US30Y"),
    fetchYahooQuote("JPY=X", "USDJPY"),
    fetchYahooQuote("RSP", "S&P 500 equal weight"),
    fetchYahooQuote("IWM", "Russell 2000"),
    fetchYahooQuote("SOXX", "Semiconductors"),
    getQuotes(FOCUS_TICKERS),
  ]);

  return {
    volatility: vix,
    oil,
    us30y,
    usdJpy,
    breadthProxies: { equalWeightSp500: rsp, russell2000: iwm },
    semiconductors: soxx,
    focusQuotes: focusQuotes.filter(Boolean),
    stablecoinFlows: "not available from configured data sources",
    cryptoEtfFlows: "not available from configured data sources",
    m2Trend: "not available from configured data sources",
    consumerSentiment: "not available from configured data sources",
    pmiIsm: "not available from configured data sources",
  };
}

async function getModelOutput(env, structure) {
  if (!valuationAvailable(env)) return [];
  const candidates = [...new Set([...(structure?.focusQuotes || []).sort((a, b) => Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0)).slice(0, 4).map((item) => item.symbol), "NVDA", "PLTR"])]
    .filter(Boolean)
    .slice(0, 6);
  const results = await Promise.all(candidates.map((ticker) => runValuation(ticker, { env, mode: "full" }).catch((error) => ({ ok: false, ticker, message: safeErrorMessage("model", error) }))));
  return results.map((result) => ({
    ticker: result.ticker,
    ok: result.ok,
    summary: result.data?.summary || result.message || "",
    data: result.data?.data || result.data || null,
    warnings: result.data?.warnings || [],
  }));
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
  return [
    "Capital-Flow Deep Brief",
    "",
    "1. GLOBAL LIQUIDITY CONDITIONS",
    globalLiquidityFallback(context.snapshot, context.structure.value),
    "",
    "2. MACRO FRAGILITY ANALYSIS",
    macroFragilityFallback(context),
    "",
    "3. MACRO CATALYST MONITOR",
    "Watch CPI, PCE, PPI, labor-market data, Treasury auctions, Fed speakers, and any inflation surprise that can reprice the rate path.",
    "",
    "4. SECTOR ROTATION ANALYSIS",
    marketStructureFallback(context.structure.value),
    "",
    "5. SECTOR POSITIONING ANALYSIS",
    sectorPositioningFallback(context.structure.value),
    "",
    "6. COMPANY INTELLIGENCE",
    [formatEarningsOverview(context.earnings.value), "", "Mega-cap/watchlist context", context.watchlist.value].join("\n"),
    "",
    "7. POSITIONING / OVERHEAT",
    modelOutputFallback(context.modelOutput.value) || positioningFallback(context.snapshot, context.structure.value),
    "",
    "8. FINAL MARKET INTERPRETATION",
    actionableConclusionFallback(context.snapshot),
    "",
    "9. CAPITAL FLOW STORY",
    capitalFlowStoryFallback(context),
    "",
    "10. MARKET PHASE",
    marketPhaseFallback(context.snapshot, context.structure.value),
    "",
    "11. LEADERSHIP DURABILITY",
    leadershipDurabilityFallback(context.structure.value),
    "",
    "12. REGIME PLAYBOOK",
    regimePlaybookFallback(context.snapshot),
    "",
    "13. MARKET RISK MAP",
    marketRiskMapFallback(context.snapshot),
    "",
    "14. SCENARIO ANALYSIS",
    scenarioFallback(context.snapshot),
    "",
    "15. EARLY ROTATION CANDIDATES",
    earlyRotationFallback(context.structure.value),
    "",
    "16. CROWDING VS QUALITY MATRIX",
    crowdingQualityFallback(context.structure.value),
    "",
    "17. NARRATIVE DECAY WARNINGS",
    narrativeDecayFallback(context),
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

function globalLiquidityFallback(snapshot, structure) {
  if (!snapshot) return "Liquidity data unavailable.";
  return [
    `US10Y: ${formatYield(snapshot.macro.us10y)} | US30Y: ${formatYield(structure?.us30y)} | DXY: ${formatQuote(snapshot.macro.dxy)} | USDJPY: ${formatQuote(structure?.usdJpy)} | VIX: ${formatQuote(structure?.volatility)}.`,
    `Liquidity regime: ${inferMarketRegime(snapshot).liquidity}. M2 trend: ${structure?.m2Trend || "not available"}. Carry pressure should be inferred from USDJPY and yields until a dedicated feed is configured.`,
  ].join("\n");
}

function macroFragilityFallback(context) {
  return [
    `Breadth proxy: ${formatQuote(context.structure.value?.breadthProxies?.equalWeightSp500)} versus Nasdaq ${formatQuote(context.snapshot?.macro?.nasdaq)}.`,
    `Consumer sentiment: ${context.structure.value?.consumerSentiment || "not available"}. PMI/ISM: ${context.structure.value?.pmiIsm || "not available"}.`,
    "Interpretation: if asset prices rise while breadth, small caps, or real-economy indicators lag, the move is more narrative-led and more sensitive to macro disappointment.",
  ].join("\n");
}

function sectorPositioningFallback(structure) {
  return [
    `Leading proxy: semiconductors at ${formatQuote(structure?.semiconductors)}.`,
    `Breadth participation: equal-weight S&P ${formatQuote(structure?.breadthProxies?.equalWeightSp500)}, Russell 2000 ${formatQuote(structure?.breadthProxies?.russell2000)}.`,
    "Narrative type: AI infrastructure / duration growth. Stage: momentum if semis lead with breadth; fragility if semis alone carry index performance.",
  ].join("\n");
}

function modelOutputFallback(modelOutput) {
  if (!Array.isArray(modelOutput) || !modelOutput.length) return "";
  return modelOutput
    .filter((item) => item.ok)
    .slice(0, 5)
    .map((item) => `${item.ticker}: ${item.summary || "model output available"} ${item.warnings?.length ? `Warnings: ${item.warnings.join("; ")}` : ""}`.trim())
    .join("\n");
}

function capitalFlowStoryFallback(context) {
  const semis = context.structure.value?.semiconductors;
  const breadth = context.structure.value?.breadthProxies?.equalWeightSp500;
  return `Capital appears most sensitive to the AI/liquidity channel: semis ${formatQuote(semis)}, breadth ${formatQuote(breadth)}, DXY ${formatQuote(context.snapshot?.macro?.dxy)}, and US10Y ${formatYield(context.snapshot?.macro?.us10y)}. A durable flow story needs leadership to broaden from AI into equal-weight, small caps, or software infrastructure.`;
}

function marketPhaseFallback(snapshot, structure) {
  if (!snapshot) return "Phase: unknown.";
  const regime = inferMarketRegime(snapshot);
  const semis = structure?.semiconductors?.changePct || 0;
  const breadth = structure?.breadthProxies?.equalWeightSp500?.changePct || 0;
  if (regime.riskTone === "risk-on" && breadth > 0 && semis > 0) return "Phase: institutional momentum. Liquidity and leadership are aligned, but watch crowding.";
  if (semis > 0 && breadth <= 0) return "Phase: narrative-led momentum / fragility. Leadership is concentrated and vulnerable to AI de-risking.";
  if (regime.riskTone === "risk-off") return "Phase: distribution / correction risk. Liquidity or beta confirmation is weak.";
  return "Phase: transition. Confirmation from breadth, volatility, and crypto is still needed.";
}

function leadershipDurabilityFallback(structure) {
  const semis = structure?.semiconductors?.changePct || 0;
  const breadth = structure?.breadthProxies?.equalWeightSp500?.changePct || 0;
  const vix = structure?.volatility?.changePct || 0;
  const score = Math.max(0, Math.min(100, 55 + Math.sign(semis) * 15 + Math.sign(breadth) * 20 - Math.sign(vix) * 10));
  return `${score}/100. Durability improves when semis, breadth, small caps, and low volatility confirm together; it weakens when leadership narrows into crowded AI names.`;
}

function regimePlaybookFallback(snapshot) {
  const regime = snapshot ? inferMarketRegime(snapshot) : null;
  return [
    `Usually favored: ${regime?.liquidity === "easier backdrop" ? "quality growth, AI infrastructure, crypto beta if confirmed, and liquid mega-cap leadership" : "cash-flow quality, defensives, lower-duration balance sheets, and lower-beta exposures"}.`,
    "Usually vulnerable: crowded long-duration growth if yields/dollar reverse, speculative beta without earnings support, and low-quality momentum after volatility rises.",
  ].join("\n");
}

function marketRiskMapFallback(snapshot) {
  const risks = snapshot ? inferMarketRegime(snapshot).risks : ["macro data unavailable"];
  return [
    "Inflation surprise: can reprice Fed path and yields.",
    "Narrow leadership: raises index fragility.",
    "Fed sensitivity: high while duration risk leads.",
    "Dollar/yield reversal: direct pressure on growth and crypto.",
    `Current inferred risks: ${risks.join("; ")}.`,
  ].join("\n");
}

function scenarioFallback(snapshot) {
  return [
    "Bullish confirmation: yields stay contained, DXY softens, breadth improves, semis hold leadership, VIX remains stable, and crypto stops diverging negatively.",
    "Bearish invalidation: US10Y/DXY reverse higher, VIX jumps, equal-weight and small caps lag badly, AI leadership fades, or earnings guidance fails to support the narrative.",
  ].join("\n");
}

function earlyRotationFallback(structure) {
  const quotes = (structure?.focusQuotes || []).filter((item) => Number.isFinite(item.changePct)).sort((a, b) => b.changePct - a.changePct).slice(0, 5);
  return quotes.length ? quotes.map((item) => `${item.symbol}: ${formatPct(item.changePct)}`).join(", ") : "No early rotation candidates available from current quote set.";
}

function crowdingQualityFallback(structure) {
  const leaders = (structure?.focusQuotes || []).filter((item) => Number.isFinite(item.changePct)).sort((a, b) => b.changePct - a.changePct).slice(0, 4);
  if (!leaders.length) return "Matrix unavailable.";
  return leaders.map((item) => `${item.symbol}: high-quality/moderate-crowding if supported by earnings revisions; speculative blowoff risk rises if price runs without guidance support.`).join("\n");
}

function narrativeDecayFallback(context) {
  return [
    "Watch for AI leadership failing to respond to good news, semis lagging Nasdaq, breadth deteriorating, crypto failing despite easier liquidity, or earnings beats being sold.",
    context.headlines?.[0] ? `Current headline to test narrative durability: ${context.headlines[0].title}` : "No high-signal headline currently tests the dominant narrative.",
  ].join("\n");
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
