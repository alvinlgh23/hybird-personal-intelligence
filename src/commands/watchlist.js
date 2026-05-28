import { addTicker, buildWatchlistBrief, getWatchlist, removeTicker } from "../services/watchlist.js";

export async function handleWatchlistCommand(text, { env, context }) {
  if (!text.startsWith("/watchlist")) return null;
  const args = text.replace(/^\/watchlist(@\w+)?\s*/u, "").trim().split(/\s+/u).filter(Boolean);
  const action = args[0];
  const ticker = args[1];

  if (action === "add") {
    if (!ticker) return "Usage: /watchlist add <ticker>";
    return `Watchlist: ${addTicker(ticker, env).join(", ")}`;
  }

  if (action === "remove") {
    if (!ticker) return "Usage: /watchlist remove <ticker>";
    return `Watchlist: ${removeTicker(ticker, env).join(", ") || "empty"}`;
  }

  if (action === "brief") {
    await context.loading("Building watchlist brief...");
    return buildWatchlistBrief(env);
  }

  return ["Watchlist", "", getWatchlist(env).join(", ") || "empty", "", "Use /watchlist add <ticker>, /watchlist remove <ticker>, or /watchlist brief."].join("\n");
}
