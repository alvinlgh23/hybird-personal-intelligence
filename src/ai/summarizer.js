import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSummary } from "./router.js";
import { truncate } from "../utils/format.js";

const MAX_PROMPT_CHARS = 12000;

export async function summarizeWithCodex(instructions, data, { env, fallback = "Summary unavailable." }) {
  const prompt = [
    instructions,
    "",
    "Constraints:",
    "- Do not edit files.",
    "- Do not write files.",
    "- Do not run shell commands.",
    "- Do not use tools.",
    "- Keep the response concise and optimized for Telegram.",
    "",
    "Input:",
    safePrompt(JSON.stringify(data, null, 2)),
  ].join("\n");

  try {
    return await generateSummary(prompt, { env, fallback });
  } catch {
    return fallback;
  }
}

export async function runCodex(prompt, { env }) {
  const outputDir = mkdtempSync(join(tmpdir(), "personal-intel-codex-"));
  const outputPath = join(outputDir, "last-message.txt");
  const codexWorkspace = env.CODEX_WORKSPACE || process.cwd();
  const codexTimeoutMs = Number(env.CODEX_TIMEOUT_MS || 120000);

  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--sandbox",
        "read-only",
        "--output-last-message",
        outputPath,
        "--cd",
        codexWorkspace,
        "-",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), codexTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      cleanup(outputDir);
      rejectResult(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      const finalMessage = existsSync(outputPath) ? readFileSync(outputPath, "utf8").trim() : "";
      const body = finalMessage || stdout.trim() || stderr.trim() || `Codex exited with code ${code ?? signal}.`;
      cleanup(outputDir);
      resolveResult(truncate(body));
    });
    child.stdin.end(safePrompt(prompt));
  });
}

function safePrompt(prompt) {
  return prompt.length > MAX_PROMPT_CHARS ? `${prompt.slice(0, MAX_PROMPT_CHARS)}\n[truncated]` : prompt;
}

function cleanup(path) {
  rmSync(path, { recursive: true, force: true });
}
