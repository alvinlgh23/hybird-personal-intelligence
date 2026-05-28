import { summarizeMarketQuestion } from "../ai/marketSummarizer.js";
import { getEarningsOverview } from "../services/earnings.js";
import { getMarketSnapshot } from "../services/marketData.js";
import { buildBrief, buildEthSnapshot, buildMacroSummary, buildMarketSummary } from "../services/marketIntel.js";
import { getMarketMovingHeadlines } from "../services/news.js";
import { getWatchlist } from "../services/watchlist.js";

export async function handleMarketCommand(text, { env, context }) {
  if (text.startsWith("/brief")) {
    await context.loading("Building market briefing...");
    return buildBrief(await getMarketSnapshot());
  }

  if (text.startsWith("/eth")) {
    await context.loading("Checking ETH market state...");
    return buildEthSnapshot(await getMarketSnapshot());
  }

  if (text.startsWith("/macro")) {
    await context.loading("Reading macro regime...");
    return buildMacroSummary(await getMarketSnapshot());
  }

  if (text.startsWith("/market")) {
    await context.loading("Generating market intelligence summary...");
    return buildMarketSummary(await getMarketSnapshot(), { env });
  }

  if (text.startsWith("/ask_market")) {
    const question = text.replace(/^\/ask_market(@\w+)?\s*/u, "").trim();
    if (!question) return "Usage: /ask_market <question>";
    await context.loading("Gathering market context...");
    const [market, headlines, earnings] = await Promise.all([
      getMarketSnapshot(),
      getMarketMovingHeadlines({ env, limit: 6 }),
      getEarningsOverview(),
    ]);
    return summarizeMarketQuestion(question, { market, headlines, earnings, watchlist: getWatchlist(env) }, { env });
  }

  return null;
}
