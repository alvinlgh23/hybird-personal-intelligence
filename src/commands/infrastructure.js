import { gmailStatus } from "../services/gmail.js";
import { localAgentStatus, runLocalAgentTool } from "../services/localAgentClient.js";
import * as gemini from "../ai/providers/gemini.js";
import * as openai from "../ai/providers/openai.js";

export async function handleInfrastructureCommand(text, { env, context }) {
  if (text.startsWith("/status")) return status(env);

  if (text.startsWith("/find")) {
    const query = arg(text, "/find");
    if (!query) return "Usage: /find <query>";
    await context.loading("Searching local Mac...");
    return formatItems("Find Results", (await runLocalAgentTool("find", { query }, { env })).items);
  }

  if (text.startsWith("/sendfile")) {
    const query = arg(text, "/sendfile");
    if (!query) return "Usage: /sendfile <query>";
    await context.loading("Finding file on local Mac...");
    const file = await runLocalAgentTool("sendfile", { query }, { env });
    if (file.error) return file.error;
    return { type: "document", filename: file.filename, contentBase64: file.contentBase64, mimeType: file.mimeType, caption: `File from local Mac\n${file.path}` };
  }

  if (text.startsWith("/searchcode")) {
    const query = arg(text, "/searchcode");
    if (!query) return "Usage: /searchcode <query>";
    await context.loading("Searching code locally...");
    return formatCode((await runLocalAgentTool("searchcode", { query }, { env })).items);
  }

  if (text.startsWith("/repo")) {
    await context.loading("Reading local repo status...");
    return formatRepo(await runLocalAgentTool("repo", { query: arg(text, "/repo") }, { env }));
  }

  if (text.startsWith("/logs")) {
    await context.loading("Reading local logs...");
    return formatLogs((await runLocalAgentTool("logs", {}, { env })).items);
  }

  if (text.startsWith("/railwaylogs")) {
    return railwayLogs(env);
  }

  if (text.startsWith("/recentfiles")) {
    await context.loading("Reading recent local files...");
    return formatRecentFiles((await runLocalAgentTool("recentfiles", {}, { env })).items);
  }

  if (text.startsWith("/openproject")) {
    const query = arg(text, "/openproject");
    if (!query) return "Usage: /openproject <name>";
    await context.loading("Finding local projects...");
    return formatItems("Matching Projects", (await runLocalAgentTool("openproject", { query }, { env })).items);
  }

  return null;
}

async function status(env) {
  const [gmail, local] = await Promise.all([gmailStatus({ env }).catch((error) => error.message), localAgentStatus({ env })]);
  return [
    "Infrastructure Status",
    "",
    `Railway: ${env.AGENT_MODE === "cloud" ? "cloud mode" : "local mode"}`,
    `Telegram: ${env.TELEGRAM_MODE || "polling"}`,
    `Gmail: ${String(gmail).split("\n")[0]}`,
    `Gemini: ${gemini.isAvailable(env) ? "available" : "missing"}`,
    `OpenAI: ${openai.isAvailable(env) ? "available" : "missing"}`,
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
  return [title, "", ...items.slice(0, 12).map((item, index) => `${index + 1}. ${item.name || item.path}\n${item.path || ""}`.trim())].join("\n\n");
}

function formatCode(items = []) {
  if (!items.length) return "Code Search\n\nNo matches found.";
  return ["Code Search", "", ...items.slice(0, 20).map((item, index) => `${index + 1}. ${item.path}:${item.line}\n${item.preview}`)].join("\n\n");
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
