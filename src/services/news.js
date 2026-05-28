import { safeFetchText } from "../utils/fetch.js";

const DEFAULT_FEEDS = [
  "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
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
  return categorizeHeadlines(headlines).slice(0, limit);
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
    ...items.map((item) => [`${item.category}: ${item.title}`, `Source: ${item.source || "RSS"}`, `Why it matters: ${item.why}`].join("\n")),
  ].join("\n\n");
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
    if (/(fed|rate|yield|inflation|treasury|powell)/u.test(title)) {
      return { ...item, category: "Fed / rates", why: "Rates shape liquidity, equity multiples, and crypto beta." };
    }
    if (/(ai|nvidia|semiconductor|chip|amd|tsmc|avgo|micron)/u.test(title)) {
      return { ...item, category: "AI / semiconductors", why: "AI capex and chip demand drive mega-cap risk appetite." };
    }
    if (/(bitcoin|crypto|ethereum|eth|btc|etf)/u.test(title)) {
      return { ...item, category: "Crypto", why: "Crypto momentum reflects liquidity and speculative risk appetite." };
    }
    if (/(china|geopolitic|tariff|taiwan|war|sanction)/u.test(title)) {
      return { ...item, category: "China / geopolitics", why: "Geopolitical risk can hit supply chains and global beta." };
    }
    return { ...item, category: "Major company news", why: "Single-name news can move sector leadership and index breadth." };
  });
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
