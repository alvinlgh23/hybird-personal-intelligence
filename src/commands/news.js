import { getMarketMovingHeadlines, summarizeMarketMovingHeadlines } from "../services/news.js";

export async function handleNewsCommand(text, { env, context }) {
  if (!text.startsWith("/news")) return null;
  await context.loading("Reading market-moving headlines...");
  return summarizeMarketMovingHeadlines(await getMarketMovingHeadlines({ env, limit: 8 }), { env });
}
