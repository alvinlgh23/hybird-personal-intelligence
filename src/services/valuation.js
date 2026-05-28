import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { summarizeValuationAnalysis } from "../ai/marketSummarizer.js";
import { formatPct, formatPrice } from "../utils/format.js";
import { safeJsonParse } from "../utils/safeJson.js";
import { getTickerEarnings } from "./earnings.js";
import { fetchYahooQuote, getMarketSnapshot } from "./marketData.js";
import { getCompanyHeadlines } from "./news.js";

const TICKER_RE = /^[A-Z.-]{1,10}$/u;

export function normalizeTickerInput(value) {
  const ticker = String(value || "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) {
    throw new Error("Invalid ticker. Use A-Z letters, dot, or hyphen, max 10 chars. Example: BRK.B.");
  }
  return ticker;
}

export async function runValuation(ticker, { env, mode = "value" }) {
  const symbol = normalizeTickerInput(ticker);
  const setup = valuationSetup(env);
  if (!setup.ok) return { ok: false, ticker: symbol, mode, message: setup.message };

  const result = await runPythonModel({
    pythonBin: setup.pythonBin,
    runnerPath: setup.runnerPath,
    modelPath: setup.modelPath,
    ticker: symbol,
    mode,
    timeoutMs: setup.timeoutMs,
  });

  return {
    ok: result.ok,
    ticker: symbol,
    mode,
    stdout: result.stdout,
    stderr: result.stderr,
    data: safeJsonParse(result.stdout),
    message: result.ok ? "" : shortError(result.stderr || result.stdout),
  };
}

export async function analyzeTicker(ticker, { env }) {
  const symbol = normalizeTickerInput(ticker);
  const [quote, headlines, earnings, macro, full] = await Promise.all([
    fetchYahooQuote(symbol, symbol),
    getCompanyHeadlines(symbol, { env, limit: 3 }),
    getTickerEarnings(symbol),
    getMarketSnapshot(),
    runValuation(symbol, { env, mode: "full" }),
  ]);

  return summarizeValuationAnalysis(symbol, full, quote, headlines, earnings, macro, { env });
}

export function formatValuationResult(result) {
  if (!result.ok) return result.message;
  const data = result.data;
  if (!data) return [`${result.ticker} Valuation`, "", trimOutput(result.stdout), "", "Possible interpretation only. Not financial advice."].join("\n");
  const payload = data.data || data;

  return [
    `${result.ticker} Valuation`,
    "",
    data.summary ? `Summary: ${data.summary}` : "",
    `Current price: ${formatMaybePrice(payload.current_price)}`,
    `Fair value: ${formatMaybePrice(payload.fair_value_estimate || payload.fair_value)}`,
    `Upside/downside: ${formatPct(Number(payload.upside_downside_pct))}`,
    payload.valuation_range ? `Range: ${payload.valuation_range}` : "",
    payload.assumptions ? `Assumptions: ${payload.assumptions}` : "",
    formatWarnings(data.warnings),
    "",
    "Read: valuation output suggests a possible range, not a trade instruction.",
    "Not financial advice.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatChaseResult(result) {
  if (!result.ok) return result.message;
  const data = result.data;
  if (!data) return [`${result.ticker} Chase Risk`, "", trimOutput(result.stdout), "", "Not financial advice."].join("\n");
  const payload = data.data || data;

  return [
    `${result.ticker} Chase Risk`,
    "",
    data.summary ? `Summary: ${data.summary}` : "",
    `Momentum: ${formatPct(Number(payload.momentum_3m_pct ?? payload.momentum_pct))}`,
    `Valuation heat: ${payload.valuation_heat || "n/a"}`,
    `Price vs 200MA: ${formatPct(Number(payload.price_vs_200ma_pct))}`,
    `Warning level: ${payload.warning_level || "n/a"}`,
    `FOMO/chase risk: ${payload.fomo_chase_risk === true ? "yes" : payload.fomo_chase_risk === false ? "no" : "n/a"}`,
    formatWarnings(data.warnings),
    "",
    "Possible interpretation only. Not financial advice.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function valuationAvailable(env) {
  return valuationSetup(env).ok;
}

function valuationSetup(env) {
  const runnerMode = env.MODEL_RUNNER_MODE || "disabled";
  if (runnerMode === "disabled") {
    return {
      ok: false,
      message: [
        "Valuation model runner is disabled.",
        "Set MODEL_RUNNER_MODE=local on your Mac or MODEL_RUNNER_MODE=cloud on Railway.",
        "Set VALUATION_MODEL_PATH=models/valuation/runner.py.",
      ].join("\n"),
    };
  }

  const agentMode = env.AGENT_MODE || "local";
  if (agentMode === "cloud" && runnerMode !== "cloud") {
    return { ok: false, message: "Valuation model is disabled in cloud. Set MODEL_RUNNER_MODE=cloud and deploy models/valuation/runner.py." };
  }
  if (agentMode === "local" && runnerMode !== "local" && runnerMode !== "cloud") {
    return { ok: false, message: "Valuation model is disabled locally. Set MODEL_RUNNER_MODE=local." };
  }

  const configuredPath = resolve(env.VALUATION_MODEL_PATH || "models/valuation/runner.py");
  if (!existsSync(configuredPath)) {
    return { ok: false, message: "Valuation model not found. Set VALUATION_MODEL_PATH or add models/valuation/model.py." };
  }

  const isRunner = configuredPath.endsWith("runner.py");
  const runnerPath = isRunner ? configuredPath : join(dirname(configuredPath), "runner.py");
  const modelPath = isRunner ? join(dirname(configuredPath), "model.py") : configuredPath;
  if (!existsSync(runnerPath)) {
    return { ok: false, message: "Valuation runner not found. Add models/valuation/runner.py." };
  }
  if (!existsSync(modelPath)) {
    return { ok: false, message: "Valuation model not found. Set VALUATION_MODEL_PATH or add models/valuation/model.py." };
  }

  return {
    ok: true,
    modelPath,
    runnerPath,
    pythonBin: env.PYTHON_BIN || "python3",
    timeoutMs: Number(env.VALUATION_TIMEOUT_MS || 30000),
  };
}

function runPythonModel({ pythonBin, runnerPath, modelPath, ticker, mode, timeoutMs }) {
  const args = [runnerPath, "--ticker", ticker, "--mode", mode, "--model", modelPath, "--timeout", String(Math.ceil(timeoutMs / 1000))];

  return new Promise((resolveResult) => {
    const child = spawn(pythonBin, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolveResult({ ok: false, stdout: "", stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolveResult({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function formatMaybePrice(value) {
  const number = Number(value);
  return Number.isFinite(number) ? formatPrice(number) : "n/a";
}

function trimOutput(value) {
  return value.length > 2400 ? `${value.slice(0, 2400)}\n[truncated]` : value;
}

function shortError(value) {
  const clean = String(value || "Valuation model failed.").split(/\r?\n/u)[0];
  return clean.length > 240 ? `${clean.slice(0, 240)}...` : clean;
}

function formatWarnings(warnings) {
  return Array.isArray(warnings) && warnings.length ? `Warnings: ${warnings.slice(0, 2).join("; ")}` : "";
}
