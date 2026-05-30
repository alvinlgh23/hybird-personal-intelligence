const MS_PER_DAY = 86_400_000;

const EVENT_RE =
  /(earnings|fomc|fed|powell|cpi|pce|ppi|payroll|jobs report|ecb|boj|mas|opec|rate decision|policy meeting|speech|summit|conference|election|vote|defense minister|shangri-la|apple event|nvidia|semiconductor|chip|ai conference)/iu;

const REGION_RE = {
  sg: /(singapore|mas|sgx|temasek|gic|asean|shangri-la|straits)/iu,
  jp: /(japan|boj|yen|tokyo|nikkei|softbank|toyota|sony)/iu,
  eu: /(europe|eurozone|ecb|brussels|germany|france|uk|italy|euro)/iu,
  asean: /(asean|southeast asia|singapore|indonesia|malaysia|thailand|vietnam|philippines|shangri-la)/iu,
};

export function buildUpcomingCatalysts({ earnings, headlines = [], regionKey = "", includeFallback = false } = {}) {
  const today = [];
  const week = [];

  addEarningsCatalysts(today, week, earnings);
  addHeadlineCatalysts(today, week, headlines, regionKey);

  return {
    today: unique(today).slice(0, 4),
    week: unique(week).slice(0, 6),
    includeFallback,
  };
}

function addEarningsCatalysts(today, week, earnings) {
  const value = earnings?.value || earnings || {};
  for (const item of value.reportingToday || []) {
    if (item?.ticker) today.push(`${item.ticker} earnings`);
  }
  for (const item of value.upcoming || []) {
    if (item?.ticker) week.push(`${item.ticker} earnings`);
  }
  for (const item of value.items || []) {
    if (!item?.ticker) continue;
    if (isToday(item.earningsDate)) today.push(`${item.ticker} earnings`);
    else if (isWithinWeek(item.earningsDate)) week.push(`${item.ticker} earnings`);
  }
}

function addHeadlineCatalysts(today, week, headlines, regionKey) {
  const regionRe = REGION_RE[regionKey] || null;
  for (const item of headlines || []) {
    const title = String(item.title || "").replace(/\s+/gu, " ").trim();
    if (!title || !EVENT_RE.test(title)) continue;
    if (regionRe && !regionRe.test(`${title} ${item.summary || ""} ${item.category || ""}`)) continue;
    const label = catalystLabel(title);
    if (/\btoday\b|this morning|tonight/iu.test(title)) today.push(label);
    else week.push(label);
  }
}

function catalystLabel(title) {
  const compact = title
    .replace(/\s*[-–—]\s*(Reuters|Bloomberg|WSJ|Financial Times|FT|BBC|CNA|Nikkei|AP).*$/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return compact.length > 72 ? `${compact.slice(0, 69).trim()}...` : compact;
}

function isToday(value) {
  const date = parseDate(value);
  if (!date) return false;
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isWithinWeek(value) {
  const date = parseDate(value);
  if (!date) return false;
  const now = new Date();
  const delta = date.getTime() - startOfDay(now).getTime();
  return delta >= 0 && delta <= 7 * MS_PER_DAY;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function unique(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
