import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatPct, formatValue } from "../utils/format.js";

const DEFAULT_SNAPSHOT_PATH = "../investment-portfolio-tracker/data/cfo_snapshot.json";

export async function generateMorningCfoBrief({ env } = {}) {
  const { snapshot, source } = await loadCfoSnapshot(env);
  return formatMorningCfoBrief(snapshot, { source });
}

async function loadCfoSnapshot(env = {}) {
  const path = resolve(env.CFO_SNAPSHOT_PATH || DEFAULT_SNAPSHOT_PATH);
  try {
    const snapshot = JSON.parse(await readFile(path, "utf8"));
    return { snapshot, source: path };
  } catch (error) {
    return { snapshot: mockSnapshot(), source: "mock fallback" };
  }
}

function formatMorningCfoBrief(snapshot, { source }) {
  const currency = snapshot.currency || "USD";
  const netWorth = snapshot.net_worth || {};
  const allocation = snapshot.allocation || {};
  const cashFlow = snapshot.cash_flow || {};
  const recommendations = Array.isArray(snapshot.recommendations) ? snapshot.recommendations : [];
  const executiveRead = buildExecutiveRead(snapshot, recommendations);
  const cfoRead = buildCfoRead(snapshot, recommendations);
  const watchlist = buildWatchlist(snapshot, recommendations);
  const nextMove = buildNextMove(snapshot, recommendations);
  const closingLine = buildClosingLine(snapshot, recommendations);

  return [
    "🌅 Morning CFO Brief",
    source === "mock fallback" ? "Mock data fallback. Run the Personal CFO dashboard to export a real snapshot." : null,
    "",
    executiveRead,
    "",
    "💰 Position",
    `Net Worth: ${money(netWorth.total, currency)}`,
    `Cash: ${pct(allocation.cash_percent)}`,
    `Investments: ${pct(investmentPercent(allocation))}`,
    `Crypto: ${pct(allocation.crypto_percent)}`,
    Number(netWorth.liabilities || 0) > 0 ? `Liabilities: ${money(netWorth.liabilities, currency)}` : null,
    "",
    "🧠 CFO Read",
    cfoRead,
    "",
    "⚠️ Watchlist",
    ...watchlist,
    "",
    "🎯 Next Move",
    nextMove,
    "",
    "🧾 Closing Line",
    closingLine,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function buildExecutiveRead(snapshot, recommendations) {
  const allocation = snapshot.allocation || {};
  const cashFlow = snapshot.cash_flow || {};
  const primary = recommendations.find((item) => item?.message)?.message;
  if (isHigh(allocation.crypto_percent, 20)) return "Your position is stable, but risk exposure needs discipline because crypto is above the preferred band.";
  if (isHigh(allocation.single_asset_concentration_percent, 35)) return "Your position is stable, but concentration risk is the main thing to manage today.";
  if (isLow(cashFlow.emergency_fund_months, 3)) return "Your first priority is liquidity; the portfolio can wait until the cash buffer is safer.";
  if (isHigh(allocation.cash_percent, 40)) return "Your position is defensive, not broken, but it is still too cash-heavy for long-term growth.";
  if (isLow(cashFlow.investment_rate, 40)) return "Your finances are moving, but investment pace is below your long-term framework.";
  if (primary && /healthy|structurally healthy|balanced/iu.test(primary)) return "Your financial structure looks healthy; today is about consistency, not action.";
  return primary || "Your financial position looks broadly stable; the job today is to protect liquidity and stay consistent.";
}

function buildCfoRead(snapshot, recommendations) {
  const allocation = snapshot.allocation || {};
  const cashFlow = snapshot.cash_flow || {};
  const macro = snapshot.macro_profile?.profile;
  const contextNote = recommendations.find((item) => /cash|goal|income|wat|korea|context/iu.test(`${item.status} ${item.message}`))?.message;
  const riskNote = recommendations.find((item) => /crypto|concentrat|single|risk|speculative/iu.test(`${item.status} ${item.message}`))?.message;
  const investmentRate = Number(cashFlow.investment_rate);

  if (contextNote) {
    return `${contextNote} Read that as a temporary defensive posture, not a permanent allocation target. Keep the reserve intentional, then direct surplus toward durable investments.`;
  }
  if (riskNote) {
    return `${riskNote} That does not require a dramatic move, but it does mean new money should avoid adding to the same risk until the allocation cools down.`;
  }
  if (isLow(cashFlow.emergency_fund_months, 3)) {
    return `Your emergency fund covers ${months(cashFlow.emergency_fund_months)}, which is below the safety floor. Treat cash-building as the operating priority before adding more portfolio risk.`;
  }
  if (Number.isFinite(investmentRate) && investmentRate < 40) {
    return `Your investment rate is ${pct(investmentRate)}, below the 40% framework. Spending is not the problem by itself; the gap is that not enough cash flow is becoming long-term ownership.`;
  }
  if (macro && !/neutral/iu.test(macro)) {
    return `The structure is broadly fine, but the current ${macro} macro profile argues for patience with high-risk assets. Keep the portfolio boring where it should be boring.`;
  }
  return "The structure is broadly healthy. Cash flow is controlled, risk is not demanding an immediate correction, and the best move is to stay consistent rather than search for activity.";
}

function buildWatchlist(snapshot, recommendations) {
  const allocation = snapshot.allocation || {};
  const cashFlow = snapshot.cash_flow || {};
  const items = [];

  if (isHigh(allocation.cash_percent, 40)) items.push("Cash is above the long-term target; keep it justified by real near-term needs.");
  if (isHigh(allocation.crypto_percent, 15)) items.push("Crypto is near the upper risk band; do not let it become the portfolio driver.");
  if (isHigh(allocation.single_asset_concentration_percent, 35)) items.push("Single-asset exposure is concentrated; avoid adding to that position first.");
  if (isLow(cashFlow.emergency_fund_months, 3)) items.push("Emergency fund is below the safety floor.");
  if (isLow(cashFlow.investment_rate, 40)) items.push("Investment rate is below the 40% framework.");

  for (const item of recommendations) {
    const message = normalizeSentence(item?.message);
    if (!message || /healthy|structurally healthy|balanced/iu.test(`${item.status} ${message}`)) continue;
    if (/cash/iu.test(message) && items.some((existing) => /cash/iu.test(existing))) continue;
    if (/crypto/iu.test(message) && items.some((existing) => /crypto/iu.test(existing))) continue;
    if (/concentrat|single.?asset/iu.test(message) && items.some((existing) => /concentrat|single.?asset/iu.test(existing))) continue;
    if (!items.some((existing) => similar(existing, message))) items.push(message);
  }

  if (!items.length) items.push("No urgent risk flag today; watch consistency more than headlines.");
  return items.slice(0, 4).map((item) => `- ${item}`);
}

function buildNextMove(snapshot, recommendations) {
  const allocation = snapshot.allocation || {};
  const cashFlow = snapshot.cash_flow || {};
  const hasCashContext = recommendations.some((item) => /cash|goal|income|wat|korea|context/iu.test(`${item.status} ${item.message}`));

  if (isLow(cashFlow.emergency_fund_months, 3)) {
    return "For the next paycheck, build cash first. Do not increase high-risk assets until the emergency fund is above the safety floor.";
  }
  if (isHigh(allocation.crypto_percent, 20)) {
    return "Do not add aggressively to crypto right now. Route new money toward core ETF exposure or cash until crypto falls back inside the preferred band.";
  }
  if (isHigh(allocation.single_asset_concentration_percent, 35)) {
    return "Avoid adding to the concentrated position first. New money should go toward broader ETF exposure or cash so the portfolio becomes less dependent on one asset.";
  }
  if (hasCashContext || isHigh(allocation.cash_percent, 40)) {
    return "For the next paycheck, keep the cash reserve intact, prioritize steady ETF accumulation, and avoid increasing speculative assets unless cash remains clearly above target.";
  }
  if (isLow(cashFlow.investment_rate, 40)) {
    return "Tighten the next cash-flow decision: move the first surplus into investments before discretionary spending expands.";
  }
  return "Stay on the current plan: keep ETF accumulation steady, preserve enough cash for flexibility, and do not manufacture a portfolio move just to feel active.";
}

function buildClosingLine(snapshot, recommendations) {
  const allocation = snapshot.allocation || {};
  const cashFlow = snapshot.cash_flow || {};
  if (isLow(cashFlow.emergency_fund_months, 3)) return "No hero moves today. Build the floor first.";
  if (isHigh(allocation.crypto_percent, 20) || isHigh(allocation.single_asset_concentration_percent, 35)) return "No urgent action, but new risk can wait.";
  if (isHigh(allocation.cash_percent, 40)) return "Stay liquid, but do not let caution become inertia.";
  if (recommendations.some((item) => /healthy|balanced|structurally healthy/iu.test(`${item.status} ${item.message}`))) return "No urgent action today. Stay boring, stay consistent.";
  return "No urgent action today. Keep the system steady.";
}

function money(value, currency) {
  if (!Number.isFinite(Number(value))) return "n/a";
  const prefix = currency === "USD" ? "$" : "";
  const suffix = currency === "USD" ? "" : ` ${currency}`;
  return `${prefix}${formatValue(Number(value))}${suffix}`;
}

function pct(value) {
  if (!Number.isFinite(Number(value))) return "n/a";
  return `${Number(value).toFixed(Math.abs(Number(value)) >= 10 ? 0 : 1)}%`;
}

function months(value) {
  if (!Number.isFinite(Number(value))) return "n/a";
  return `${Number(value).toFixed(1)} months`;
}

function investmentPercent(allocation) {
  const etf = Number(allocation.etf_percent);
  const stocks = Number(allocation.individual_stocks_percent);
  return (Number.isFinite(etf) ? etf : 0) + (Number.isFinite(stocks) ? stocks : 0);
}

function isHigh(value, threshold) {
  return Number.isFinite(Number(value)) && Number(value) > threshold;
}

function isLow(value, threshold) {
  return Number.isFinite(Number(value)) && Number(value) < threshold;
}

function normalizeSentence(value) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  if (!text) return "";
  return /[.!?]$/u.test(text) ? text : `${text}.`;
}

function similar(left, right) {
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
  const a = normalize(left);
  const b = normalize(right);
  return a.includes(b.slice(0, 40)) || b.includes(a.slice(0, 40));
}

function mockSnapshot() {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    currency: "USD",
    net_worth: {
      total: 12480,
      cash: 4900,
      investments: 6200,
      crypto: 1380,
      liabilities: 0,
    },
    allocation: {
      cash_percent: 39,
      etf_percent: 42,
      individual_stocks_percent: 8,
      crypto_percent: 11,
      single_asset_concentration_percent: 32,
    },
    cash_flow: {
      monthly_income: 2400,
      monthly_spending: 1120,
      investment_rate: 39,
      savings_rate: 21,
      emergency_fund_months: 4.4,
    },
    recommendations: [
      { status: "Structurally Healthy", message: "Core ETF allocation is healthy." },
      { status: "Watch", message: "Crypto is within range but near the upper band." },
      { status: "Context", message: "Cash is above normal target, but may be justified by upcoming goals and income uncertainty." },
    ],
    macro_profile: { profile: "neutral" },
  };
}
