import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv() {
  const envPath = resolve(".env");
  const loaded = { ...process.env };
  if (!existsSync(envPath)) return loaded;

  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/gu, "");
    loaded[key] = value;
  }
  return loaded;
}
