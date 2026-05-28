const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_TIMEOUT_MS = 60000;

export function isAvailable(env = process.env) {
  return Boolean(env.OPENAI_API_KEY);
}

export async function generateText(prompt, options = {}) {
  const env = options.env || process.env;
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI provider unavailable");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || env.AI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model || env.OPENAI_MODEL || DEFAULT_MODEL,
        input: prompt,
        temperature: options.temperature ?? 0.25,
        max_output_tokens: options.maxOutputTokens || 2200,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(shortProviderError(payload?.error?.message || `OpenAI HTTP ${response.status}`));
    }

    const text = extractResponseText(payload);
    if (!text) throw new Error("OpenAI returned empty response");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function extractResponseText(payload) {
  if (payload?.output_text) return payload.output_text.trim();

  return (payload?.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}

function shortProviderError(message) {
  const clean = String(message || "OpenAI request failed").replace(/\s+/gu, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 180)}...` : clean;
}
