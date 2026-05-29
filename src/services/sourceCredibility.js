const HIGH_CREDIBILITY = [
  ["reuters", "Reuters"],
  ["bloomberg", "Bloomberg"],
  ["ft.com", "Financial Times"],
  ["financial times", "Financial Times"],
  ["wsj", "WSJ"],
  ["wall street journal", "WSJ"],
  ["dj.com", "WSJ"],
  ["nikkei", "Nikkei"],
  ["apnews", "AP"],
  ["associated press", "AP"],
  ["channelnewsasia", "CNA"],
  ["bbc", "BBC"],
  ["japantimes", "Japan Times"],
];

const MEDIUM_CREDIBILITY = [
  ["coindesk", "CoinDesk"],
  ["theinformation", "The Information"],
  ["the information", "The Information"],
  ["techcrunch", "TechCrunch"],
];

export function sourceMeta(item = {}) {
  const raw = `${item.source || ""} ${item.link || ""}`.toLowerCase();
  const high = HIGH_CREDIBILITY.find(([needle]) => raw.includes(needle));
  if (high) return { name: high[1], category: "High credibility", weight: 0.75, tier: "high" };

  const medium = MEDIUM_CREDIBILITY.find(([needle]) => raw.includes(needle));
  if (medium) return { name: medium[1], category: "Medium credibility", weight: 0.25, tier: "medium" };

  const name = item.source || sourceFromLink(item.link) || "Unknown source";
  return { name, category: name === "Unknown source" ? "Low/unknown credibility" : "Standard source", weight: name === "Unknown source" ? -1 : 0, tier: "standard" };
}

export function credibilityAdjustedScore(baseScore, item = {}, confirmationCount = 1) {
  const meta = sourceMeta(item);
  const confirmationBoost = confirmationCount > 1 ? Math.min(1, (confirmationCount - 1) * 0.5) : 0;
  return Math.max(0, Math.min(10, Math.round(baseScore + meta.weight + confirmationBoost)));
}

export function convergenceNote(item = {}) {
  if (item.majorSourceCount >= 2) return "Multiple major sources are converging on this narrative.";
  if (item.confirmationCount >= 2) return "Cross-source confirmation is emerging.";
  return "";
}

export function addSourceConfidence(items) {
  const groups = groupSimilarStories(items);
  const counts = new Map();
  for (const group of groups) {
    const sources = new Set(group.map((item) => sourceMeta(item).name).filter(Boolean));
    const majorSources = [...sources].filter((source) => ["Reuters", "Bloomberg", "Financial Times", "WSJ", "Nikkei", "AP"].includes(source));
    for (const item of group) {
      counts.set(item, { confirmationCount: sources.size, majorSourceCount: majorSources.length });
    }
  }

  return items.map((item) => {
    const meta = sourceMeta(item);
    const count = counts.get(item) || { confirmationCount: 1, majorSourceCount: meta.tier === "high" ? 1 : 0 };
    return {
      ...item,
      source: meta.name,
      sourceCategory: meta.category,
      sourceTier: meta.tier,
      confirmationCount: count.confirmationCount,
      majorSourceCount: count.majorSourceCount,
      confidenceNote: convergenceNote(count),
    };
  });
}

function groupSimilarStories(items) {
  const groups = [];
  for (const item of items) {
    const tokens = storyTokens(item.title || "");
    const existing = groups.find((group) => jaccard(tokens, storyTokens(group[0].title || "")) >= 0.38);
    if (existing) existing.push(item);
    else groups.push([item]);
  }
  return groups;
}

function storyTokens(title) {
  const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "are", "was", "will", "amid", "over", "after", "before", "says", "said", "into"]);
  return new Set(
    String(title)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/u)
      .filter((token) => token.length > 2 && !stop.has(token)),
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

function sourceFromLink(link) {
  try {
    return new URL(link).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}
