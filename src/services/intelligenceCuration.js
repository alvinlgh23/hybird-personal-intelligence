export const MAX_SAME_THEME = 1;

const THEME_RULES = [
  ["AI / semis", /(nvidia|nvda|semiconductor|chip|chips|gpu|hbm|tsmc|micron|amd|broadcom|\bai\b|artificial intelligence|data center|datacenter|compute)/iu],
  ["Geopolitics", /(china|taiwan|russia|ukraine|war|sanction|tariff|export control|south china sea|geopolitic)/iu],
  ["Defense", /(defense|military|missile|security summit|shangri-la|deterrence|navy|army|air force|pentagon|nato)/iu],
  ["Liquidity / rates", /(fed|fomc|powell|treasury|yield|yields|rate decision|\brates?\b|inflation|cpi|pce|ppi|dxy|dollar)/iu],
  ["Energy", /(oil|crude|opec|gas|lng|energy|nuclear|power grid|electricity)/iu],
  ["Crypto", /(bitcoin|btc|ethereum|eth|crypto|stablecoin|etf flows|digital assets)/iu],
  ["Earnings", /(earnings|guidance|revenue|margin|profit|sales|capex|quarter|results)/iu],
  ["Policy / politics", /(election|vote|government|minister|parliament|congress|policy|regulation|regulatory|antitrust|fine|fines)/iu],
  ["Capital flows", /(investment|capital|fund flows|ipo|acquisition|merger|sovereign wealth|temasek|gic)/iu],
];

export function inferNarrativeTheme(item = {}) {
  const text = `${item.theme || ""} ${item.category || ""} ${item.title || ""} ${item.summary || ""} ${item.aiInsight || ""}`;
  return THEME_RULES.find(([, re]) => re.test(text))?.[0] || "Strategic development";
}

export function curateDiverseItems(items = [], { limit = 4, maxSameTheme = MAX_SAME_THEME } = {}) {
  const sorted = items
    .filter(Boolean)
    .map((item) => ({ ...item, theme: item.theme || inferNarrativeTheme(item), priority: Number(item.priority ?? item.signalScore ?? item.relevanceScore ?? 0) }))
    .sort((a, b) => b.priority - a.priority || sourceRank(b) - sourceRank(a) || freshnessRank(b) - freshnessRank(a));

  const themeCounts = new Map();
  const selected = [];
  for (const item of sorted) {
    const count = themeCounts.get(item.theme) || 0;
    if (count >= maxSameTheme) continue;
    selected.push(item);
    themeCounts.set(item.theme, count + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function sourceRank(item) {
  if (item.sourceTier === "high") return 3;
  if (item.sourceTier === "medium") return 2;
  if (item.source && item.source !== "System") return 1;
  return 0;
}

function freshnessRank(item) {
  const time = new Date(item.published || 0).getTime();
  return Number.isFinite(time) ? time / 1_000_000_000_000 : 0;
}
