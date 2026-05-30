export function renderRegionalBrief(region, items, { limit = 3, title, catalysts = null, emptyText = "" } = {}) {
  const selected = items.slice(0, limit);
  const body = selected.length ? selected.map((item, index) => renderHeadline({ ...item, rank: index + 1 })) : [emptyText];
  return [title || `${region.flag || ""} ${region.name.toUpperCase()} BRIEF`.trim(), ...body, renderCatalysts(catalysts)].filter(Boolean).join("\n\n");
}

export function renderMorningBrief({ date, headlines = [], signals = [], marketPulse = [], catalysts = null }) {
  const title = `🌍 Morning Headlines — ${date}`;
  const items = headlines.length ? headlines : signals;
  const signalLines = items.slice(0, 4).map((item, index) => renderSignal({ ...item, rank: index + 1 }));
  const pulse = marketPulse.length ? ["📊 Market Pulse", ...marketPulse].join("\n") : "";
  return [title, ...withSeparators(signalLines), pulse, renderCatalysts(catalysts)].filter(Boolean).join("\n\n");
}

export function renderHeadline(item) {
  return `${item.rank}. ${item.title}
   Source: ${item.source || "RSS"}
   🧠 ${oneLine(item.aiInsight)}`;
}

export function renderSignal(item) {
  const source = item.source ? `\n   Source: ${item.source}` : "";
  return `${item.rank}. ${item.title}${source}
   🧠 ${oneLine(item.aiInsight)}`;
}

function oneLine(value, max = 220) {
  const text = String(value || "No concise intelligence read available.").replace(/\s+/gu, " ").trim();
  const sentence = text.split(/(?<=[.!?])\s+/u).filter(Boolean).slice(0, 2).join(" ") || text;
  return sentence.length > max ? `${sentence.slice(0, max - 3).trim()}...` : sentence;
}

function withSeparators(items) {
  return items.flatMap((item, index) => (index < items.length - 1 ? [item, "—"] : [item]));
}

function renderCatalysts(catalysts) {
  if (!catalysts) return "";
  const today = (catalysts.today || []).slice(0, 4);
  const week = (catalysts.week || []).slice(0, 6);
  if (!today.length && !week.length && !catalysts.includeFallback) return "";

  const lines = ["📅 Upcoming Catalysts"];
  if (today.length) lines.push("", "Today", ...today.map((item) => `* ${item}`));
  if (week.length) lines.push("", "This Week", ...week.map((item) => `* ${item}`));
  if (!today.length && !week.length) lines.push("", "This Week", "* No high-impact scheduled catalysts from configured feeds");
  return lines.join("\n");
}
