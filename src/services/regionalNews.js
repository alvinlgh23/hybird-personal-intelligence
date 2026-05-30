import { analyzeRegionalItem, analyzeRegionalNews } from "../ai/regionalAnalyzer.js";
import { safeFetchText } from "../utils/fetch.js";
import { addSourceConfidence, credibilityAdjustedScore } from "./sourceCredibility.js";
import { buildUpcomingCatalysts } from "./catalysts.js";
import { renderRegionalBrief } from "./intelligenceRenderer.js";

const REGION_CONFIG = {
  jp: {
    flag: "🇯🇵",
    name: "Japan",
    terms: ["japan", "tokyo", "boj", "yen", "nikkei", "toyota", "softbank", "sony", "kishida", "ishiba"],
    feeds: ["https://www.japantimes.co.jp/feed/", "https://www3.nhk.or.jp/rss/news/cat0.xml", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
  kr: {
    flag: "🇰🇷",
    name: "Korea",
    terms: ["korea", "south korea", "seoul", "bok", "won", "samsung", "sk hynix", "hyundai", "kospi"],
    feeds: ["https://www.koreaherald.com/rss/020100000000.xml", "https://www.koreatimes.co.kr/www/rss/rss.xml", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
  sg: {
    flag: "🇸🇬",
    name: "Singapore",
    terms: ["singapore", "mas", "temasek", "gic", "sgx", "dbs", "ocbc", "uob", "straits times"],
    feeds: ["https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
  eu: {
    flag: "🇪🇺",
    name: "Europe",
    terms: ["europe", "eurozone", "ecb", "eu", "brussels", "germany", "france", "uk", "italy", "euro"],
    feeds: ["https://feeds.bbci.co.uk/news/world/europe/rss.xml", "https://www.euronews.com/rss?level=theme&name=news", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
  us: {
    flag: "🇺🇸",
    name: "United States",
    terms: ["us", "u.s.", "united states", "fed", "treasury", "white house", "congress", "nasdaq", "s&p", "washington"],
    feeds: ["https://feeds.a.dj.com/rss/RSSMarketsMain.xml", "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml", "https://feeds.reuters.com/reuters/businessNews"],
  },
  cn: {
    flag: "🇨🇳",
    name: "China",
    terms: ["china", "beijing", "pboc", "yuan", "renminbi", "hong kong", "taiwan", "shanghai", "shenzhen"],
    feeds: ["https://www.scmp.com/rss/91/feed", "https://feeds.bbci.co.uk/news/world/asia/rss.xml", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
  asean: {
    flag: "🌏",
    name: "ASEAN",
    terms: ["asean", "southeast asia", "indonesia", "malaysia", "thailand", "vietnam", "philippines", "singapore", "jakarta", "hanoi", "bangkok"],
    feeds: ["https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml", "https://feeds.bbci.co.uk/news/world/asia/rss.xml", "https://feeds.a.dj.com/rss/RSSMarketsMain.xml"],
  },
};

const HIGH_SIGNAL_RE =
  /(central bank|rate|rates|inflation|cpi|pce|pmi|gdp|economy|election|government|policy|minister|security|defense|war|geopolitic|sanction|trade|tariff|export|import|semiconductor|chip|\bai\b|technology|infrastructure|energy|oil|gas|nuclear|investment|market|stocks|bond|currency|crypto|bitcoin|stablecoin|regulation|demographic|birth|aging|company|earnings|guidance|revenue|capital)/iu;
const REGIME_CHANGING_RE =
  /(rate decision|central bank raises|central bank cuts|cpi surprise|inflation shock|war|invasion|missile|sanction|export control|chip ban|semiconductor ban|defense pact|strategic agreement|major infrastructure|nuclear deal|ai investment|data center investment|capital controls|currency intervention)/iu;
const MAJOR_STRATEGIC_RE =
  /(regulation|regulates|regulatory|fine|fines|antitrust|enforcement|digital markets|policy change|government approved|passes bill|tariff|trade restriction|exports|imports|defense|security|semiconductor|chip|\bai\b|data center|energy security|major company|earnings|guidance|investment|acquisition|merger)/iu;
const STRATEGIC_ACTION_RE =
  /(policy change|passes bill|approved|announced|launches|invests|investment|strategic agreement|memorandum|regulation|regulates|sanction|export control|infrastructure|semiconductor|chip|\bai\b|data center|trade deal|tariff|company|earnings|guidance|merger|acquisition|central bank|rate decision)/iu;
const LOW_SIGNAL_RE = /(murder|arrested|traffic accident|crash kills|celebrity|idol|influencer|viral|lottery|soccer|football|baseball|tennis|gossip|weather|restaurant|tourist)/iu;
const CLICKBAIT_RE = /(you won't believe|shocking|strange|weird|goes viral|internet reacts)/iu;
const COMMENTARY_RE = /(^|\b)(opinion|commentary|column|editorial|op-ed|view|perspective|analysis:|explainer)\b/iu;
const INSTANT_SKIP_RE = /(school drama|viral incident|viral video|social media backlash|broad social discussion|culture war|celebrity|gossip|influencer|sports roundup|restaurant review|crime blotter|traffic accident)/iu;

export function isRegionCommand(command) {
  return Boolean(REGION_CONFIG[command.replace(/^\//u, "")]);
}

export async function buildRegionalNewsBrief(command, { env, limit = 3, deep = false, synth = false, itemIndex = null } = {}) {
  const key = command.replace(/^\//u, "");
  const region = REGION_CONFIG[key];
  if (!region) return null;

  const rawItems = await fetchRegionalItems(region);
  const ranked = filterHighSignalRegionalNews(rawItems, region);
  if (itemIndex) {
    const item = ranked[itemIndex - 1];
    if (!item) return `${region.name} Detail\n\nNo high-signal item #${itemIndex} found. Try /${key} first.`;
    return analyzeRegionalItem(region, item, { env, index: itemIndex });
  }

  const selected = ranked.slice(0, Math.min(deep ? 10 : synth ? 5 : limit, 10));
  const catalysts = buildUpcomingCatalysts({ headlines: selected, regionKey: key, includeFallback: true });
  if (!selected.length) {
    return renderRegionalBrief(region, [], {
      title: `${region.name} News Intelligence Brief`,
      emptyText: "No major high-signal regional developments found.",
      catalysts,
    });
  }

  if (synth) return [`${region.name} Synthesis`, "", await analyzeRegionalNews(region, selected, { env, deep: false })].join("\n");

  if (!deep) return renderRegionalBrief(region, selected, { catalysts });

  const synthesis = await analyzeRegionalNews(region, selected, { env, deep });
  return [renderRegionalBrief(region, selected, { limit: 10, title: `${region.flag || ""} ${region.name.toUpperCase()} DEEP BRIEF`.trim(), catalysts }), "", synthesis].join("\n\n");
}

export function filterHighSignalRegionalNews(items, region) {
  const enriched = dedupe(items)
    .map((item) => enrichRegionalItem(item, region));
  return addSourceConfidence(enriched)
    .map((item) => {
      const signalScore = finalRegionalScore(item);
      return { ...item, signalScore, signal: signalScore };
    })
    .filter(passesEditorFilter)
    .sort((a, b) => b.signalScore - a.signalScore || String(b.published || "").localeCompare(String(a.published || "")));
}

export function scoreRegionalNewsItem(item, region) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  let score = region.terms.some((term) => text.includes(term.toLowerCase())) ? 2 : 0;

  if (REGIME_CHANGING_RE.test(text)) score += 4;
  else if (MAJOR_STRATEGIC_RE.test(text)) score += 4.5;
  else if (STRATEGIC_ACTION_RE.test(text)) score += 2;
  else if (HIGH_SIGNAL_RE.test(text)) score += 1.5;

  if (/(central bank|\brates?\b|inflation|currency|bond|capital flow|semiconductor|\bai\b|sanction|defense|trade|energy|major company|earnings|guidance|regulation|regulatory|fine|fines|antitrust)/iu.test(text)) score += 1;
  if (LOW_SIGNAL_RE.test(text)) score -= 4;
  if (CLICKBAIT_RE.test(text)) score -= 3;
  if (COMMENTARY_RE.test(text)) score -= 2.5;
  if (!HIGH_SIGNAL_RE.test(text)) score -= 2;

  const capped = COMMENTARY_RE.test(text) && !REGIME_CHANGING_RE.test(text) ? Math.min(score, 6.5) : score;
  return Math.max(0, Math.min(10, capped));
}

function finalRegionalScore(item) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  const adjusted = credibilityAdjustedScore(item.signalScore, item, item.confirmationCount);
  if (COMMENTARY_RE.test(text) && !REGIME_CHANGING_RE.test(text)) return Math.min(adjusted, 6);
  if (REGIME_CHANGING_RE.test(text) && item.majorSourceCount >= 2) return Math.min(10, adjusted + 1);
  return adjusted;
}

function passesEditorFilter(item) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  if (item.signalScore < 6) return false;
  if (INSTANT_SKIP_RE.test(text)) return false;
  if (COMMENTARY_RE.test(text)) return false;
  if (/(morning bid|market talk|stocks mixed|wrap|recap|explainer|what to know)/iu.test(text) && item.signalScore < 8) return false;
  return true;
}

function enrichRegionalItem(item, region) {
  const signalScore = scoreRegionalNewsItem(item, region);
  const category = inferCategory(item);
  return {
    ...item,
    signalScore,
    signal: signalScore,
    category,
    aiInsight: aiInsight(category, item),
  };
}

async function fetchRegionalItems(region) {
  const batches = await Promise.all(region.feeds.map((feed) => safeFetchText(feed).then((xml) => parseRssItems(xml, feed))));
  const items = batches.flat();
  const termMatches = items.filter((item) => region.terms.some((term) => `${item.title} ${item.summary}`.toLowerCase().includes(term.toLowerCase())));
  return termMatches.length ? termMatches : items;
}

function aiInsight(category, item) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  const convergence = item.confidenceNote ? ` ${item.confidenceNote}` : "";
  if (/(nvidia|chip|semiconductor|gpu|hbm)/u.test(text) && /(china|export control|sanction|japan|korea|taiwan)/u.test(text)) {
    return `Suggests AI demand and supply-chain workarounds may be testing export controls; smart money watches sanction escalation, supplier exposure, and rerouting risk.${convergence}`;
  }
  if (/(fine|fines|antitrust|regulation|regulatory|digital markets)/u.test(text)) {
    return `Signals tougher platform regulation and higher compliance risk; smart money watches whether pressure spreads to peers, margins, or cross-border tech policy.${convergence}`;
  }
  if (/(yen|boj|bank of japan|\brates?\b|\byields?\b)/u.test(text)) {
    return `The policy/FX channel is the signal: yen, JGB yields, exporters, banks, and carry trades show whether the market believes the rate path is changing.${convergence}`;
  }
  if (/(shangri-la|defense|security tension|military|us-china|u\.s\.-china|south china sea)/u.test(text)) {
    return `Signals rising security competition and reinforces the region's role as a strategic diplomatic hub; defense posture and alliance messaging matter most.${convergence}`;
  }
  if (/(election|government|minister|parliament|congress|regulation|policy)/u.test(text)) {
    return `Policy direction is the asset-price channel; watch regulation, fiscal priorities, national champions, and foreign-capital confidence.${convergence}`;
  }
  if (category === "Macro / central bank") return `Can reprice rates, currency, banks, exporters, and duration assets; smart money watches bond/FX confirmation, not just the headline.${convergence}`;
  if (category === "Technology / infrastructure") return `Signals where strategic capex and national competitiveness are moving; read-through runs to AI capacity, semis, power, and supply chains.${convergence}`;
  if (category === "Security / geopolitics") return `Raises risk-premium and policy-response questions; smart money watches sanctions, defense spend, trade restrictions, and supply-chain rerouting.${convergence}`;
  if (category === "Trade / investment") return `Can redirect capital flows and supply chains; the key tells are currency reaction, exporter sensitivity, and follow-on policy moves.${convergence}`;
  if (category === "Energy") return `Energy shocks transmit through inflation, margins, trade balances, and central-bank patience; watch whether prices move beyond local noise.${convergence}`;
  if (category === "Markets / companies") return `Matters if it changes earnings revisions, index leadership, or sector rotation; watch peer reaction and guidance read-through.${convergence}`;
  if (category === "Crypto / digital assets") return `Shows whether speculative capital and regulation are improving or tightening; watch ETF/stablecoin flow confirmation where available.${convergence}`;
  return `Potential strategic signal for policy, capital flows, or national competitiveness; watch whether markets and officials validate it.${convergence}`;
}

function inferCategory(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (/(central bank|\brates?\b|inflation|cpi|pce|pmi|gdp|fed|ecb|boj|bok|pboc)/u.test(text)) return "Macro / central bank";
  if (/(war|security|defense|geopolitic|sanction|taiwan|china sea)/u.test(text)) return "Security / geopolitics";
  if (/(election|government|minister|policy|regulation|parliament|congress)/u.test(text)) return "Policy / politics";
  if (/(semiconductor|chip|\bai\b|technology|data center|infrastructure)/u.test(text)) return "Technology / infrastructure";
  if (/(trade|tariff|export|import|supply chain|investment)/u.test(text)) return "Trade / investment";
  if (/(energy|oil|gas|nuclear|power)/u.test(text)) return "Energy";
  if (/(market|stocks|bond|currency|earnings|guidance|revenue|company)/u.test(text)) return "Markets / companies";
  if (/(crypto|bitcoin|ethereum|stablecoin)/u.test(text)) return "Crypto / digital assets";
  return "Strategic development";
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
