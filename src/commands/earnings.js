import { formatEarningsOverview, formatTickerEarnings, getEarningsOverview, getTickerEarnings } from "../services/earnings.js";

export async function handleEarningsCommand(text, { context }) {
  if (!text.startsWith("/earnings")) return null;
  const ticker = text.replace(/^\/earnings(@\w+)?\s*/u, "").trim();
  await context.loading("Checking earnings radar...");
  if (ticker) return formatTickerEarnings(await getTickerEarnings(ticker));
  return formatEarningsOverview(await getEarningsOverview());
}
