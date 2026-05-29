import { generateDeepBrief } from "../ai/router.js";
import { formatPct, formatValue } from "../utils/format.js";
import { buildEmailDigest } from "./emailDigest.js";
import { getEarningsOverview, formatEarningsOverview } from "./earnings.js";
import { listUnreadEmails } from "./gmail.js";
import { fetchYahooQuote, getMarketSnapshot, getQuotes, inferMarketRegime } from "./marketData.js";
import { getMarketMovingHeadlines } from "./news.js";
import { renderMorningBrief } from "./intelligenceRenderer.js";
import { runValuation, valuationAvailable } from "./valuation.js";
import { buildWatchlistBrief } from "./watchlist.js";

const CLOUD_GMAIL_MESSAGE = "Gmail not connected in cloud. Run /gmail_auth or configure GMAIL_TOKEN_JSON.";
const FOCUS_TICKERS = ["NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "META", "TSLA", "PLTR", "MU", "TSM", "AMD", "AVGO", "CRM", "SNOW", "COST", "DELL"];

export async function buildMorningDigest({ env }) {
  const context = await loadMorningContext(env, { includeModel: false });
  return buildMorningTerminal(context);
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

function buildMorningTerminal(context) {
  return renderMorningBrief({
    date: compactDate(),
    signals: rankMorningSignals(context),
    marketPulse: marketPulseLines(context),
    watch: watchToday(context),
  });
}

function rankMorningSignals(context) {
  const signals = [];
  const headlineSignals = (context.headlines || []).slice(0, 5).map((item) => ({
    title: cleanHeadline(item.title),
    aiInsight: morningHeadlineInsight(item),
    signal: clampSignal(item.relevanceScore || 6),
  }));
  signals.push(...headlineSignals);

  const liquidity = liquiditySignal(context);
  if (liquidity) signals.push(liquidity);

  const ai = aiInfrastructureSignal(context);
  if (ai) signals.push(ai);

  const crypto = cryptoSignal(context);
  if (crypto) signals.push(crypto);

  const earnings = earningsSignal(context);
  if (earnings) signals.push(earnings);

  return dedupeSignals(signals)
    .filter((item) => item.signal >= 6)
    .sort((a, b) => b.signal - a.signal)
    .concat(fallbackSignals())
    .slice(0, 3);
}

function liquiditySignal(context) {
  if (!context.snapshot) return null;
  const dxy = context.snapshot.macro.dxy;
  const us10y = context.snapshot.macro.us10y;
  if (!Number.isFinite(dxy?.changePct) && !Number.isFinite(us10y?.changePct)) return null;
  const easing = (dxy?.changePct || 0) < -0.15 || (us10y?.changePct || 0) < -0.15;
  const tightening = (dxy?.changePct || 0) > 0.15 || (us10y?.changePct || 0) > 0.15;
  return {
    title: easing ? "Dollar/yield pressure is easing" : tightening ? "Dollar/yield pressure is back on the tape" : "Liquidity signal is mixed",
    aiInsight: easing
      ? "Liquidity backdrop still favors long-duration AI trades if breadth confirms."
      : tightening
        ? "Higher yields or dollar strength can quickly compress duration growth and crypto beta."
        : "Cross-asset liquidity is not giving a clean green light; wait for DXY and US10Y confirmation.",
    signal: tightening || easing ? 8 : 6,
  };
}

function aiInfrastructureSignal(context) {
  const semis = context.structure.value?.semiconductors;
  const nasdaq = context.snapshot?.macro?.nasdaq;
  if (!Number.isFinite(semis?.changePct) && !Number.isFinite(nasdaq?.changePct)) return null;
  const strong = (semis?.changePct || 0) > 0.5 || (nasdaq?.changePct || 0) > 0.5;
  const weak = (semis?.changePct || 0) < -0.5;
  return {
    title: weak ? "Semis are not confirming AI risk appetite" : strong ? "AI infrastructure remains the market’s swing factor" : "AI leadership needs confirmation",
    aiInsight: weak
      ? "If semis lag while indexes hold, leadership quality is deteriorating beneath the surface."
      : strong
        ? "Capital is still treating compute, chips, and data-center capex as the core growth-duration trade."
        : "Watch whether chip leadership broadens or fades into another narrow mega-cap tape.",
    signal: strong || weak ? 8 : 7,
  };
}

function cryptoSignal(context) {
  const btc = context.snapshot?.crypto?.btc;
  const eth = context.snapshot?.crypto?.eth;
  if (!Number.isFinite(btc?.changePct) && !Number.isFinite(eth?.changePct)) return null;
  const weak = (btc?.changePct || 0) < -1 || (eth?.changePct || 0) < -1;
  const strong = (btc?.changePct || 0) > 1 || (eth?.changePct || 0) > 1;
  return {
    title: weak ? "Crypto beta is not confirming equity optimism" : strong ? "Crypto beta is confirming speculative liquidity" : "Crypto beta is neutral",
    aiInsight: weak
      ? "BTC/ETH weakness says speculative liquidity is thinner than the equity tape suggests."
      : strong
        ? "Crypto strength points to broader risk appetite, especially if DXY and yields stay contained."
        : "No strong crypto confirmation yet; treat equity strength without beta follow-through carefully.",
    signal: weak || strong ? 7 : 6,
  };
}

function earningsSignal(context) {
  const today = context.earnings.value?.reportingToday || [];
  const upcoming = context.earnings.value?.upcoming || [];
  const item = today[0] || upcoming[0];
  if (!item?.ticker) return null;
  return {
    title: `${item.ticker} keeps earnings sensitivity on deck`,
    aiInsight: "Guidance quality matters more than the print; AI capex, margins, and forward demand decide whether leadership can broaden.",
    signal: today.length ? 7 : 6,
  };
}

function morningHeadlineInsight(item) {
  const text = `${item.title || ""} ${item.category || ""}`.toLowerCase();
  if (/(ai|semiconductor|chip|nvidia|data center|datacenter|gpu)/u.test(text)) return "AI hardware demand, supply chains, and capex durability remain the dominant growth narrative.";
  if (/(fed|yield|rate|treasury|inflation|cpi|pce|powell)/u.test(text)) return "Rates are the valuation pressure valve for duration equities, credit, and crypto beta.";
  if (/(china|taiwan|war|sanction|defense|geopolitic|tariff)/u.test(text)) return "Geopolitical risk is feeding directly into supply chains, sanctions, defense alignment, and risk premia.";
  if (/(oil|energy|opec|crude|gas)/u.test(text)) return "Energy volatility is the fastest route from geopolitics into inflation risk and margin pressure.";
  if (/(bitcoin|crypto|ethereum|stablecoin|etf)/u.test(text)) return "Crypto remains the cleanest read on speculative liquidity beyond mega-cap equities.";
  if (/(earnings|guidance|margin|revenue|capex)/u.test(text)) return "Earnings guidance is the test for whether price momentum has fundamental backing.";
  return item.marketNarrativeImpact || "Strategic read-through depends on whether capital, policy, or sector leadership reacts.";
}

function marketPulseLines(context) {
  const snap = context.snapshot;
  if (!snap) return ["Market data unavailable"];
  return [
    `SPX ${shortPct(snap.macro.sp500?.changePct)}`,
    `NDX ${shortPct(snap.macro.nasdaq?.changePct)}`,
    `BTC ${shortPct(snap.crypto.btc?.changePct)}`,
    `ETH ${shortPct(snap.crypto.eth?.changePct)}`,
    `DXY ${shortPct(snap.macro.dxy?.changePct)}`,
    `US10Y ${Number.isFinite(snap.macro.us10y?.price) ? `${snap.macro.us10y.price.toFixed(2)}%` : "n/a"}`,
  ];
}

function watchToday(context) {
  const watch = ["semis", "AI infra", "yields", "geopolitics", "energy"];
  if ((context.earnings.value?.reportingToday || []).length || (context.earnings.value?.upcoming || []).length) watch.push("earnings");
  watch.push("liquidity");
  return [...new Set(watch)].slice(0, 7);
}

function compactDate() {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(new Date());
}

function cleanHeadline(value) {
  return String(value || "Global signal").replace(/\s+/gu, " ").trim().slice(0, 110);
}

function clampSignal(value) {
  const score = Math.round(Number(value) || 6);
  return Math.max(6, Math.min(10, score));
}

function shortPct(value) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function dedupeSignals(signals) {
  const seen = new Set();
  return signals.filter((item) => {
    const key = item.title.toLowerCase().replace(/[^\w\s]/gu, "").split(/\s+/u).slice(0, 6).join(" ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackSignals() {
  return [
    {
      title: "Data feeds are thin; prioritize confirmation over narrative",
      aiInsight: "When live feeds are missing, the first clean tells are yields, DXY, semis, and crypto beta.",
      signal: 6,
    },
    {
      title: "AI infrastructure remains the default leadership test",
      aiInsight: "Compute, chips, and data-center capex still decide whether growth leadership is durable or just narrow index momentum.",
      signal: 6,
    },
    {
      title: "Liquidity remains the main cross-asset pressure valve",
      aiInsight: "A dollar/yield reversal can quickly change the tone for duration equities, crypto, and speculative beta.",
      signal: 6,
    },
  ];
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

function marketReasoning(snapshot) {
  const regime = inferMarketRegime(snapshot);
  return [
    marketSentence(regime),
    `Liquidity reads as ${regime.liquidity}; the dollar/yield complex is the pressure valve for long-duration equities and crypto beta.`,
    `Crypto sentiment is ${regime.cryptoSentiment}, which matters because BTC/ETH often reveal whether speculative liquidity is confirming the equity tape.`,
    `Main risks: ${regime.risks.join("; ")}.`,
  ].join(" ");
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

function formatQuote(quote) {
  if (!quote) return "n/a";
  return `${formatValue(quote.price)} (${formatPct(quote.changePct)})`;
}

function formatYield(quote) {
  if (!quote) return "n/a";
  return `${quote.price.toFixed(2)}% (${formatPct(quote.changePct)})`;
}
