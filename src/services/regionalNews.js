import { analyzeRegionalNews } from "../ai/regionalAnalyzer.js";
import { safeFetchText } from "../utils/fetch.js";

const REGION_CONFIG = {
  jp: {
    name: "Japan",
    terms: ["japan", "tokyo", "boj", "yen", "nikkei", "toyota", "softbank", "sony", "kishida", "ishiba"],
    feeds: ["https://www.japantimes.co.jp/feed/", "https://www3.nhk.or.jp/rss/news/cat0.xml", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
  kr: {
    name: "Korea",
    terms: ["korea", "south korea", "seoul", "bok", "won", "samsung", "sk hynix", "hyundai", "kospi"],
    feeds: ["https://www.koreaherald.com/rss/020100000000.xml", "https://www.koreatimes.co.kr/www/rss/rss.xml", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
  sg: {
    name: "Singapore",
    terms: ["singapore", "mas", "temasek", "gic", "sgx", "dbs", "ocbc", "uob", "straits times"],
    feeds: ["https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
  eu: {
    name: "Europe",
    terms: ["europe", "eurozone", "ecb", "eu", "brussels", "germany", "france", "uk", "italy", "euro"],
    feeds: ["https://feeds.bbci.co.uk/news/world/europe/rss.xml", "https://www.euronews.com/rss?level=theme&name=news", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
  us: {
    name: "United States",
    terms: ["us", "u.s.", "united states", "fed", "treasury", "white house", "congress", "nasdaq", "s&p", "washington"],
    feeds: ["https://feeds.a.dj.com/rss/RSSMarketsMain.xml", "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml", "https://feeds.reuters.com/reuters/businessNews"],
  },
  cn: {
    name: "China",
    terms: ["china", "beijing", "pboc", "yuan", "renminbi", "hong kong", "taiwan", "shanghai", "shenzhen"],
    feeds: ["https://www.scmp.com/rss/91/feed", "https://feeds.bbci.co.uk/news/world/asia/rss.xml", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
  asean: {
    name: "ASEAN",
    terms: ["asean", "southeast asia", "indonesia", "malaysia", "thailand", "vietnam", "philippines", "singapore", "jakarta", "hanoi", "bangkok"],
    feeds: ["https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml", "https://feeds.bbci.co.uk/news/world/asia/rss.xml", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
};

const HIGH_SIGNAL_RE =
  /(central bank|rate|rates|inflation|cpi|pce|pmi|gdp|economy|election|government|policy|minister|security|defense|war|geopolitic|sanction|trade|tariff|export|import|semiconductor|chip|ai|technology|infrastructure|energy|oil|gas|nuclear|investment|market|stocks|bond|currency|crypto|bitcoin|stablecoin|regulation|demographic|birth|aging|company|earnings|guidance|revenue|capital)/iu;
const LOW_SIGNAL_RE = /(murder|arrested|traffic accident|crash kills|celebrity|idol|influencer|viral|lottery|soccer|football|baseball|tennis|gossip|weather|restaurant|tourist)/iu;
const CLICKBAIT_RE = /(you won't believe|shocking|strange|weird|goes viral|internet reacts)/iu;

export function isRegionCommand(command) {
  return Boolean(REGION_CONFIG[command.replace(/^\//u, "")]);
}

export async function buildRegionalNewsBrief(command, { env, limit = 8 } = {}) {
  const key = command.replace(/^\//u, "");
  const region = REGION_CONFIG[key];
  if (!region) return null;

  const rawItems = await fetchRegionalItems(region);
  const selected = filterHighSignalRegionalNews(rawItems, region).slice(0, Math.min(limit, 10));
  if (!selected.length) return `${region.name} News Intelligence Brief\n\nNo major high-signal regional developments found.`;

  const synthesis = await analyzeRegionalNews(region, selected, { env });
  return [formatRegionalItems(region, selected), "", synthesis].join("\n\n");
}

export function filterHighSignalRegionalNews(items, region) {
  return dedupe(items)
    .map((item) => enrichRegionalItem(item, region))
    .filter((item) => item.signalScore >= 4)
    .sort((a, b) => b.signalScore - a.signalScore || String(b.published || "").localeCompare(String(a.published || "")));
}

export function scoreRegionalNewsItem(item, region) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  let score = 0;
  if (region.terms.some((term) => text.includes(term.toLowerCase()))) score += 3;
  if (HIGH_SIGNAL_RE.test(text)) score += 4;
  if (/(central bank|rate|inflation|election|semiconductor|ai|security|war|trade|energy|crypto|earnings|guidance|capital market|bond|currency)/iu.test(text)) score += 2;
  if (LOW_SIGNAL_RE.test(text)) score -= 5;
  if (CLICKBAIT_RE.test(text)) score -= 4;
  if (!HIGH_SIGNAL_RE.test(text)) score -= 2;
  return Math.max(0, Math.min(10, score));
}

function enrichRegionalItem(item, region) {
  const signalScore = scoreRegionalNewsItem(item, region);
  const category = inferCategory(item);
  return {
    ...item,
    signalScore,
    category,
    whyItMatters: whyItMatters(category),
    potentialImpact: potentialImpact(category),
    whatToWatchNext: whatToWatchNext(category),
  };
}

async function fetchRegionalItems(region) {
  const batches = await Promise.all(region.feeds.map((feed) => safeFetchText(feed).then((xml) => parseRssItems(xml, feed))));
  const items = batches.flat();
  const termMatches = items.filter((item) => region.terms.some((term) => `${item.title} ${item.summary}`.toLowerCase().includes(term.toLowerCase())));
  return termMatches.length ? termMatches : items;
}

function formatRegionalItems(region, items) {
  return [
    `${region.name} News Intelligence Brief`,
    "",
    ...items.map((item, index) =>
      [
        `${index + 1}. ${item.title}`,
        `Source: ${item.source || "RSS"}`,
        `Published: ${item.published || "n/a"}`,
        `News summary: ${item.summary || item.title}`,
        `Why it matters: ${item.whyItMatters}`,
        "Potential impact:",
        `- Economy: ${item.potentialImpact.economy}`,
        `- Markets / companies: ${item.potentialImpact.markets}`,
        `- Policy / geopolitics: ${item.potentialImpact.policy}`,
        `What to watch next: ${item.whatToWatchNext}`,
        `Signal score: ${item.signalScore}/10`,
      ].join("\n"),
    ),
  ].join("\n\n");
}

function inferCategory(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (/(central bank|rate|inflation|cpi|pce|pmi|gdp|fed|ecb|boj|bok|pboc)/u.test(text)) return "Macro / central bank";
  if (/(election|government|minister|policy|regulation|parliament|congress)/u.test(text)) return "Policy / politics";
  if (/(war|security|defense|geopolitic|sanction|taiwan|china sea)/u.test(text)) return "Security / geopolitics";
  if (/(semiconductor|chip|\bai\b|technology|data center|infrastructure)/u.test(text)) return "Technology / infrastructure";
  if (/(trade|tariff|export|import|supply chain|investment)/u.test(text)) return "Trade / investment";
  if (/(energy|oil|gas|nuclear|power)/u.test(text)) return "Energy";
  if (/(market|stocks|bond|currency|earnings|guidance|revenue|company)/u.test(text)) return "Markets / companies";
  if (/(crypto|bitcoin|ethereum|stablecoin)/u.test(text)) return "Crypto / digital assets";
  return "Strategic development";
}

function whyItMatters(category) {
  const map = {
    "Macro / central bank": "It can shift growth, inflation, rates, currency expectations, and regional risk appetite.",
    "Policy / politics": "It can change policy direction, regulation, fiscal priorities, or investor confidence.",
    "Security / geopolitics": "It can alter risk premia, supply chains, defense spending, and cross-border capital flows.",
    "Technology / infrastructure": "It affects productivity, national competitiveness, AI capacity, and key listed companies.",
    "Trade / investment": "It can reshape supply chains, foreign investment, exporters, and currency sensitivity.",
    Energy: "Energy shocks can feed inflation, trade balances, industrial margins, and policy response.",
    "Markets / companies": "It can affect earnings expectations, index leadership, capital markets, and sector rotation.",
    "Crypto / digital assets": "It can signal regulatory direction, adoption, and speculative capital flows.",
  };
  return map[category] || "It may affect the region's economic or strategic direction.";
}

function potentialImpact(category) {
  const common = {
    economy: "Watch growth, inflation, investment, and confidence spillovers.",
    markets: "Watch listed leaders, currency, rates, credit, and sector read-through.",
    policy: "Watch official response, regulation, diplomacy, and implementation details.",
  };
  if (category === "Technology / infrastructure") return { economy: "Potential productivity and capex implications.", markets: "Read-through to tech, semis, data centers, and national champions.", policy: "May influence industrial policy and strategic autonomy." };
  if (category === "Macro / central bank") return { economy: "Can alter growth/inflation expectations.", markets: "Rates, currency, banks, exporters, and duration assets are sensitive.", policy: "Central-bank reaction function becomes the key variable." };
  return common;
}

function whatToWatchNext(category) {
  if (category === "Macro / central bank") return "Next inflation, labor, PMI, central-bank communication, and bond/currency reaction.";
  if (category === "Technology / infrastructure") return "Follow capex plans, supply-chain response, regulation, and affected company guidance.";
  if (category === "Security / geopolitics") return "Watch official statements, sanctions, military posture, trade restrictions, and market risk premia.";
  return "Watch confirmation from official statements, market reaction, follow-up reporting, and company/policy responses.";
}

function parseRssItems(xml, feedUrl) {
  if (!xml) return [];
  const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/giu)].slice(0, 25);
  return itemBlocks
    .map((match) => ({
      title: decodeXml(tag(match[0], "title")),
      link: decodeXml(tag(match[0], "link")),
      published: decodeXml(tag(match[0], "pubDate")),
      summary: cleanSummary(decodeXml(tag(match[0], "description"))),
      source: sourceFromLink(decodeXml(tag(match[0], "link")) || feedUrl),
    }))
    .filter((item) => item.title);
}

function cleanSummary(value) {
  return value.replace(/<[^>]+>/gu, "").replace(/\s+/gu, " ").trim().slice(0, 300);
}

function sourceFromLink(link) {
  try {
    return new URL(link).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}

function tag(xml, name) {
  return xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "iu"))?.[1]?.replace(/<!\[CDATA\[|\]\]>/gu, "").trim() || "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'");
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.title.toLowerCase().replace(/[^\w\s]/gu, "").slice(0, 90);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
