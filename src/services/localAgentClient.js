export function localAgentConfigured(env = process.env) {
  return Boolean(env.LOCAL_AGENT_URL && env.LOCAL_AGENT_TOKEN);
}

export async function localAgentStatus({ env = process.env } = {}) {
  if (!localAgentConfigured(env)) return { online: false, message: "Local Mac agent not configured." };
  try {
    const data = await requestLocalAgent("/health", { env, method: "GET" });
    return { online: true, data };
  } catch (error) {
    return { online: false, message: shortError(error) };
  }
}

export async function runLocalAgentTool(tool, args = {}, { env = process.env } = {}) {
  if (!localAgentConfigured(env)) throw new Error("Local Mac agent not configured. Set LOCAL_AGENT_URL and LOCAL_AGENT_TOKEN.");
  const data = await requestLocalAgent("/tool", { env, method: "POST", body: { tool, args } });
  if (!data.ok) throw new Error(data.error || "Local agent tool failed.");
  return data.result;
}

async function requestLocalAgent(path, { env, method, body } = {}) {
  const url = `${String(env.LOCAL_AGENT_URL || "").replace(/\/$/u, "")}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.LOCAL_AGENT_TIMEOUT_MS || 12_000));
  try {
    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${env.LOCAL_AGENT_TOKEN}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Local agent HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function shortError(error) {
  const message = error?.name === "AbortError" ? "Local agent request timed out." : error?.message || "Local agent unavailable.";
  return String(message).replace(/\s+/gu, " ").slice(0, 180);
}
