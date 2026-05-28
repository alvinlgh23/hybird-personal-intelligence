import { buildMorningDigest } from "../services/morning.js";
import { getMarketSnapshot } from "../services/marketData.js";
import { buildMarketSummary } from "../services/marketIntel.js";
import { currentTimeInZone } from "../utils/time.js";

export function startDailyDigestScheduler({ env, sendToAllowedUsers, log = console }) {
  const dailyEnabled = env.DAILY_DIGEST_ENABLED === "true";
  const marketEnabled = env.DAILY_MARKET_DIGEST_ENABLED === "true";
  if (!dailyEnabled && !marketEnabled) return null;

  const dailyTime = env.DAILY_DIGEST_TIME || "08:00";
  const marketTime = env.MARKET_DIGEST_TIME || "08:30";
  const timeZone = env.TIMEZONE || "America/New_York";
  const allowedIds = (env.TELEGRAM_ALLOWED_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!allowedIds.length) {
    log.warn("Daily digest scheduler disabled: Telegram allowlist is empty.");
    return null;
  }

  const interval = setInterval(async () => {
    const current = currentTimeInZone(timeZone);
    if (dailyEnabled && current === dailyTime) {
      try {
        await sendToAllowedUsers(await buildMorningDigest({ env }));
      } catch (error) {
        log.error("Daily digest failed:", error.message);
      }
    }
    if (marketEnabled && current === marketTime) {
      try {
        await sendToAllowedUsers(await buildMarketSummary(await getMarketSnapshot(), { env }));
      } catch (error) {
        log.error("Market digest failed:", error.message);
      }
    }
  }, 60_000);

  log.log(`Scheduler enabled. Daily=${dailyEnabled ? dailyTime : "off"}, Market=${marketEnabled ? marketTime : "off"}, TZ=${timeZone}.`);
  return interval;
}
