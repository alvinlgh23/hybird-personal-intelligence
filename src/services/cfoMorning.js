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
  const note = buildCfoNote(snapshot, recommendations);

  return [
    "🌅 Morning CFO Brief",
    source === "mock fallback" ? "Mock data fallback. Run the Personal CFO dashboard to export a real snapshot." : null,
    "",
    "💰 Net Worth",
    `Total: ${money(netWorth.total, currency)}`,
    `Cash: ${money(netWorth.cash, currency)} (${pct(allocation.cash_percent)})`,
    `Investments: ${money(netWorth.investments, currency)}`,
    `Crypto: ${money(netWorth.crypto, currency)} (${pct(allocation.crypto_percent)})`,
    Number(netWorth.liabilities || 0) > 0 ? `Liabilities: ${money(netWorth.liabilities, currency)}` : null,
    "",
    "📊 Allocation",
    `Cash: ${pct(allocation.cash_percent)}`,
    `ETF: ${pct(allocation.etf_percent)}`,
    `Individual stocks: ${pct(allocation.individual_stocks_percent)}`,
    `Crypto: ${pct(allocation.crypto_percent)}`,
    `Single asset concentration: ${pct(allocation.single_asset_concentration_percent)}`,
    "",
    "💸 This Month",
    `Income: ${money(cashFlow.monthly_income, currency)}`,
    `Spending: ${money(cashFlow.monthly_spending, currency)}`,
    `Investment Rate: ${pct(cashFlow.investment_rate)}`,
    `Savings Rate: ${pct(cashFlow.savings_rate)}`,
    `Emergency Fund: ${months(cashFlow.emergency_fund_months)}`,
    "",
    "🚨 Risk Alerts",
    ...formatRecommendations(recommendations),
    "",
    "🧠 CFO Note",
    note,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function formatRecommendations(recommendations) {
  if (!recommendations.length) return ["✅ No major allocation warnings triggered."];
  return recommendations.slice(0, 5).map((item) => `${iconForStatus(item.status)} ${item.message || item.status}`);
}

function buildCfoNote(snapshot, recommendations) {
  const macro = snapshot.macro_profile?.profile;
  const highRisk = recommendations.find((item) => /high risk|macro risk|concentrated/iu.test(`${item.status} ${item.message}`));
  const priority = recommendations.find((item) => /priority|below target|cash/iu.test(`${item.status} ${item.message}`));
  if (highRisk && priority) return `${highRisk.message} Next priority: ${priority.message}`;
  if (highRisk) return `${highRisk.message} Watch risk exposure before adding more speculative assets.`;
  if (priority) return `${priority.message} Keep the next move aligned with cash needs and steady ETF accumulation.`;
  if (macro) return `Allocation looks broadly stable. Keep watching concentration, cash needs, and how the ${macro} macro profile affects high-risk assets.`;
  return "Allocation looks broadly stable. Keep watching concentration, cash needs, and investment consistency.";
}

function iconForStatus(status = "") {
  if (/healthy|balanced/iu.test(status)) return "✅";
  if (/high risk|concentrated|priority|below target|macro risk|watch|context/iu.test(status)) return "⚠️";
  return "•";
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
