export const MAX_SAME_THEME = 1;

const HARD_SKIP_RE =
  /\b(badminton|soccer|football|baseball|tennis|golf|nba|nfl|olympic|celebrity|actor|singer|influencer|viral|meme|gossip|wedding|divorce|restaurant|lottery|traffic accident|school drama|human interest)\b/iu;

const THEME_RULES = [
  ["AI", /(\bai\b|artificial intelligence|openai|anthropic|deepseek|llm|machine learning|data center|datacenter|compute)/iu],
  ["Semiconductors", /(nvidia|nvda|semiconductor|chip|chips|gpu|hbm|tsmc|micron|amd|broadcom|asml|foundry)/iu],
  ["Geopolitics", /(china|taiwan|russia|ukraine|war|sanction|tariff|export control|south china sea|geopolitic)/iu],
  ["Defense", /(defense|military|missile|security summit|shangri-la|deterrence|navy|army|air force|pentagon|nato)/iu],
  ["Macro", /(cpi|pce|ppi|payroll|jobs report|gdp|pmi|inflation|recession|consumer confidence|ism)/iu],
  ["Liquidity", /(fed|fomc|powell|treasury|yield|yields|rate decision|\brates?\b|dxy|dollar|liquidity|bond auction)/iu],
  ["Regulation", /(regulation|regulatory|antitrust|fine|fines|enforcement|sec|ftc|eu fines|digital markets)/iu],
  ["Energy", /(oil|crude|opec|gas|lng|energy|nuclear|power grid|electricity)/iu],
  ["Crypto", /(bitcoin|btc|ethereum|eth|crypto|stablecoin|etf flows|digital assets)/iu],
  ["Sovereign policy", /(election|vote|government|minister|parliament|congress|policy|sovereign|industrial policy|boj|ecb|mas|pboc)/iu],
  ["Markets", /(earnings|guidance|revenue|margin|profit|sales|capex|quarter|results|stocks|nasdaq|s&p|bond|currency|investment|capital|fund flows|ipo|acquisition|merger|sovereign wealth|temasek|gic)/iu],
];

export function classifyIntelligenceTopic(item = {}) {
  const text = itemText(item);
  if (HARD_SKIP_RE.test(text)) return "Skip";
  return THEME_RULES.find(([, re]) => re.test(text))?.[0] || "Skip";
}

export function inferNarrativeTheme(item = {}) {
  return item.topic || classifyIntelligenceTopic(item);
}

export function passesInstitutionalFilter(item = {}) {
  if (item.source === "System") return true;
  if (classifyIntelligenceTopic(item) === "Skip") return false;
  const text = itemText(item);
  if (/^(opinion|commentary|column|editorial|op-ed|view|perspective)\b/iu.test(text) && Number(item.relevanceScore ?? item.signalScore ?? 0) < 8) return false;
  return true;
}

export function buildTopicInsight(item = {}) {
  const topic = item.topic || classifyIntelligenceTopic(item);
  const title = String(item.title || "");
  if (topic === "AI") return aiInsight(title);
  if (topic === "Semiconductors") return "Read-through is chip supply, export controls, AI capex durability, and which suppliers retain pricing power.";
  if (topic === "Macro") return "The macro read is whether growth or inflation data changes the path for rates and earnings expectations.";
  if (topic === "Liquidity") return "The rates/liquidity channel is the market transmission point; watch yields, dollar, and duration-sensitive leadership.";
  if (topic === "Geopolitics") return "Raises read-through for sanctions, supply chains, commodity risk, and regional risk premia.";
  if (topic === "Defense") return "Reinforces pressure for allied defense coordination, procurement, and regional deterrence spending.";
  if (topic === "Regulation") return "Raises compliance and margin risk; watch whether enforcement spreads to peers or cross-border policy.";
  if (topic === "Energy") return "Energy shocks matter if they move inflation expectations, margins, or central-bank patience.";
  if (topic === "Crypto") return "Crypto read-through is ETF demand, stablecoin liquidity, and whether risk appetite extends beyond equities.";
  if (topic === "Sovereign policy") return "Policy direction is the asset-price channel: fiscal priorities, national champions, and foreign-capital confidence.";
  if (topic === "Markets") return "The key read is whether earnings, guidance, or flows change leadership and sector rotation.";
  return "";
}

export function curateDiverseItems(items = [], { limit = 4, maxSameTheme = MAX_SAME_THEME } = {}) {
  const sorted = items
    .filter(Boolean)
    .filter(passesInstitutionalFilter)
    .map((item) => ({ ...item, topic: item.topic || classifyIntelligenceTopic(item), theme: item.theme || inferNarrativeTheme(item), priority: Number(item.priority ?? item.signalScore ?? item.relevanceScore ?? 0) }))
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

function aiInsight(title) {
  if (/export|sanction|china|taiwan|japan|korea/iu.test(title)) return "Suggests AI compute controls and supply-chain routing remain active policy pressure points.";
  if (/capex|data center|datacenter|cloud|microsoft|amazon|google|meta/iu.test(title)) return "The question is whether hyperscaler spending still supports the AI infrastructure trade.";
  return "Markets are testing whether AI competition changes pricing power, capex durability, or leadership concentration.";
}

function itemText(item = {}) {
  return `${item.topic || ""} ${item.theme || ""} ${item.category || ""} ${item.title || ""} ${item.summary || ""} ${item.aiInsight || ""}`;
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
