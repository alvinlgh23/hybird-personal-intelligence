export function truncate(text) {
  const limit = 3900;
  return text.length > limit ? `${text.slice(0, limit - 40)}\n\n[truncated]` : text;
}

export function commandOf(text) {
  return (text.trim().split(/\s+/u)[0] || "").replace(/@\w+$/u, "");
}

export function formatPrice(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `$${formatValue(value)}`;
}

export function formatValue(value) {
  if (!Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function formatPct(value) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
