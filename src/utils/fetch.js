export async function safeFetchJson(url, options = {}) {
  const text = await safeFetchText(url, options);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function safeFetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "telegram-market-intel-agent/0.4",
        ...options.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
