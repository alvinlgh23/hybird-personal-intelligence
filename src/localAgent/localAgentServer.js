import { createServer } from "node:http";
import { createSafeCommandRegistry } from "./safeCommandRegistry.js";
import { createRateLimiter } from "../security/rateLimiter.js";
import { logAction } from "../security/actionLogger.js";

const env = process.env;
const token = env.LOCAL_AGENT_TOKEN;
const host = env.LOCAL_AGENT_HOST || "127.0.0.1";
const port = Number(env.LOCAL_AGENT_PORT || 8787);

if (!token || token.length < 24) {
  console.error("Missing LOCAL_AGENT_TOKEN. Use a long random token before starting the local agent.");
  process.exit(1);
}

const registry = createSafeCommandRegistry({ env, log: console });
const rateLimit = createRateLimiter({ windowMs: 60_000, max: Number(env.LOCAL_AGENT_RATE_LIMIT || 40) });

const server = createServer(async (req, res) => {
  const actor = req.socket.remoteAddress || "unknown";
  try {
    const limited = rateLimit(actor);
    if (!limited.ok) return json(res, 429, { ok: false, error: "Rate limit exceeded." });

    if (req.method === "GET" && req.url === "/health") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized." });
      return json(res, 200, { ok: true, service: "local-mac-agent", time: new Date().toISOString(), status: await registry.status({}) });
    }

    if (req.method === "POST" && req.url === "/tool") {
      if (!authorized(req)) return json(res, 401, { ok: false, error: "Unauthorized." });
      const body = await readJson(req);
      const tool = String(body.tool || "");
      const args = body.args || {};
      const handler = registry[tool];
      if (!handler || tool.startsWith("_")) return json(res, 400, { ok: false, error: "Tool is not allowed." });

      logAction({ actor, action: tool, detail: JSON.stringify(redactArgs(args)), log: console });
      const result = await withTimeout(handler(args), Number(env.LOCAL_AGENT_TOOL_TIMEOUT_MS || 12_000));
      return json(res, 200, { ok: true, tool, result });
    }

    return json(res, 404, { ok: false, error: "Not found." });
  } catch (error) {
    logAction({ actor, action: "request", detail: error.message, ok: false, log: console });
    return json(res, 500, { ok: false, error: safeError(error) });
  }
});

server.on("error", (error) => {
  console.error(`Local Mac agent failed to listen on ${host}:${port}: ${safeError(error)}`);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Local Mac agent listening on http://${host}:${port}`);
});

function authorized(req) {
  const header = req.headers.authorization || "";
  return header === `Bearer ${token}`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Tool timed out.")), ms)),
  ]);
}

function redactArgs(args) {
  return Object.fromEntries(Object.entries(args || {}).map(([key, value]) => [key, key.toLowerCase().includes("token") ? "[redacted]" : String(value).slice(0, 180)]));
}

function safeError(error) {
  const message = String(error?.message || "Local agent error.").replace(/\s+/gu, " ").trim();
  return message.length > 160 ? `${message.slice(0, 160)}...` : message;
}
