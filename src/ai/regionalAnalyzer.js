import { generateSummary } from "./router.js";

export async function analyzeRegionalNews(region, items, { env, deep = false }) {
  if (!items.length) return `No major high-signal regional developments found.`;

  const prompt = [
    `Write a ${deep ? "deep institutional" : "very concise mobile-first"} regional intelligence synthesis for ${region.name}.`,
    "Base the analysis only on the selected news items. Do not invent facts. If confidence is low, say so.",
    deep
      ? "Explain second-order effects for markets, policy, technology, supply chains, geopolitics, AI race, and capital flows where supported by the selected items."
      : "Return one concise paragraph. Explain the dominant theme, strategic interpretation, and why it matters to capital, policy, companies, or geopolitics.",
    "Use source credibility, cross-source convergence, and any narrative divergence only when supported by the selected items.",
    "If multiple major sources converge, explicitly mention: Multiple major sources are converging on this narrative.",
    "Avoid vague phrases like 'may affect markets'. Use concrete transmission channels.",
    "Keep Telegram mobile readability.",
    "",
    "Selected news:",
    JSON.stringify(
      items.map((item) => ({
        title: item.title,
        source: item.source,
        sourceCategory: item.sourceCategory,
        confirmationCount: item.confirmationCount,
        majorSourceCount: item.majorSourceCount,
        confidenceNote: item.confidenceNote,
        published: item.published,
        category: item.category,
        score: item.signalScore,
        aiInsight: item.aiInsight,
      })),
      null,
      2,
    ),
  ].join("\n");

  return generateSummary(prompt, { env, fallback: fallbackSynthesis(items, deep), maxOutputTokens: deep ? 2200 : 650 });
}

export async function analyzeRegionalItem(region, item, { env, index = 1 }) {
  const fallback = [
    `${region.name} Detail: #${index}`,
    "",
    item.title,
    `Source: ${item.source || "RSS"}${item.sourceCategory ? ` (${item.sourceCategory})` : ""}`,
    "",
    "Analysis:",
    `${item.aiInsight || "No additional insight available."} ${item.confidenceNote || ""}`.trim(),
    "",
    "Strategic read:",
    item.category === "Macro / central bank"
      ? "Smart money will watch currency, rates, bank equities, exporters, and whether policy expectations reprice."
      : "Smart money will watch confirmation from official response, market reaction, affected companies, and whether follow-up reporting broadens the narrative.",
    "",
    `Signal: ${item.signalScore}/10`,
  ].join("\n");

  const prompt = [
    `Write a detailed but Telegram-readable intelligence note for ${region.name} item #${index}.`,
    "Use only the supplied item. Do not invent facts.",
    "Explain: what happened, why it matters, second-order strategic implications, who benefits/loses, market/policy/geopolitical read-through, and what smart money watches next.",
    "Keep it concise. No direct buy/sell advice.",
    "",
    "Item:",
    JSON.stringify(
      {
        title: item.title,
        source: item.source,
        sourceCategory: item.sourceCategory,
        confidenceNote: item.confidenceNote,
        published: item.published,
        category: item.category,
        score: item.signalScore,
        aiInsight: item.aiInsight,
      },
      null,
      2,
    ),
  ].join("\n");

  return generateSummary(prompt, { env, fallback, maxOutputTokens: 1300 });
}

function fallbackSynthesis(items, deep = false) {
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].slice(0, 4).join(", ") || "mixed";
  const convergence = items.some((item) => item.majorSourceCount >= 2) ? " Multiple major sources are converging on this narrative." : "";
  if (!deep) {
    return `The dominant theme is ${categories.toLowerCase()}, led by the highest-signal selected headlines.${convergence} The practical read-through is policy direction, capital allocation, listed champions, and cross-border strategic positioning.`;
  }
  return [
    "Regional intelligence:",
    `Dominant theme: selected high-signal items cluster around ${categories}.`,
    convergence.trim(),
    "Interpretation: the selected items point to policy, capital-flow, company, or strategic positioning shifts rather than routine news flow.",
    "Confidence: limited to fetched headline and snippet context.",
  ].join("\n");
}
