import { commandOf } from "../utils/format.js";
import { handleEarningsCommand } from "./earnings.js";
import { handleGmailCommand } from "./gmail.js";
import { handleMarketCommand } from "./market.js";
import { handleNewsCommand } from "./news.js";
import { handleSystemCommand } from "./system.js";
import { handleValuationCommand } from "./valuation.js";
import { handleWatchlistCommand } from "./watchlist.js";

export function createCommandHandler({ env }) {
  return async function handleCommand(text, context) {
    const command = commandOf(text);
    if (!command) return "Send /help to see available commands.";

    for (const handler of [handleSystemCommand, handleGmailCommand, handleMarketCommand, handleNewsCommand, handleEarningsCommand, handleWatchlistCommand, handleValuationCommand]) {
      const response = await handler(text, { env, context });
      if (response) return response;
    }

    return "Unknown command. Try /help.";
  };
}
