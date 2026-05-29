export function renderRegionalBrief(region, items, { limit = 3, title } = {}) {
  const selected = items.slice(0, limit);
  return [title || `${region.flag || ""} ${region.name.toUpperCase()} BRIEF`.trim(), ...selected.map((item, index) => renderHeadline({ ...item, rank: index + 1 }))].join("\n\n");
}

export function renderMorningBrief({ date, signals = [], marketPulse = [], watch = [] }) {
  const title = `🌍 Morning Intelligence Brief — ${date}`;
  const signalLines = signals.slice(0, 3).map((item, index) => renderSignal({ ...item, rank: index + 1 }));
  const pulse = marketPulse.length ? ["📊 Market Pulse", ...marketPulse].join("\n") : "";
  const watchLines = watch.length ? ["👀 Watch Today", ...watch.slice(0, 7).map((item) => `* ${item}`)].join("\n") : "";
  return [title, ...signalLines, pulse, watchLines].filter(Boolean).join("\n\n");
}

export function renderHeadline(item) {
  return `${item.rank}. ${item.title}
   Source: ${item.source || "RSS"}
   🧠 ${oneLine(item.aiInsight)}
   Signal: ${item.signal ?? item.signalScore}/10`;
}

export function renderSignal(item) {
  return `${item.rank}. ${item.title}
   🧠 ${oneLine(item.aiInsight)}
   Signal: ${item.signal ?? item.signalScore}/10`;
}

function oneLine(value) {
  const text = String(value || "No concise intelligence read available.").replace(/\s+/gu, " ").trim();
  const sentence = text.split(/(?<=[.!?])\s+/u).filter(Boolean).slice(0, 2).join(" ") || text;
  return sentence.length > 220 ? `${sentence.slice(0, 217).trim()}...` : sentence;
}
