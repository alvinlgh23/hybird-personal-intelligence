import { createServer } from "node:http";
import { renderTelegramPlainFallback, renderTelegramSafeText } from "../renderers/telegramSafeRenderer.js";
const TELEGRAM_LIMIT = 2400;
const FALLBACK_LIMIT = 1800;

export function createTelegramService({ token, log = console } = {}) {
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
    const rendered = renderTelegramText(text);
    const chunks = splitTelegramMessage(rendered);
    log.log(`Telegram send length=${rendered.length} chunks=${chunks.length}.`);

    let last = null;
    for (const [index, chunk] of chunks.entries()) {
      try {
        last = await sendPlainTextChunk(chatId, chunk);
      } catch (error) {
        log.error(`Telegram sendMessage failed for chunk ${index + 1}/${chunks.length}: ${shortError(error)}. Retrying plain fallback.`);
        const fallbackChunks = splitTelegramMessage(renderPlainFallback(chunk), FALLBACK_LIMIT);
        for (const fallbackChunk of fallbackChunks) {
          last = await sendPlainTextChunk(chatId, fallbackChunk);
        }
      }
    }
    return last;
  }

  function sendPlainTextChunk(chatId, text) {
    return call("sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
  }

  async function sendDocument(chatId, { filename, contentBase64, mimeType = "application/octet-stream", caption = "" }) {
    const renderedCaption = renderTelegramText(caption).slice(0, 900);
    log.log(`Telegram sendDocument filename=${filename || "file"} captionLength=${renderedCaption.length}.`);
    const bytes = Uint8Array.from(Buffer.from(contentBase64 || "", "base64"));
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("disable_content_type_detection", "false");
    if (renderedCaption) form.append("caption", renderedCaption);
    form.append("document", new Blob([bytes], { type: mimeType }), filename || "file");

    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.description || "Telegram sendDocument failed");
    return data;
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

  return { call, send, sendDocument, setWebhook, getUpdates };
}

export function splitTelegramMessage(text, limit = TELEGRAM_LIMIT) {
  const safeText = renderTelegramText(text);
  if (safeText.length <= limit) return [safeText];

  const chunks = [];
  for (const section of safeText.split(/\n{2,}/u)) {
    const block = section.trim();
    if (!block) continue;

    if (!chunks.length) {
      chunks.push("");
    }

    const candidate = chunks[chunks.length - 1] ? `${chunks[chunks.length - 1]}\n\n${block}` : block;
    if (candidate.length <= limit) {
      chunks[chunks.length - 1] = candidate;
      continue;
    }

    if (chunks[chunks.length - 1]) chunks.push("");
    for (const piece of splitOversizedBlock(block, limit)) {
      if (!chunks[chunks.length - 1]) {
        chunks[chunks.length - 1] = piece;
      } else if (`${chunks[chunks.length - 1]}\n${piece}`.length <= limit) {
        chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n${piece}`;
      } else {
        chunks.push(piece);
      }
    }
  }

  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

export function renderTelegramText(value) {
  return renderTelegramSafeText(value);
}

function renderPlainFallback(value) {
  return renderTelegramPlainFallback(value);
}

function splitOversizedBlock(block, limit) {
  const pieces = [];
  for (const line of block.split("\n")) {
    if (line.length <= limit) {
      pieces.push(line);
      continue;
    }
    pieces.push(...splitLongLine(line, limit));
  }
  return pieces;
}

function splitLongLine(line, limit) {
  const pieces = [];
  let remaining = line.trim();
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const splitAt = Math.max(window.lastIndexOf(". "), window.lastIndexOf("; "), window.lastIndexOf(", "), window.lastIndexOf(" "));
    const size = splitAt > limit * 0.45 ? splitAt + 1 : limit;
    pieces.push(remaining.slice(0, size).trim());
    remaining = remaining.slice(size).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

function shortError(error) {
  const message = String(error?.message || "send failed").replace(/\s+/gu, " ").trim();
  return message.length > 160 ? `${message.slice(0, 160)}...` : message;
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
