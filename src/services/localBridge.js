import { checkChrome } from "./chrome.js";
import { runCodex } from "./codex.js";

export function isLocalMode(env) {
  return (env.AGENT_MODE || "local") === "local";
}

export function localOnly(env) {
  return isLocalMode(env) ? null : "This command is local-only. Run your Mac local agent.";
}

export async function runLocalChromeCheck({ env }) {
  const blocked = localOnly(env);
  return blocked || checkChrome({ env });
}

export async function runLocalCodex(prompt, { env }) {
  const blocked = localOnly(env);
  return blocked || runCodex(prompt, { env });
}
