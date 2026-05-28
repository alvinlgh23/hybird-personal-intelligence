import { runMarketInterpretation } from "./codex.js";
import { inferMarketRegime } from "./marketData.js";
import { formatPct, formatPrice, formatValue } from "../utils/format.js";

export function buildBrief(snapshot) {
  const regime = inferMarketRegime(snapshot);
  return [
    "Morning Market Brief",
    "",
    `BTC: ${formatAsset(snapshot.crypto.btc)}`,
    `ETH: ${formatAsset(snapshot.crypto.eth)}`,
    `S&P 500: ${formatQuote(snapshot.macro.sp500)}`,
    `Nasdaq: ${formatQuote(snapshot.macro.nasdaq)}`,
    `DXY: ${formatQuote(snapshot.macro.dxy)}`,
    `US10Y: ${formatYield(snapshot.macro.us10y)}`,
    "",
    `Risk tone: ${regime.riskTone}`,
    `Liquidity: ${regime.liquidity}`,
    `Crypto sentiment: ${regime.cryptoSentiment}`,
    `Macro sentiment: ${regime.macroSentiment}`,
  ].join("\n");
}

export function buildEthSnapshot(snapshot) {
  const eth = snapshot.crypto.eth;
  const btcDominance = snapshot.crypto.btcDominance;
  const change = eth?.changePct;
  const sentiment =
    !Number.isFinite(change) ? "mixed until fresh data improves" : change > 1.5 ? "constructive" : change < -1.5 ? "defensive" : "neutral";

  return [
    "ETH Snapshot",
    "",
    `ETH: ${formatAsset(eth)}`,
    `24h change: ${formatPct(change)}`,
    `BTC dominance: ${formatPct(btcDominance)}`,
    `Sentiment: ${sentiment}`,
  ].join("\n");
}

export function buildMacroSummary(snapshot) {
  const regime = inferMarketRegime(snapshot);
  return [
    "Macro Regime",
    "",
    `DXY: ${formatQuote(snapshot.macro.dxy)}`,
    `US10Y: ${formatYield(snapshot.macro.us10y)}`,
    `Nasdaq: ${formatQuote(snapshot.macro.nasdaq)}`,
    "",
    `Policy feel: ${regime.policy}`,
    `Risk appetite: ${regime.riskTone}`,
    `Read-through: ${regime.macroSentiment}`,
  ].join("\n");
}

export async function buildMarketSummary(snapshot, { env }) {
  const base = [
    "Market Intelligence",
    "",
    `BTC: ${formatAsset(snapshot.crypto.btc)}`,
    `ETH: ${formatAsset(snapshot.crypto.eth)}`,
    `S&P 500: ${formatQuote(snapshot.macro.sp500)}`,
    `Nasdaq: ${formatQuote(snapshot.macro.nasdaq)}`,
    `DXY: ${formatQuote(snapshot.macro.dxy)}`,
    `US10Y: ${formatYield(snapshot.macro.us10y)}`,
    "",
    `Risk tone: ${inferMarketRegime(snapshot).riskTone}`,
    `Liquidity: ${inferMarketRegime(snapshot).liquidity}`,
    `Crypto sentiment: ${inferMarketRegime(snapshot).cryptoSentiment}`,
    "",
    "3 key risks:",
    ...inferMarketRegime(snapshot).risks.map((risk) => `- ${risk}`),
  ].join("\n");

  try {
    const interpretation = await runMarketInterpretation(snapshot, { env });
    return `${base}\n\n${interpretation}`;
  } catch {
    const regime = inferMarketRegime(snapshot);
    return [
      base,
      "",
      `Momentum Regime: ${regime.riskTone}`,
      `Top Risks: dollar/yield pressure, equity breadth, crypto beta reversal`,
      `Interpretation: ${regime.macroSentiment}`,
    ].join("\n");
  }
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
