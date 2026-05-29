export function logAction({ actor = "unknown", action, detail = "", ok = true, log = console } = {}) {
  const cleanDetail = String(detail || "").replace(/\s+/gu, " ").slice(0, 220);
  log.log(`ActionLog actor=${actor} action=${action || "unknown"} ok=${ok ? "true" : "false"} detail="${cleanDetail}"`);
}
