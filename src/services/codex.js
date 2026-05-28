import { runCodex, summarizeWithCodex } from "../ai/summarizer.js";

export function runAgentPlan(task, { env }) {
  return summarizeWithCodex(
    "Return a concise action plan only for the user's task.",
    { task },
    { env, fallback: "Unable to generate an action plan right now." },
  );
}

export function runMarketInterpretation(snapshot, { env }) {
  if ((env.AGENT_MODE || "local") !== "local") {
    return Promise.resolve("Momentum Regime: see rule-based market read\nTop Risks: dollar/yield pressure, earnings revisions, crypto beta reversal\nInterpretation: possible interpretation only. Not financial advice.");
  }
  return summarizeWithCodex(
    "You are a concise market intelligence analyst. Return exactly these sections: Momentum Regime, Top Risks, Interpretation. Keep the total under 120 words and avoid investment advice.",
    snapshot,
    { env, fallback: "Momentum Regime: mixed\nTop Risks: data unavailable\nInterpretation: wait for fresher confirmation." },
  );
}

export { runCodex, summarizeWithCodex };
