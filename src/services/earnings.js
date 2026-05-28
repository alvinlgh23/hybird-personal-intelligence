import { safeFetchJson } from "../utils/fetch.js";
import { DEFAULT_IMPORTANT_TICKERS, fetchYahooQuote } from "./marketData.js";
import { formatPct, formatPrice } from "../utils/format.js";

export async function getEarningsOverview({ tickers = DEFAULT_IMPORTANT_TICKERS } = {}) {
  const items = await Promise.all(tickers.map((ticker) => getTickerEarnings(ticker)));
  const today = todayKey();
  const reportingToday = items.filter((item) => item?.earningsDate?.startsWith(today));
  const upcoming = items.filter((item) => item?.earningsDate && !item.earningsDate.startsWith(today)).slice(0, 8);

  return { reportingToday, upcoming, tracked: items.filter(Boolean) };
}

export async function getTickerEarnings(ticker) {
  const symbol = ticker.toUpperCase();
  const [summary, quote] = await Promise.all([
    safeFetchJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=calendarEvents,earnings`),
    fetchYahooQuote(symbol, symbol),
  ]);

  const result = summary?.quoteSummary?.result?.[0];
  const earningsDate = result?.calendarEvents?.earnings?.earningsDate?.[0]?.fmt || result?.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
  const epsEstimate = result?.calendarEvents?.earnings?.earningsAverage?.fmt;
  const revenueEstimate = result?.calendarEvents?.earnings?.revenueAverage?.fmt;

  return {
    ticker: symbol,
    earningsDate: earningsDate ? String(earningsDate) : null,
    epsEstimate: epsEstimate || null,
    revenueEstimate: revenueEstimate || null,
    price: quote?.price || null,
    changePct: quote?.changePct ?? null,
  };
}

export function formatEarningsOverview(data) {
  const lines = ["Earnings Radar", ""];
  lines.push("Reporting today:");
  lines.push(...(data.reportingToday.length ? data.reportingToday.map(formatEarningLine) : ["- No tracked mega-cap names found for today."]));
  lines.push("", "Upcoming / tracked:");
  lines.push(...(data.upcoming.length ? data.upcoming.map(formatEarningLine) : ["- No upcoming tracked dates available."]));
  lines.push("", "Focus names: NVDA, MSFT, AAPL, AMZN, GOOGL, META, TSLA, PLTR, MU, TSM, AMD, AVGO, CRM, SNOW");
  return lines.join("\n");
}

export function formatTickerEarnings(item) {
  if (!item) return "Earnings data unavailable.";
  return [
    `${item.ticker} Earnings`,
    "",
    `Latest price: ${item.price ? `${formatPrice(item.price)} (${formatPct(item.changePct)})` : "n/a"}`,
    `Next/report date: ${item.earningsDate || "n/a"}`,
    `EPS estimate: ${item.epsEstimate || "n/a"}`,
    `Revenue estimate: ${item.revenueEstimate || "n/a"}`,
    "Market reaction: use price change and guidance headlines as confirmation.",
    "Risks: estimate revisions, margin commentary, AI/capex demand, and macro sensitivity.",
    "",
    "Not financial advice.",
  ].join("\n");
}

function formatEarningLine(item) {
  return `- ${item.ticker}: ${item.earningsDate || "date n/a"} | ${item.price ? `${formatPrice(item.price)} (${formatPct(item.changePct)})` : "price n/a"}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
