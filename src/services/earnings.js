import { safeFetchJson } from "../utils/fetch.js";
import { formatPct, formatPrice } from "../utils/format.js";
import { DEFAULT_IMPORTANT_TICKERS, fetchYahooQuote } from "./marketData.js";
import { getCompanyHeadlines } from "./news.js";

const FMP_BASE = "https://financialmodelingprep.com/api/v3";
const ALPHA_BASE = "https://www.alphavantage.co/query";
const MS_PER_DAY = 86_400_000;

export function earningsProviderStatus(env = process.env) {
  const fmp = Boolean(env.FMP_API_KEY);
  const alpha = Boolean(env.ALPHA_VANTAGE_API_KEY);
  return {
    fmp,
    alpha,
    active: fmp ? "FMP" : alpha ? "Alpha Vantage" : "fallback",
    calendarActive: fmp ? "FMP" : "unavailable",
  };
}

export async function getEarningsOverview({ tickers = DEFAULT_IMPORTANT_TICKERS, env = process.env, mode = "tracked" } = {}) {
  if (mode === "today" || mode === "upcoming") return getEarningsCalendar({ env, mode });

  const items = await Promise.all(tickers.map((ticker) => getTickerEarnings(ticker, { env })));
  const today = todayKey();
  const reportingToday = items.filter((item) => item?.earningsDate?.startsWith(today));
  const upcoming = items
    .filter((item) => item?.earningsDate && !item.earningsDate.startsWith(today))
    .sort((a, b) => String(a.earningsDate).localeCompare(String(b.earningsDate)))
    .slice(0, 8);

  return {
    mode,
    reportingToday,
    upcoming,
    tracked: items.filter(Boolean),
    providerStatus: earningsProviderStatus(env),
  };
}

export async function getTickerEarnings(ticker, { env = process.env } = {}) {
  const symbol = normalizeTicker(ticker);
  const [structured, quote, headlines] = await Promise.all([
    getStructuredTickerEarnings(symbol, { env }),
    fetchYahooQuote(symbol, symbol),
    getCompanyHeadlines(symbol, { env, limit: 3 }).catch(() => []),
  ]);

  return {
    ticker: symbol,
    ...structured,
    price: quote?.price || null,
    changePct: quote?.changePct ?? null,
    priceSource: quote ? "Yahoo Finance" : "unavailable",
    headlines,
  };
}

export async function getEarningsCalendar({ env = process.env, mode = "upcoming" } = {}) {
  if (!env.FMP_API_KEY) {
    return {
      mode,
      items: [],
      earningsSource: "unavailable",
      message: "Earnings calendar provider not configured. Add FMP_API_KEY or ALPHA_VANTAGE_API_KEY.",
    };
  }

  const today = todayKey();
  const to = mode === "today" ? today : dateKey(Date.now() + 21 * MS_PER_DAY);
  const rows = await fetchFmpCalendar({ env, from: today, to });
  const items = rows
    .map((row) => ({
      ticker: String(row.symbol || "").toUpperCase(),
      earningsDate: row.date || null,
      epsEstimate: numericOrNull(row.epsEstimated),
      revenueEstimate: numericOrNull(row.revenueEstimated),
      time: row.time || "",
      earningsSource: "FMP",
      dataQuality: {
        earningsCalendar: row.date ? "OK" : "missing",
        estimates: row.epsEstimated || row.revenueEstimated ? "partial" : "missing",
      },
    }))
    .filter((item) => item.ticker && (mode === "upcoming" || item.earningsDate?.startsWith(today)))
    .slice(0, mode === "today" ? 20 : 30);

  return { mode, items, earningsSource: "FMP", providerStatus: earningsProviderStatus(env) };
}

async function getStructuredTickerEarnings(symbol, { env }) {
  if (env.FMP_API_KEY) {
    const fmp = await getFmpTickerEarnings(symbol, { env });
    if (fmp.available) return fmp;
  }

  if (env.ALPHA_VANTAGE_API_KEY) {
    const alpha = await getAlphaTickerEarnings(symbol, { env });
    if (alpha.available) return alpha;
  }

  const yahoo = await getYahooTickerEarnings(symbol);
  if (yahoo.available) return yahoo;

  return missingStructuredData("unavailable");
}

async function getFmpTickerEarnings(symbol, { env }) {
  const today = todayKey();
  const future = dateKey(Date.now() + 370 * MS_PER_DAY);
  const past = dateKey(Date.now() - 120 * MS_PER_DAY);
  const [calendar, historical] = await Promise.all([
    fetchFmpCalendar({ env, from: past, to: future }).catch(() => []),
    safeFetchJson(`${FMP_BASE}/historical/earning_calendar/${encodeURIComponent(symbol)}?apikey=${encodeURIComponent(env.FMP_API_KEY)}`).catch(() => null),
  ]);

  const rows = [...calendar, ...(Array.isArray(historical) ? historical : [])].filter((row) => String(row.symbol || "").toUpperCase() === symbol);
  const selected = chooseBestEarningsRow(rows);
  if (!selected) return missingStructuredData("FMP");

  const earningsDate = selected.date || null;
  return {
    available: true,
    earningsDate,
    epsEstimate: numericOrNull(selected.epsEstimated),
    epsActual: numericOrNull(selected.eps),
    revenueEstimate: numericOrNull(selected.revenueEstimated),
    revenueActual: numericOrNull(selected.revenue),
    earningsSource: "FMP",
    structuredMessage: "",
    dataQuality: quality({ earningsDate, epsEstimate: selected.epsEstimated, revenueEstimate: selected.revenueEstimated }),
  };
}

async function getAlphaTickerEarnings(symbol, { env }) {
  const data = await safeFetchJson(`${ALPHA_BASE}?function=EARNINGS&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(env.ALPHA_VANTAGE_API_KEY)}`);
  const rows = Array.isArray(data?.quarterlyEarnings) ? data.quarterlyEarnings : [];
  const latest = rows
    .map((row) => ({
      reportedDate: row.reportedDate || null,
      epsEstimate: numericOrNull(row.estimatedEPS),
      epsActual: numericOrNull(row.reportedEPS),
      surprisePct: numericOrNull(row.surprisePercentage),
    }))
    .filter((row) => row.reportedDate)
    .sort((a, b) => String(b.reportedDate).localeCompare(String(a.reportedDate)))[0];

  if (!latest) return missingStructuredData("Alpha Vantage");

  return {
    available: true,
    earningsDate: latest.reportedDate,
    epsEstimate: latest.epsEstimate,
    epsActual: latest.epsActual,
    revenueEstimate: null,
    revenueActual: null,
    surprisePct: latest.surprisePct,
    earningsSource: "Alpha Vantage",
    structuredMessage: "Alpha Vantage provides historical earnings results, not a reliable forward earnings calendar.",
    dataQuality: quality({ earningsDate: latest.reportedDate, epsEstimate: latest.epsEstimate, revenueEstimate: null }),
  };
}

async function getYahooTickerEarnings(symbol) {
  const summary = await safeFetchJson(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=calendarEvents,earnings`);
  const result = summary?.quoteSummary?.result?.[0];
  const row = result?.calendarEvents?.earnings || {};
  const rawDate = row.earningsDate?.[0]?.fmt || row.earningsDate?.[0]?.raw;
  const earningsDate = rawDate ? String(rawDate) : null;
  const epsEstimate = row.earningsAverage?.raw ?? row.earningsAverage?.fmt ?? null;
  const revenueEstimate = row.revenueAverage?.raw ?? row.revenueAverage?.fmt ?? null;
  if (!earningsDate && !epsEstimate && !revenueEstimate) return missingStructuredData("Yahoo Finance");

  return {
    available: true,
    earningsDate,
    epsEstimate: numericOrText(epsEstimate),
    epsActual: null,
    revenueEstimate: numericOrText(revenueEstimate),
    revenueActual: null,
    earningsSource: "Yahoo Finance fallback",
    structuredMessage: "",
    dataQuality: quality({ earningsDate, epsEstimate, revenueEstimate }),
  };
}

async function fetchFmpCalendar({ env, from, to }) {
  const data = await safeFetchJson(`${FMP_BASE}/earning_calendar?from=${from}&to=${to}&apikey=${encodeURIComponent(env.FMP_API_KEY)}`);
  return Array.isArray(data) ? data : [];
}

export function formatEarningsOverview(data) {
  if (data.mode === "today" || data.mode === "upcoming") return formatCalendar(data);
  if (data.message) return [data.message, "", "Data sources:", `- Earnings: ${data.earningsSource || "unavailable"}`].join("\n");

  const lines = ["Earnings Radar", "", "Reporting today:"];
  lines.push(...(data.reportingToday.length ? data.reportingToday.map(formatEarningLine) : ["- No tracked names found for today."]));
  lines.push("", "Upcoming / tracked:");
  lines.push(...(data.upcoming.length ? data.upcoming.map(formatEarningLine) : ["- Structured upcoming dates unavailable for tracked names."]));
  lines.push("", "Data sources:");
  lines.push(`- Earnings: ${data.providerStatus?.active || "fallback"}`);
  lines.push("- Price: Yahoo Finance");
  lines.push("", "Use /earnings today or /earnings upcoming for calendar mode. Not financial advice.");
  return lines.join("\n");
}

export function formatTickerEarnings(item) {
  if (!item) return "Earnings data unavailable.";
  const watch = tickerWatchlist(item.ticker);
  const lines = [
    `${item.ticker} Earnings Intelligence`,
    "",
    "Price:",
    item.price ? `${item.ticker}: ${formatPrice(item.price)} (${formatPct(item.changePct)})` : `${item.ticker}: unavailable`,
    "",
    "Structured data:",
    item.earningsDate ? `Earnings date: ${item.earningsDate}` : "Earnings date: unavailable from provider",
    item.epsEstimate !== null && item.epsEstimate !== undefined ? `EPS estimate: ${formatMaybeNumber(item.epsEstimate)}` : "EPS estimate: unavailable",
    item.revenueEstimate !== null && item.revenueEstimate !== undefined ? `Revenue estimate: ${formatMaybeRevenue(item.revenueEstimate)}` : "Revenue estimate: unavailable",
  ];

  if (item.epsActual !== null && item.epsActual !== undefined) lines.push(`Reported EPS: ${formatMaybeNumber(item.epsActual)}`);
  if (item.revenueActual !== null && item.revenueActual !== undefined) lines.push(`Reported revenue: ${formatMaybeRevenue(item.revenueActual)}`);
  if (item.structuredMessage) lines.push(`Note: ${item.structuredMessage}`);

  lines.push(
    "",
    "AI read:",
    earningsRead(item),
    "",
    "What to watch:",
    ...watch.map((line) => `- ${line}`),
    "",
    "Data quality:",
    `Price: ${item.price ? "OK" : "missing"}`,
    `Earnings calendar: ${item.dataQuality?.earningsCalendar || "missing"}`,
    `Estimates: ${item.dataQuality?.estimates || "missing"}`,
    "",
    "Data sources:",
    `- Price: ${item.priceSource || "unavailable"}`,
    `- Earnings: ${item.earningsSource || "unavailable"}`,
    "",
    "Not financial advice.",
  );

  return lines.join("\n");
}

export function summarizeEarningsOverview(data) {
  return formatEarningsOverview(data);
}

export function summarizeTickerEarnings(item) {
  return formatTickerEarnings(item);
}

function formatCalendar(data) {
  if (!data.items?.length) {
    return [
      data.mode === "today" ? "Earnings Today" : "Upcoming Earnings",
      "",
      data.earningsSource === "unavailable" ? data.message : "No earnings calendar items found from the current provider.",
      "",
      "Data sources:",
      `- Earnings: ${data.earningsSource || "unavailable"}`,
    ].join("\n");
  }

  return [
    data.mode === "today" ? "Earnings Today" : "Upcoming Earnings",
    "",
    ...data.items.slice(0, 15).map((item) => formatCalendarLine(item)),
    "",
    "Data sources:",
    `- Earnings: ${data.earningsSource}`,
    "",
    "Not financial advice.",
  ].join("\n");
}

function formatEarningLine(item) {
  const parts = [item.ticker];
  if (item.earningsDate) parts.push(item.earningsDate);
  if (item.price) parts.push(`${formatPrice(item.price)} (${formatPct(item.changePct)})`);
  parts.push(`source: ${item.earningsSource || "unavailable"}`);
  return `- ${parts.join(" | ")}`;
}

function formatCalendarLine(item) {
  const parts = [`${item.ticker}: ${item.earningsDate || "date unavailable"}`];
  if (item.time) parts.push(item.time);
  if (item.epsEstimate !== null && item.epsEstimate !== undefined) parts.push(`EPS est ${formatMaybeNumber(item.epsEstimate)}`);
  if (item.revenueEstimate !== null && item.revenueEstimate !== undefined) parts.push(`Revenue est ${formatMaybeRevenue(item.revenueEstimate)}`);
  return `- ${parts.join(" | ")}`;
}

function earningsRead(item) {
  const unavailable = item.dataQuality?.earningsCalendar === "missing" && item.dataQuality?.estimates === "missing";
  const base = unavailable
    ? "Structured estimate data is currently unavailable, so this should be treated as a price/news-based read only."
    : "Structured earnings data is available, but the market reaction will still depend on guidance, margins, and whether management confirms the current narrative.";
  return `${base} For ${item.ticker}, the market usually focuses on ${tickerWatchlist(item.ticker).slice(0, 5).join(", ")}.`;
}

function tickerWatchlist(ticker) {
  const map = {
    MU: ["HBM shipment/guidance", "DRAM/NAND pricing", "gross margin commentary", "data-center demand", "customer concentration", "inventory cycle"],
    PLTR: ["commercial revenue growth", "AIP adoption", "remaining performance obligations", "government contract timing", "operating margin", "valuation sensitivity"],
    NVDA: ["data-center revenue", "Blackwell/Hopper supply", "gross margin", "hyperscaler capex", "China restrictions", "networking attach rates"],
    AMD: ["MI300/AI accelerator traction", "server CPU share", "gross margin", "data-center guidance", "PC cycle", "competitive pricing"],
    TSM: ["AI/HPC demand", "advanced-node utilization", "capex guidance", "gross margin", "geopolitical risk", "customer concentration"],
    AVGO: ["AI networking/custom silicon", "VMware integration", "free cash flow", "gross margin", "enterprise demand", "debt paydown"],
    SNOW: ["product revenue growth", "remaining performance obligations", "AI product monetization", "consumption trends", "net retention", "margin discipline"],
    CRM: ["subscription growth", "AI monetization", "operating margin", "buybacks", "enterprise software demand", "guidance quality"],
    TSLA: ["deliveries", "auto gross margin", "pricing", "energy storage", "FSD/robotaxi commentary", "China demand"],
  };
  return map[ticker] || ["revenue growth", "EPS revisions", "gross margin", "forward guidance", "management commentary", "market reaction versus expectations"];
}

function missingStructuredData(source) {
  return {
    available: false,
    earningsDate: null,
    epsEstimate: null,
    epsActual: null,
    revenueEstimate: null,
    revenueActual: null,
    earningsSource: source,
    structuredMessage: "Structured earnings estimates unavailable from current provider.",
    dataQuality: { earningsCalendar: "missing", estimates: "missing" },
  };
}

function quality({ earningsDate, epsEstimate, revenueEstimate }) {
  return {
    earningsCalendar: earningsDate ? "OK" : "missing",
    estimates: epsEstimate !== null && epsEstimate !== undefined || revenueEstimate !== null && revenueEstimate !== undefined ? "partial/OK" : "missing",
  };
}

function chooseBestEarningsRow(rows) {
  const today = todayKey();
  const sorted = rows
    .filter((row) => row?.date)
    .sort((a, b) => {
      const af = String(a.date) >= today ? 0 : 1;
      const bf = String(b.date) >= today ? 0 : 1;
      if (af !== bf) return af - bf;
      return af === 0 ? String(a.date).localeCompare(String(b.date)) : String(b.date).localeCompare(String(a.date));
    });
  return sorted[0] || null;
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numericOrText(value) {
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  return value || null;
}

function formatMaybeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : String(value);
}

function formatMaybeRevenue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (Math.abs(number) >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(number) >= 1_000_000) return `$${(number / 1_000_000).toFixed(2)}M`;
  return `$${number.toLocaleString("en-US")}`;
}

function normalizeTicker(ticker) {
  return String(ticker || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/gu, "").slice(0, 10);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
