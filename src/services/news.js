import { generateSummary } from "../ai/router.js";
import { safeFetchText } from "../utils/fetch.js";
import { addSourceConfidence, credibilityAdjustedScore } from "./sourceCredibility.js";
import { buildTopicInsight, classifyIntelligenceTopic, passesInstitutionalFilter } from "./intelligenceCuration.js";

const DEFAULT_FEEDS = [
  "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://feeds.bbci.co.uk/news/business/rss.xml",
  "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml",
  "https://www.japantimes.co.jp/feed/",
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://feeds.reuters.com/reuters/businessNews",
];

export async function getTopHeadlines({ env, limit = 5 } = {}) {
  const feeds = (env.NEWS_RSS_FEEDS || DEFAULT_FEEDS.join(","))
    .split(",")
    .map((feed) => feed.trim())
    .filter(Boolean);

  const results = [];
  for (const feed of feeds) {
    const xml = await safeFetchText(feed);
    results.push(...parseRssItems(xml));
    if (results.length >= limit) break;
  }

  return dedupe(results).slice(0, limit);
}

export function formatHeadlines(headlines) {
  if (!headlines.length) return "Headlines: n/a";
  return ["Headlines:", ...headlines.map((item) => `- ${item.title}`)].join("\n");
}

export async function getMarketMovingHeadlines({ env, limit = 8 } = {}) {
  const headlines = await getTopHeadlines({ env, limit: 30 });
  return filterHighSignalNews(categorizeHeadlines(headlines)).slice(0, limit);
}

export async function getCompanyHeadlines(ticker, { env, limit = 2 } = {}) {
  const headlines = await getTopHeadlines({ env, limit: 30 });
  const needle = ticker.toLowerCase();
  return headlines
    .filter((item) => item.title.toLowerCase().includes(needle) || companyAliases(ticker).some((alias) => item.title.toLowerCase().includes(alias)))
    .slice(0, limit)
    .map((item) => ({ ...item, ticker: ticker.toUpperCase() }));
}

export function formatMarketMovingHeadlines(items) {
  if (!items.length) return "Market-Moving News\n\nNo fresh headlines available.";
  return [
    "Market-Moving News",
    "",
    ...items.map((item) =>
      [
        `${item.category}: ${item.title}`,
        `Source: ${item.source || "RSS"}${item.sourceCategory ? ` (${item.sourceCategory})` : ""}`,
        item.confidenceNote ? `Confidence: ${item.confidenceNote}` : "",
        `🧠 ${compactNewsInsight(item)}`,
      ].join("\n"),
    ),
  ].join("\n\n");
}

export function formatShortMarketMovingHeadlines(items, { title = "Market-Moving Headlines", limit = 5 } = {}) {
  const selected = items.slice(0, limit);
  if (!selected.length) return `${title}\n\nNo major high-signal developments found.`;
  return [
    title,
    "",
    ...selected.map((item, index) =>
      [
        `${index + 1}. ${item.title}`,
        `Source: ${item.source || "RSS"}${item.sourceCategory ? ` (${item.sourceCategory})` : ""}`,
        `🧠 ${compactNewsInsight(item)}`,
        item.confidenceNote ? `Confidence: ${item.confidenceNote}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n\n");
}

export function summarizeMarketMovingHeadlines(items, { env }) {
  const fallback = formatMarketMovingHeadlines(items);
  if (!items.length) return fallback;

  const prompt = [
    "Create a concise market-moving headline brief for Telegram.",
    "Use only the supplied headlines. Act as an editor: compress, rank, and lightly contextualize.",
    "For each item use: headline, source, one short intelligence read.",
    "Avoid long sections, signal scores, confidence scores, and generic macro filler.",
    "",
    "Input:",
    JSON.stringify(items, null, 2),
  ].join("\n");

  return generateSummary(prompt, { env, fallback, maxOutputTokens: 1600 });
}

function parseRssItems(xml) {
  if (!xml) return [];
  const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/giu)].slice(0, 8);
  return itemBlocks
    .map((match) => ({
      title: decodeXml(tag(match[0], "title")),
      link: decodeXml(tag(match[0], "link")),
      published: decodeXml(tag(match[0], "pubDate")),
      source: sourceFromLink(decodeXml(tag(match[0], "link"))),
    }))
    .filter((item) => item.title);
}

function categorizeHeadlines(headlines) {
  return headlines.map((item) => {
    const title = item.title.toLowerCase();
    const relevanceScore = scoreNewsItem(item);
    const topic = classifyIntelligenceTopic(item);
    if (/(fed|rate|yield|inflation|treasury|powell)/u.test(title)) {
      return withNarrative({ ...item, relevanceScore, topic, category: "Fed / rates" });
    }
    if (/(\bai\b|nvidia|semiconductor|chip|amd|tsmc|avgo|micron|data center|datacenter)/u.test(title)) {
      return withNarrative({ ...item, relevanceScore, topic, category: "AI / semiconductors" });
    }
    if (/(bitcoin|crypto|ethereum|eth|btc|etf|stablecoin)/u.test(title)) {
      return withNarrative({ ...item, relevanceScore, topic, category: "Crypto" });
    }
    if (/(china|geopolitic|tariff|taiwan|war|sanction)/u.test(title)) {
      return withNarrative({ ...item, relevanceScore, topic, category: "China / geopolitics" });
    }
    if (/(defense|military|missile|security summit|shangri-la|deterrence|navy|army|air force|pentagon|nato)/u.test(title)) {
      return withNarrative({ ...item, relevanceScore, topic, category: "Defense" });
    }
    if (/(earnings|guidance|revenue|margin|capex|profit|sales)/u.test(title)) {
      return withNarrative({ ...item, relevanceScore, topic, category: "Earnings / guidance" });
    }
    return withNarrative({ ...item, relevanceScore, topic, category: topic === "Skip" ? "Skip" : topic });
  });
}

export function filterHighSignalNews(items) {
  return addSourceConfidence(items)
    .map((item) => ({ ...item, relevanceScore: credibilityAdjustedScore(item.relevanceScore, item, item.confirmationCount) }))
    .map((item) => {
      const topic = item.topic || classifyIntelligenceTopic(item);
      const aiInsight = item.aiInsight || item.marketNarrativeImpact || buildTopicInsight({ ...item, topic });
      return { ...item, topic, aiInsight, marketNarrativeImpact: aiInsight };
    })
    .filter((item) => passesInstitutionalFilter(item) && isMarketRelevant(item))
    .sort((a, b) => b.relevanceScore - a.relevanceScore || String(b.published || "").localeCompare(String(a.published || "")));
}

export function buildNarrativeImpact(item) {
  return buildTopicInsight(item);
}

export function scoreNewsItem(item) {
  const title = String(item?.title || "").toLowerCase();
  let score = 0;

  if (/(fed|powell|fomc|cpi|pce|treasury|yield|yields|rates|inflation|jobs|payroll|auction)/u.test(title)) score += 5;
  if (/(nvda|nvidia|msft|microsoft|aapl|apple|amzn|amazon|googl|google|alphabet|meta|tesla|tsla|pltr|palantir|mu|micron|tsm|tsmc|amd|avgo|broadcom|crm|salesforce|snow|snowflake|cost|costco|dell)/u.test(title)) score += 4;
  if (/(ai capex|artificial intelligence|\bai\b|semiconductor|chip|chips|data center|datacenter|gpu|hbm)/u.test(title)) score += 4;
  if (/(bitcoin|btc|ethereum|eth|crypto|etf flows|etf|stablecoin|stablecoins)/u.test(title)) score += 3;
  if (/(china|taiwan|geopolitic|war|sanction|oil shock|energy shock|crude|opec)/u.test(title)) score += 3;
  if (/(defense|military|missile|security summit|shangri-la|deterrence|navy|army|air force|pentagon|nato)/u.test(title)) score += 3;
  if (/(earnings|guidance|revenue|margin|capex|profit|sales|beat|miss)/u.test(title)) score += 3;

  if (/(market talk|stocks mixed|set to open|futures edge|morning bid|wrap|recap|settle|settlement)/u.test(title)) score -= 2;
  if (/(badminton|soccer|football|baseball|tennis|celebrity|viral|coffee|cocoa|corn|soybean|wheat|livestock|random)/u.test(title)) score -= 6;
  if (!/(fed|cpi|pce|treasury|yield|rate|inflation|\bai\b|chip|semiconductor|bitcoin|crypto|china|defense|military|security|oil|earnings|guidance|revenue|margin|capex|nvda|nvidia|msft|aapl|amzn|googl|meta|tsla|pltr|amd|tsm|mu|avgo|crm|snow|cost|dell)/u.test(title)) score -= 1;

  return Math.max(0, Math.min(10, score));
}

function withNarrative(item) {
  return { ...item, marketNarrativeImpact: buildNarrativeImpact(item), aiInsight: buildNarrativeImpact(item) };
}

function isMarketRelevant(item) {
  const title = item.title.toLowerCase();
  if (classifyIntelligenceTopic(item) === "Skip") return false;
  if (item.relevanceScore >= 4) return true;
  if (/(badminton|sports|celebrity|viral|coffee|cocoa|gold|settle|settlement|minor|recap)/u.test(title)) return false;
  if (/tariff/u.test(title)) return /(china|trade war|inflation|supply chain|semiconductor|autos|market|stocks)/u.test(title);
  return item.relevanceScore >= 2;
}

function compressBySignal(text, score = 0) {
  const value = String(text || "").replace(/\s+/gu, " ").trim();
  if (score >= 8) return value;
  const sentences = value.split(/(?<=[.!?])\s+/u).filter(Boolean);
  if (score >= 5) return sentences.slice(0, 1).join(" ") || value.slice(0, 150);
  return (sentences[0] || value).slice(0, 110);
}

function compactNewsInsight(item) {
  const text = item.marketNarrativeImpact || item.why || "Track only if it changes policy, liquidity, earnings, or leadership.";
  return compressBySignal(text, item.relevanceScore);
}

function companyAliases(ticker) {
  const aliases = {
    NVDA: ["nvidia"],
    MSFT: ["microsoft"],
    AAPL: ["apple"],
    AMZN: ["amazon"],
    GOOGL: ["alphabet", "google"],
    META: ["meta"],
    TSLA: ["tesla"],
    AMD: ["advanced micro"],
    TSM: ["tsmc", "taiwan semiconductor"],
    AVGO: ["broadcom"],
  };
  return aliases[ticker.toUpperCase()] || [];
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
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'");
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
