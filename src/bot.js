import { createCommandHandler } from "./commands/index.js";
import { startDailyDigestScheduler } from "./schedulers/dailyDigest.js";
import { createTelegramService, startWebhookServer } from "./services/telegram.js";
import { commandOf } from "./utils/format.js";
import { loadEnv } from "./utils/env.js";
import { sleep } from "./utils/time.js";

const env = loadEnv();
const token = env.TELEGRAM_BOT_TOKEN;
if (!token || token.includes("replace-me")) {
  fatal("Missing TELEGRAM_BOT_TOKEN. Copy .env.example to .env and add your Telegram bot token.");
}

const allowedUserIds = new Set(
  (env.TELEGRAM_ALLOWED_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

const agentMode = env.AGENT_MODE || "local";
const telegramMode = env.TELEGRAM_MODE || "polling";
const telegram = createTelegramService({ token, log: console });
const handleCommand = createCommandHandler({ env });

console.log(`Hybrid Intelligence OS starting in ${agentMode}/${telegramMode} mode.`);
console.log(allowedUserIds.size ? "Telegram allowlist enabled." : "Telegram allowlist empty. Only /whoami is allowed.");

startDailyDigestScheduler({
  env,
  sendToAllowedUsers: async (message) => {
    for (const userId of allowedUserIds) await telegram.send(userId, message);
  },
});

if (telegramMode === "webhook") {
  startWebhookServer({
    port: Number(env.PORT || 3000),
    telegram,
    publicUrl: env.PUBLIC_URL,
    handleUpdate,
  });
} else {
  await startPolling();
}

async function startPolling() {
  let offset = 0;
  while (true) {
    try {
      const updates = await telegram.getUpdates(offset);
      for (const update of updates.result || []) {
        offset = update.update_id + 1;
        handleUpdate(update).catch((error) => console.error("Failed to handle update:", error.message));
      }
    } catch (error) {
      console.error("Polling failed:", error.message);
      await sleep(3000);
    }
  }
}

async function handleUpdate(update) {
  const message = update.message;
  if (!message?.chat?.id || !message.from?.id) return;

  const chatId = message.chat.id;
  const userId = String(message.from.id);
  const text = (message.text || "").trim();

  if (commandOf(text) === "/whoami") {
    await telegram.send(chatId, `Your Telegram user ID is ${userId}.`);
    return;
  }

  if (!allowedUserIds.has(userId)) {
    await telegram.send(chatId, "This bot is locked. Send /whoami, then add your user ID to TELEGRAM_ALLOWED_USER_IDS in .env.");
    return;
  }

  try {
    const response = await handleCommand(text, {
      userId,
      loading: (messageText) => telegram.send(chatId, messageText),
    });
    await sendCommandResponse(chatId, response);
  } catch (error) {
    console.error("Command failed:", error.message);
    await telegram.send(chatId, safeUserError(error));
  }
}

async function sendCommandResponse(chatId, response) {
  if (response?.type === "document") {
    await telegram.sendDocument(chatId, response);
    return;
  }
  await telegram.send(chatId, response);
}

function safeUserError(error) {
  const message = error?.message || "";
  const safePrefixes = ["Missing Gmail config", "Gmail is not connected", "Gmail not connected in cloud", "Missing dependency", "Invalid ticker", "Local Mac agent"];
  if (safePrefixes.some((prefix) => message.startsWith(prefix))) return message;
  return "Something went wrong while handling that request. Try again in a moment.";
}

function fatal(message) {
  console.error(message);
  process.exit(1);
}
