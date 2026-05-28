import { generateSummary } from "./router.js";

export async function analyzeRegionalNews(region, items, { env }) {
  if (!items.length) return `Regional synthesis:\nNo major high-signal regional developments found.`;

  const prompt = [
    `Write a concise regional intelligence synthesis for ${region.name}.`,
    "Base the analysis only on the selected news items. Do not invent facts. If confidence is low, say so.",
    "Explain: dominant regional narrative, what changed recently, economic implication, market/company implication, policy/geopolitical implication, and what to monitor next.",
    "Avoid generic filler. Keep it mobile-readable.",
    "",
    "Selected news:",
    JSON.stringify(
      items.map((item) => ({
        title: item.title,
        source: item.source,
        published: item.published,
        category: item.category,
        score: item.signalScore,
        summary: item.summary,
        whyItMatters: item.whyItMatters,
        potentialImpact: item.potentialImpact,
        whatToWatchNext: item.whatToWatchNext,
      })),
      null,
      2,
    ),
  ].join("\n");

  return generateSummary(prompt, { env, fallback: fallbackSynthesis(items), maxOutputTokens: 1200 });
}

function fallbackSynthesis(items) {
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].slice(0, 4).join(", ") || "mixed";
  return [
    "Regional synthesis:",
    `Dominant regional narrative: selected high-signal items cluster around ${categories}.`,
    "What changed recently: see the selected headlines above; confidence is limited without full article text.",
    "Economic implication: monitor whether these developments affect growth, inflation, trade, investment, or household/business confidence.",
    "Market/company implication: watch affected national champions, exporters, banks, technology supply chains, and capital-market proxies.",
    "Policy/geopolitical implication: watch government response, regulatory shifts, central-bank sensitivity, and cross-border spillovers.",
    "What to monitor next: follow-up official statements, market reaction, earnings/guidance updates, and whether additional outlets confirm the story.",
  ].join("\n");
}
