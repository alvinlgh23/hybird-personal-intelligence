const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 45000;

export function isAvailable(env = process.env) {
  return Boolean(env.GEMINI_API_KEY);
}

export async function generateText(prompt, options = {}) {
  const env = options.env || process.env;
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini provider unavailable");

  const model = options.model || env.GEMINI_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || env.AI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.35,
          maxOutputTokens: options.maxOutputTokens || 1800,
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(shortProviderError(payload?.error?.message || `Gemini HTTP ${response.status}`));
    }

    const text = (payload?.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    if (!text) throw new Error("Gemini returned empty response");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function shortProviderError(message) {
  const clean = String(message || "Gemini request failed").replace(/\s+/gu, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 180)}...` : clean;
}
