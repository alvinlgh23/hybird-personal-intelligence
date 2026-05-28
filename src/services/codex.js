import { runCodex, summarizeWithCodex } from "../ai/summarizer.js";
import { generateMarketAnalysis } from "../ai/router.js";

export function runAgentPlan(task, { env }) {
  return summarizeWithCodex(
    "Return a concise action plan only for the user's task.",
    { task },
    { env, fallback: "Unable to generate an action plan right now." },
  );
}

export function runMarketInterpretation(snapshot, { env }) {
  const prompt = [
    "You are a professional market intelligence analyst.",
    "Create a concise research-note style market read using exactly these sections:",
    "Executive summary, Macro regime, Liquidity conditions, Valuation read, Momentum / chase-risk read, Bull case, Bear case, Key catalysts, Key risks, What to watch next, Final interpretation.",
    "Avoid generic risk-on/risk-off-only summaries. Do not give investment advice. End with: Not financial advice.",
    "",
    "Input:",
    JSON.stringify(snapshot, null, 2),
  ].join("\n");

  return generateMarketAnalysis(
    prompt,
    { env, fallback: "Executive summary: mixed market backdrop.\nMacro regime: data unavailable.\nLiquidity conditions: unclear.\nValuation read: unavailable.\nMomentum / chase-risk read: watch crowded positioning.\nBull case: easing liquidity supports risk assets.\nBear case: dollar/yield reversal pressures multiples.\nKey catalysts: rates, earnings, AI leadership, crypto flows.\nKey risks: liquidity reversal, earnings revisions, crypto beta fragility.\nWhat to watch next: DXY, US10Y, breadth, BTC/ETH follow-through.\nFinal interpretation: wait for fresher confirmation.\n\nNot financial advice." },
  );
}

export { runCodex, summarizeWithCodex };
