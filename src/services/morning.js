import { buildEmailDigest } from "./emailDigest.js";
import { getEarningsOverview, formatEarningsOverview } from "./earnings.js";
import { listUnreadEmails } from "./gmail.js";
import { getMarketSnapshot } from "./marketData.js";
import { buildBrief, buildMacroSummary } from "./marketIntel.js";
import { formatMarketMovingHeadlines, getMarketMovingHeadlines } from "./news.js";
import { buildWatchlistBrief } from "./watchlist.js";

export async function buildMorningDigest({ env }) {
  const [snapshot, headlines, emails, earnings, watchlist] = await Promise.all([
    getMarketSnapshot(),
    getMarketMovingHeadlines({ env, limit: 5 }),
    listUnreadEmails({ env, limit: 10 }).catch(() => []),
    getEarningsOverview().catch(() => ({ reportingToday: [], upcoming: [], tracked: [] })),
    buildWatchlistBrief(env).catch(() => "Watchlist\n\nUnavailable."),
  ]);

  const digest = emails.length ? await buildEmailDigest(emails, { env }) : "Daily Digest\n\nGmail unavailable or no unread messages.";

  return [
    "Personal Morning Brief",
    "",
    "1. What needs my attention",
    digest,
    "",
    "2. Market state",
    buildBrief(snapshot),
    "",
    "Macro",
    buildMacroSummary(snapshot),
    "",
    "3. Earnings / major company events",
    formatEarningsOverview(earnings),
    "",
    "4. Watchlist",
    watchlist,
    "",
    "5. Emails to ignore",
    "Promotions and low-signal newsletters are grouped as Noise in /digest.",
    "",
    "6. Action needed",
    "Review the Action Needed section above, then use /gmail for message details.",
    "",
    formatMarketMovingHeadlines(headlines),
  ].join("\n\n");
}
