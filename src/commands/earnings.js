import { getEarningsOverview, getTickerEarnings, summarizeEarningsOverview, summarizeTickerEarnings } from "../services/earnings.js";

export async function handleEarningsCommand(text, { env, context }) {
  if (!text.startsWith("/earnings")) return null;
  const ticker = text.replace(/^\/earnings(@\w+)?\s*/u, "").trim();
  await context.loading("Checking earnings radar...");
  if (ticker) return summarizeTickerEarnings(await getTickerEarnings(ticker), { env });
  return summarizeEarningsOverview(await getEarningsOverview(), { env });
}
