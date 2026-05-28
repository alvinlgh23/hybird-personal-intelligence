export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function compactJson(value) {
  return JSON.stringify(value);
}
