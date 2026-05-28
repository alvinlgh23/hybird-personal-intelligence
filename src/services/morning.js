import { generateDigest } from "../ai/router.js";
import { inferMarketRegime } from "./marketData.js";
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

  const snapshot = market.value;
  const headlines = news.value;
  const fallback = buildFallbackMorning({ snapshot, headlines, gmail, earnings: earnings.value, watchlist: watchlist.value });

  const prompt = [
    "Create a professional personal morning intelligence brief for Telegram.",
    "Use detailed research-note style with short reasoning paragraphs, not shallow labels.",
    "Start with a section named: Top 3 things that matter today.",
    "Then use these sections: Executive summary, Macro regime, Liquidity conditions, Market / valuation read, Momentum / chase-risk read, Key catalysts, Key risks, What needs attention, What to watch next, Final interpretation.",
    "Explain why the market state matters instead of only saying risk-on, risk-off, or mixed.",
    "Ignore low-relevance headlines unless they clearly affect macro risk, liquidity, policy, supply chains, or major risk assets.",
    "Do not expose raw errors, stack traces, file paths, secrets, credentials, or tokens.",
    "Avoid direct buy/sell advice. End with: Not financial advice.",
    "",
    "Input:",
    JSON.stringify(
      {
        market: snapshot,
        marketReasoning: snapshot ? marketReasoning(snapshot) : "Market data unavailable.",
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
        },
      },
      null,
      2,
    ),
  ].join("\n");

  return generateDigest(prompt, { env, fallback, maxOutputTokens: 3200 });
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

function buildFallbackMorning({ snapshot, headlines, gmail, earnings, watchlist }) {
  const topThree = topThreeThings({ snapshot, headlines, earnings });
  const marketBlock = snapshot
    ? buildMarketStateBlock(snapshot)
    : "Market state\n\nMarket data unavailable. Watch DXY, US10Y, equity breadth, and BTC/ETH follow-through before reading risk appetite.";

  return [
    "Personal Morning Brief",
    "",
    "Top 3 things that matter today",
    ...topThree.map((item, index) => `${index + 1}. ${item}`),
    "",
    "1. What needs my attention",
    gmail.value,
    "",
    "2. Market state",
    marketBlock,
    "",
    "3. Earnings / major company events",
    formatEarningsOverview(earnings),
    "",
    "4. Watchlist",
    watchlist,
    "",
    "5. Market-Moving News",
    formatMarketMovingHeadlines(headlines),
    "",
    "6. What to watch next",
    "Watch whether yields and the dollar confirm or contradict equity leadership, whether AI/mega-cap breadth broadens, and whether crypto beta stabilizes rather than fading into strength.",
    "",
    "Final interpretation",
    "This is a cross-asset morning read for prioritization, not a trade instruction. Not financial advice.",
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

function topThreeThings({ snapshot, headlines, earnings }) {
  const regime = snapshot ? inferMarketRegime(snapshot) : null;
  const firstHeadline = headlines?.[0]?.title;
  const firstEarnings = earnings?.reportingToday?.[0] || earnings?.upcoming?.[0];
  return [
    regime ? `${marketSentence(regime)} The key confirmation points are DXY, US10Y, equity breadth, and BTC/ETH beta.` : "Market data is unavailable, so prioritize confirmation from rates, dollar, breadth, and major index futures.",
    firstHeadline ? `Headline risk to track: ${firstHeadline}` : "No high-signal market-moving headline is available yet; avoid over-reading low-relevance news.",
    firstEarnings ? `Earnings focus: ${firstEarnings.ticker} around ${firstEarnings.earningsDate || "date n/a"}; watch guidance and reaction more than the headline print.` : "No tracked mega-cap earnings event is flagged for today, so macro and breadth likely matter more.",
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

function buildMarketStateBlock(snapshot) {
  return [
    "Cross-Asset Snapshot",
    "",
    `BTC: ${formatAsset(snapshot.crypto.btc)}`,
    `ETH: ${formatAsset(snapshot.crypto.eth)}`,
    `S&P 500: ${formatQuote(snapshot.macro.sp500)}`,
    `Nasdaq: ${formatQuote(snapshot.macro.nasdaq)}`,
    `DXY: ${formatQuote(snapshot.macro.dxy)}`,
    `US10Y: ${formatYield(snapshot.macro.us10y)}`,
    "",
    "Reasoning",
    marketReasoning(snapshot),
  ].join("\n");
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
