import { createServer } from "node:http";
import { truncate } from "../utils/format.js";

export function createTelegramService({ token }) {
  async function call(method, payload = {}) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
    return data;
  }

  async function send(chatId, text) {
    return call("sendMessage", {
      chat_id: chatId,
      text: truncate(text),
      disable_web_page_preview: true,
    });
  }

  async function setWebhook(url) {
    return call("setWebhook", { url, allowed_updates: ["message"] });
  }

  async function getUpdates(offset) {
    return call("getUpdates", {
      timeout: 30,
      offset,
      allowed_updates: ["message"],
    });
  }

  return { call, send, setWebhook, getUpdates };
}

export function startWebhookServer({ port, telegram, publicUrl, handleUpdate, log = console }) {
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/telegram/webhook") {
      const body = await readBody(req);
      try {
        await handleUpdate(JSON.parse(body || "{}"));
        res.writeHead(200);
        res.end("ok");
      } catch (error) {
        log.error("Webhook update failed:", error.message);
        res.writeHead(200);
        res.end("ignored");
      }
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  server.listen(port, () => log.log(`Webhook server listening on port ${port}.`));

  if (publicUrl) {
    telegram
      .setWebhook(`${publicUrl.replace(/\/$/u, "")}/telegram/webhook`)
      .then(() => log.log("Telegram webhook configured."))
      .catch((error) => log.error("Telegram webhook setup failed:", error.message));
  }

  return server;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
