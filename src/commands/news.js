import { formatShortMarketMovingHeadlines, getMarketMovingHeadlines, summarizeMarketMovingHeadlines } from "../services/news.js";

export async function handleNewsCommand(text, { env, context }) {
  if (!text.startsWith("/news")) return null;
  await context.loading("Reading market-moving headlines...");
  const deep = /\sdeep\b/iu.test(text);
  const items = await getMarketMovingHeadlines({ env, limit: deep ? 8 : 5 });
  return deep ? summarizeMarketMovingHeadlines(items, { env }) : formatShortMarketMovingHeadlines(items);
}
