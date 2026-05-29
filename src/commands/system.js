import { runAgentPlan } from "../services/codex.js";
import { runLocalChromeCheck, runLocalCodex } from "../services/localBridge.js";

export function helpText(env) {
  const mode = `${env.AGENT_MODE || "local"}/${env.TELEGRAM_MODE || "polling"}`;
  return [
    `Hybrid Intelligence OS (${mode})`,
    "",
    "Personal:",
    "/gmail - high-signal inbox intelligence",
    "/gmail all - raw unread inbox dump",
    "/gmail_raw - raw unread Gmail list",
    "/gmail_status - Gmail connection status",
    "/gmail_reconnect - reconnect Gmail OAuth",
    "/gmail_auth - get Gmail OAuth link",
    "/gmail_code <code> - finish Gmail OAuth",
    "/gmail_export_token - export token JSON for Railway",
    "/digest - AI Gmail digest",
    "/morning - fast morning dashboard",
    "/deepbrief - institutional deep research note",
    "",
    "Regional intelligence:",
    "/jp - Japan top 3 signals (/jp synth, /jp 1, /jp deep)",
    "/kr - Korea top 3 signals (/kr synth, /kr 1, /kr deep)",
    "/sg - Singapore top 3 signals (/sg synth, /sg 1, /sg deep)",
    "/eu - Europe top 3 signals (/eu synth, /eu 1, /eu deep)",
    "/us - United States top 3 signals (/us synth, /us 1, /us deep)",
    "/cn - China top 3 signals (/cn synth, /cn 1, /cn deep)",
    "/asean - ASEAN top 3 signals (/asean synth, /asean 1, /asean deep)",
    "",
    "Markets:",
    "/brief - short market brief",
    "/market - full market read",
    "/macro - macro regime",
    "/eth - ETH snapshot",
    "/news - market-moving signals (/news deep for research note)",
    "/earnings [ticker] - earnings radar",
    "/watchlist [add/remove/brief] - manage watchlist",
    "/ask_market <question> - market Q&A",
    "/value <ticker> - run valuation model",
    "/chase <ticker> - chase-risk / overheat check",
    "/analyze <ticker> - price, news, earnings, macro, valuation",
    "",
    "System:",
    "/status - Railway, Telegram, Gmail, AI, local agent, version",
    "/health - runtime health",
    "/find <query> - search local Mac approved roots",
    "/sendfile <query> - send matching local file",
    "/searchcode <query> - search local code",
    "/repo [name] - local git status",
    "/logs - recent local logs",
    "/railwaylogs - Railway log link/status",
    "/recentfiles - recently modified local files",
    "/openproject <name> - find local projects",
    "/chrome - local-only Chrome diagnostics",
    "/agent <task> - local-only action plan",
    "/ask_codex <prompt> - local-only Codex bridge",
    "/whoami - show Telegram user ID",
  ].join("\n");
}

export async function handleSystemCommand(text, { env, context }) {
  if (text === "/start" || text === "/help") return helpText(env);
  if (text.startsWith("/health")) return health(env);

  if (text.startsWith("/chrome")) {
    await context.loading("Checking Chrome and Codex extension setup...");
    return runLocalChromeCheck({ env });
  }

  if (text.startsWith("/agent")) {
    const task = text.replace(/^\/agent(@\w+)?\s*/u, "").trim();
    if (!task) return "Usage: /agent <task>";
    if ((env.AGENT_MODE || "local") !== "local") return "This command is local-only. Run your Mac local agent.";
    await context.loading("Asking Codex for a concise action plan...");
    return runAgentPlan(task, { env });
  }

  if (text.startsWith("/ask_codex")) {
    const prompt = text.replace(/^\/ask_codex(@\w+)?\s*/u, "").trim();
    if (!prompt) return "Usage: /ask_codex <prompt>";
    if ((env.AGENT_MODE || "local") !== "local") return "This command is local-only. Run your Mac local agent.";
    if (env.ENABLE_CODEX_EXEC !== "true") return "Codex execution is disabled. Set ENABLE_CODEX_EXEC=true in .env when you are ready.";
    await context.loading("Running Codex. This can take a minute...");
    return runLocalCodex(prompt, { env });
  }

  return null;
}

function health(env) {
  return [
    "Health: ok",
    `Agent mode: ${env.AGENT_MODE || "local"}`,
    `Telegram mode: ${env.TELEGRAM_MODE || "polling"}`,
    `Daily digest: ${env.DAILY_DIGEST_ENABLED === "true" ? "enabled" : "disabled"}`,
    `Market digest: ${env.DAILY_MARKET_DIGEST_ENABLED === "true" ? "enabled" : "disabled"}`,
  ].join("\n");
}
