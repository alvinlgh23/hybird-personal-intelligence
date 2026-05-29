import { gmailStatus } from "../services/gmail.js";
import { earningsProviderStatus } from "../services/earnings.js";
import { localAgentStatus, runLocalAgentTool } from "../services/localAgentClient.js";
import * as gemini from "../ai/providers/gemini.js";
import * as openai from "../ai/providers/openai.js";

export async function handleInfrastructureCommand(text, { env, context }) {
  if (text.startsWith("/status")) return status(env);

  if (text.startsWith("/find")) {
    const query = arg(text, "/find");
    if (!query) return "Usage: /find <query>";
    await context.loading("Searching local Mac...");
    const result = await safeLocalTool("find", { query }, { env });
    if (!result.ok) return result.message;
    return formatItems("Find Results", result.value.items);
  }

  if (text.startsWith("/sendfile")) {
    const query = arg(text, "/sendfile");
    if (!query) return "Usage: /sendfile <query>";
    await context.loading("Finding file on local Mac...");
    const result = await safeLocalTool("sendfile", { query }, { env });
    if (!result.ok) return result.message;
    const file = result.value;
    if (file.error) return file.error;
    return { type: "document", filename: file.filename, contentBase64: file.contentBase64, mimeType: file.mimeType, caption: `File from local Mac\n${file.path}` };
  }

  if (text.startsWith("/searchcode")) {
    const query = arg(text, "/searchcode");
    if (!query) return "Usage: /searchcode <query>";
    await context.loading("Searching code locally...");
    const result = await safeLocalTool("searchcode", { query }, { env });
    if (!result.ok) return result.message;
    return formatCode(result.value.items);
  }

  if (text.startsWith("/repo")) {
    await context.loading("Reading local repo status...");
    const result = await safeLocalTool("repo", { query: arg(text, "/repo") }, { env });
    if (!result.ok) return result.message;
    return formatRepo(result.value);
  }

  if (text.startsWith("/logs")) {
    await context.loading("Reading local logs...");
    const result = await safeLocalTool("logs", {}, { env });
    if (!result.ok) return result.message;
    return formatLogs(result.value.items);
  }

  if (text.startsWith("/railwaylogs")) {
    return railwayLogs(env);
  }

  if (text.startsWith("/recentfiles")) {
    await context.loading("Reading recent local files...");
    const result = await safeLocalTool("recentfiles", {}, { env });
    if (!result.ok) return result.message;
    return formatRecentFiles(result.value.items);
  }

  if (text.startsWith("/openproject")) {
    const query = arg(text, "/openproject");
    if (!query) return "Usage: /openproject <name>";
    await context.loading("Finding local projects...");
    const result = await safeLocalTool("openproject", { query }, { env });
    if (!result.ok) return result.message;
    return formatItems("Matching Projects", result.value.items);
  }

  return null;
}

async function safeLocalTool(tool, args, { env }) {
  try {
    return { ok: true, value: await runLocalAgentTool(tool, args, { env }) };
  } catch (error) {
    return { ok: false, message: localAgentErrorMessage(error) };
  }
}

function localAgentErrorMessage(error) {
  const message = String(error?.message || "Local Mac agent unavailable.").replace(/\s+/gu, " ").trim();
  if (/not configured/i.test(message)) return "Local Mac agent is not configured. Set LOCAL_AGENT_URL and LOCAL_AGENT_TOKEN.";
  if (/timed out/i.test(message)) return "Local Mac agent timed out. Check that your Mac agent is running and reachable.";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EPERM|network/i.test(message)) return "Local Mac agent is offline or unreachable.";
  if (/unauthorized/i.test(message)) return "Local Mac agent rejected authentication. Check LOCAL_AGENT_TOKEN.";
  return `Local Mac agent error: ${message.slice(0, 160)}`;
}

async function status(env) {
  const [gmail, local] = await Promise.all([gmailStatus({ env }).catch((error) => error.message), localAgentStatus({ env })]);
  const earnings = earningsProviderStatus(env);
  return [
    "Infrastructure Status",
    "",
    `Railway: ${env.AGENT_MODE === "cloud" ? "cloud mode" : "local mode"}`,
    `Telegram: ${env.TELEGRAM_MODE || "polling"}`,
    `Gmail: ${String(gmail).split("\n")[0]}`,
    `Gemini: ${gemini.isAvailable(env) ? "available" : "missing"}`,
    `OpenAI: ${openai.isAvailable(env) ? "available" : "missing"}`,
    `FMP configured: ${earnings.fmp ? "yes" : "no"}`,
    `Alpha Vantage configured: ${earnings.alpha ? "yes" : "no"}`,
    `Earnings provider active: ${earnings.active}`,
    `Local Mac agent: ${local.online ? "online" : `offline (${local.message})`}`,
    `Version: ${env.npm_package_version || "0.3.0"}`,
  ].join("\n");
}

function railwayLogs(env) {
  return [
    "Railway Logs",
    "",
    env.RAILWAY_LOGS_URL ? `Open Railway logs:\n${env.RAILWAY_LOGS_URL}` : "Railway logs are not configured. Add RAILWAY_LOGS_URL or use the Railway dashboard.",
  ].join("\n");
}

function formatItems(title, items = []) {
  if (!items.length) return `${title}\n\nNo matching items found.`;
  return [title, ...items.slice(0, 12).map((item, index) => `${index + 1}. ${item.name || item.path}\n${item.path || ""}`.trim())].join("\n\n");
}

function formatCode(items = []) {
  if (!items.length) return "Code Search\n\nNo matches found.";
  return ["Code Search", ...items.slice(0, 20).map((item, index) => `${index + 1}. ${item.path}:${item.line}\n${item.preview}`)].join("\n\n");
}

function formatRepo(repo) {
  return ["Repo", "", `Path: ${repo.repo || "n/a"}`, `Branch: ${repo.branch || "n/a"}`, "", "Status:", repo.status || "Clean or unavailable.", "", "Recent commits:", ...(repo.commits || []).slice(0, 5)].join("\n");
}

function formatLogs(items = []) {
  if (!items.length) return "Local Logs\n\nNo log files found in approved roots.";
  return ["Local Logs", "", ...items.slice(0, 3).map((item) => `${item.path}\n${item.lines || "(empty)"}`)].join("\n\n");
}

function formatRecentFiles(items = []) {
  if (!items.length) return "Recent Files\n\nNo recent files found.";
  return ["Recent Files", "", ...items.slice(0, 15).map((item, index) => `${index + 1}. ${item.path}`)].join("\n");
}

function arg(text, command) {
  return text.replace(new RegExp(`^${command}(@\\w+)?\\s*`, "u"), "").trim();
}
