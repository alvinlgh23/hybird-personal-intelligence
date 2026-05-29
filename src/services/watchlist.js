import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getQuotes } from "./marketData.js";
import { getCompanyHeadlines } from "./news.js";
import { getTickerEarnings } from "./earnings.js";
import { runValuation, valuationAvailable } from "./valuation.js";
import { formatPct, formatPrice } from "../utils/format.js";
import { safeJsonParse } from "../utils/safeJson.js";

const DEFAULT_WATCHLIST = ["NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "META", "TSLA"];

export function getWatchlist(env) {
  const fromEnv = parseTickers(env.WATCHLIST || "");
  if (fromEnv.length) return fromEnv;

  const path = watchlistPath(env);
  if (!existsSync(path)) return DEFAULT_WATCHLIST;
  const data = safeJsonParse(readFileSync(path, "utf8"), {});
  return parseTickers((data.tickers || []).join(","));
}

export function addTicker(ticker, env) {
  const symbol = normalizeTicker(ticker);
  const list = [...new Set([...getWatchlist(env), symbol])];
  writeWatchlist(list, env);
  return list;
}

export function removeTicker(ticker, env) {
  const symbol = normalizeTicker(ticker);
  const list = getWatchlist(env).filter((item) => item !== symbol);
  writeWatchlist(list, env);
  return list;
}

export async function buildWatchlistBrief(env) {
  const tickers = getWatchlist(env);
  const includeValuation = env.WATCHLIST_VALUATION_ENABLED === "true" && valuationAvailable(env);
  const [quotes, headlineGroups, earnings] = await Promise.all([
    getQuotes(tickers),
    Promise.all(tickers.slice(0, 8).map((ticker) => getCompanyHeadlines(ticker, { env, limit: 1 }))),
    Promise.all(tickers.slice(0, 8).map((ticker) => getTickerEarnings(ticker, { env }))),
  ]);
  const valuations = includeValuation
    ? await Promise.all(tickers.slice(0, 5).map((ticker) => runValuation(ticker, { env, mode: "value" }).catch(() => null)))
    : [];
  const chases = includeValuation
    ? await Promise.all(tickers.slice(0, 5).map((ticker) => runValuation(ticker, { env, mode: "chase" }).catch(() => null)))
    : [];

  const lines = ["Watchlist Brief", ""];
  for (const ticker of tickers) {
    const quote = quotes.find((item) => item?.symbol === ticker);
    const news = headlineGroups.flat().find((item) => item.ticker === ticker);
    const earning = earnings.find((item) => item?.ticker === ticker);
    const valuation = valuations.find((item) => item?.ticker === ticker);
    const chase = chases.find((item) => item?.ticker === ticker);
    lines.push(`${ticker}: ${quote ? `${formatPrice(quote.price)} (${formatPct(quote.changePct)})` : "n/a"}`);
    if (earning?.earningsDate) lines.push(`  Earnings: ${earning.earningsDate}`);
    if (news?.title) lines.push(`  News: ${news.title}`);
    if (valuation?.data?.fair_value_estimate) lines.push(`  Valuation: FV ${formatPrice(Number(valuation.data.fair_value_estimate))}, upside ${formatPct(Number(valuation.data.upside_downside_pct))}`);
    if (chase?.data?.warning_level) lines.push(`  Chase risk: ${chase.data.warning_level}`);
  }

  lines.push("", "Read: Watch for unusual moves around earnings, AI headlines, and rate-sensitive risk appetite. Not financial advice.");
  return lines.join("\n");
}

function writeWatchlist(tickers, env) {
  const path = watchlistPath(env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ tickers }, null, 2));
}

function watchlistPath(env) {
  return resolve(env.WATCHLIST_PATH || ".data/watchlist.json");
}

function parseTickers(value) {
  return value
    .split(",")
    .map(normalizeTicker)
    .filter(Boolean);
}

function normalizeTicker(value) {
  return String(value || "")
    .trim()
    .replace(/^\$/u, "")
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/gu, "");
}
