import { getEarningsOverview, getTickerEarnings, summarizeEarningsOverview, summarizeTickerEarnings } from "../services/earnings.js";

export async function handleEarningsCommand(text, { env, context }) {
  if (!text.startsWith("/earnings")) return null;
  const arg = text.replace(/^\/earnings(@\w+)?\s*/u, "").trim();
  await context.loading("Checking earnings radar...");
  if (/^today$/iu.test(arg)) return summarizeEarningsOverview(await getEarningsOverview({ env, mode: "today" }), { env });
  if (/^upcoming$/iu.test(arg)) return summarizeEarningsOverview(await getEarningsOverview({ env, mode: "upcoming" }), { env });
  if (arg) return summarizeTickerEarnings(await getTickerEarnings(arg, { env }), { env });
  return summarizeEarningsOverview(await getEarningsOverview({ env }), { env });
}
