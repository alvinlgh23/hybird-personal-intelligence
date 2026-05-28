import { summarizeWithCodex } from "./summarizer.js";
import { inferMarketRegime } from "../services/marketData.js";

export async function summarizeMarketQuestion(question, context, { env }) {
  if ((env.AGENT_MODE || "local") !== "local") {
    return ruleBasedMarketAnswer(question, context);
  }

  return summarizeWithCodex(
    [
      "Answer the user's investment/news question using the supplied market, news, earnings, and watchlist context.",
      "Do not give personalized financial advice or buy/sell instructions.",
      "Use language like 'possible interpretation', 'the signal suggests', and 'not financial advice'.",
      "Keep it concise for Telegram.",
    ].join(" "),
    { question, context },
    { env, fallback: ruleBasedMarketAnswer(question, context) },
  );
}

export function ruleBasedMarketAnswer(question, context) {
  const regime = context.market ? inferMarketRegime(context.market) : null;
  const headlines = (context.headlines || []).slice(0, 3).map((item) => item.title).join("; ") || "no fresh headlines available";
  const risks = regime?.risks?.slice(0, 3).join("; ") || "watch liquidity, rates, and earnings revisions";

  return [
    "Market Read",
    "",
    `Question: ${question}`,
    `Signal: ${regime?.riskTone || "mixed"} with ${regime?.liquidity || "unclear liquidity"}.`,
    `Headlines: ${headlines}`,
    `Risks: ${risks}`,
    "",
    "Possible interpretation only. Not financial advice.",
  ].join("\n");
}

export async function summarizeValuationAnalysis(ticker, valuationOutput, marketData, news, earnings, macro, { env }) {
  const context = { ticker, valuationOutput, marketData, news, earnings, macro };
  if ((env.AGENT_MODE || "local") === "local") {
    return summarizeWithCodex(
      [
        "Create a concise investment-style analysis from valuation, price, news, earnings, and macro context.",
        "Use these exact sections: Executive summary, Valuation read, Momentum / chase-risk read, Macro context, Bull case, Bear case, Key catalysts, Key risks, What to watch next, Final interpretation.",
        "Do not give direct buy/sell instructions. Use probabilistic language: suggests, appears, watch, risk, possible interpretation.",
        "Write a detailed research-style Telegram report for slow reading. End with: Not financial advice.",
      ].join(" "),
      context,
      { env, fallback: ruleBasedValuationAnalysis(ticker, context) },
    );
  }
  return ruleBasedValuationAnalysis(ticker, context);
}

function ruleBasedValuationAnalysis(ticker, context) {
  const full = context.valuationOutput?.data?.data || context.valuationOutput?.data || context.valuationOutput;
  const value = full?.valuation || full?.data?.valuation || full?.raw_output || context.valuationOutput?.stdout || context.valuationOutput?.message;
  const chase = full?.chase || full?.data?.chase || full?.raw_output || context.valuationOutput?.stdout || context.valuationOutput?.message;
  const headline = context.news?.[0]?.title || "No major fresh headline found.";
  const price = context.marketData?.price ? `$${Number(context.marketData.price).toFixed(2)}` : "n/a";
  const regime = context.macro ? inferMarketRegime(context.macro) : null;
  const earningsDate = context.earnings?.earningsDate || "n/a";
  const warnings = context.valuationOutput?.data?.warnings?.length ? context.valuationOutput.data.warnings.join("; ") : "none flagged by adapter";

  return [
    `${ticker} Analysis`,
    "",
    "Executive summary",
    `The setup appears ${regime?.riskTone || "mixed"} from a macro lens, with latest price around ${price}. The valuation model output suggests the key debate is whether fundamentals justify current momentum and multiple risk.`,
    "",
    "Valuation read",
    compact(value),
    "",
    "Momentum / chase-risk read",
    compact(chase),
    "",
    "Macro context",
    `${regime?.riskTone || "mixed"} risk tone, ${regime?.liquidity || "unclear liquidity"}, crypto sentiment ${regime?.cryptoSentiment || "mixed"}.`,
    "",
    "Bull case",
    "Upside appears more credible if valuation support, earnings revisions, and headline momentum align while liquidity remains supportive.",
    "",
    "Bear case",
    "The risk is that valuation heat, weak guidance, crowded positioning, or tighter liquidity pressures the multiple before fundamentals catch up.",
    "",
    "Key catalysts",
    `Latest headline: ${headline}`,
    `Earnings event: ${earningsDate}`,
    "",
    "Key risks",
    `${regime?.risks?.join("; ") || "watch liquidity, rates, earnings revisions, and company-specific guidance"}. Adapter warnings: ${warnings}.`,
    "",
    "What to watch next",
    "Watch price reaction around earnings, revisions to revenue/EPS expectations, 200-day moving average distance, and whether news flow confirms or fades.",
    "",
    "Final interpretation",
    "Possible interpretation: the setup depends on whether valuation support and catalysts can overcome macro and chase-risk pressure. This is not a buy/sell instruction.",
    "",
    "Not financial advice.",
  ].join("\n");
}

function compact(value) {
  if (!value) return "n/a";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}
