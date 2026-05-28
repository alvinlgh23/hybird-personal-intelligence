import * as gemini from "./providers/gemini.js";
import * as openai from "./providers/openai.js";

const DEFAULT_FALLBACK = "AI summary unavailable. Showing rule-based fallback instead.";

export function generateSummary(prompt, options = {}) {
  return route(prompt, { ...options, providers: ["gemini", "openai"] });
}

export function generateMarketAnalysis(prompt, options = {}) {
  return route(prompt, { ...options, providers: ["gemini", "openai"], maxOutputTokens: options.maxOutputTokens || 2200 });
}

export function generateValuationAnalysis(prompt, options = {}) {
  return route(prompt, { ...options, providers: ["openai", "gemini"], maxOutputTokens: options.maxOutputTokens || 2600 });
}

export function generateDigest(prompt, options = {}) {
  return route(prompt, { ...options, providers: ["gemini", "openai"], maxOutputTokens: options.maxOutputTokens || 2200 });
}

async function route(prompt, options) {
  const env = options.env || process.env;
  const errors = [];

  for (const name of options.providers) {
    const provider = providerFor(name);
    if (!provider?.isAvailable(env)) continue;

    try {
      return await provider.generateText(prompt, { ...options, env });
    } catch (error) {
      errors.push(`${name}: ${shortError(error)}`);
      logProviderError(name, error);
    }
  }

  if (errors.length) console.error(`AI providers failed: ${errors.join(" | ")}`);
  return options.fallback || DEFAULT_FALLBACK;
}

function providerFor(name) {
  if (name === "gemini") return gemini;
  if (name === "openai") return openai;
  return null;
}

function logProviderError(provider, error) {
  console.error(`AI provider ${provider} failed: ${shortError(error)}`);
}

function shortError(error) {
  const message = error?.name === "AbortError" ? "request timed out" : error?.message || "request failed";
  const clean = String(message).replace(/\s+/gu, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 180)}...` : clean;
}
