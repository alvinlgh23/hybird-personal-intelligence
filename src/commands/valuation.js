import { analyzeTicker, formatChaseResult, formatValuationResult, normalizeTickerInput, runValuation } from "../services/valuation.js";

export async function handleValuationCommand(text, { env, context }) {
  if (text.startsWith("/value")) {
    const ticker = tickerArg(text, "/value");
    if (!ticker) return "Usage: /value <ticker>";
    await context.loading(`Running valuation model for ${ticker}...`);
    return formatValuationResult(await runValuation(ticker, { env, mode: "value" }));
  }

  if (text.startsWith("/chase")) {
    const ticker = tickerArg(text, "/chase");
    if (!ticker) return "Usage: /chase <ticker>";
    await context.loading(`Checking chase risk for ${ticker}...`);
    return formatChaseResult(await runValuation(ticker, { env, mode: "chase" }));
  }

  if (text.startsWith("/analyze")) {
    const ticker = tickerArg(text, "/analyze");
    if (!ticker) return "Usage: /analyze <ticker>";
    await context.loading(`Analyzing ${ticker}...`);
    return analyzeTicker(ticker, { env });
  }

  return null;
}

function tickerArg(text, command) {
  const value = text.replace(new RegExp(`^${command}(@\\w+)?\\s*`, "u"), "").trim();
  return value ? normalizeTickerInput(value) : "";
}
