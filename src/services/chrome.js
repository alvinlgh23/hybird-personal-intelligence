import { execFile } from "node:child_process";
import { safeJsonParse } from "../utils/safeJson.js";
import { truncate } from "../utils/format.js";

export async function checkChrome({ env }) {
  const chromePluginRoot =
    env.CHROME_PLUGIN_ROOT || "/Users/alvinlim/.codex/plugins/cache/openai-bundled/chrome/0.1.7";

  const scripts = [
    ["scripts/chrome-is-running.js", "--check"],
    ["scripts/installed-browsers.js", "--check"],
    ["scripts/check-extension-installed.js", "--json"],
    ["scripts/check-native-host-manifest.js", "--json"],
  ];

  const results = [];
  for (const args of scripts) {
    results.push(await runNodeScript(args, chromePluginRoot));
  }

  const chromeRunning = results[0].ok;
  const browsersOk = results[1].ok;
  const extension = safeJsonParse(results[2].stdout);
  const nativeHost = safeJsonParse(results[3].stdout);

  const lines = [
    "Chrome/Codex status:",
    `Chrome running: ${chromeRunning ? "yes" : "no"}`,
    `Chrome installed: ${browsersOk ? "yes" : "check failed"}`,
    `Extension installed: ${extension?.installed ? "yes" : "no"}`,
    `Extension enabled: ${extension?.enabled ? "yes" : "no"}`,
    `Native host configured: ${nativeHost?.correct ? "yes" : "no"}`,
  ];

  const failures = results.filter((result) => !result.ok);
  if (failures.length) {
    lines.push("", "Details:");
    for (const failure of failures) {
      lines.push(`- ${failure.name}: ${failure.stderr || failure.stdout || `exit ${failure.code}`}`);
    }
  }

  if (extension?.extensionId) {
    lines.push("", `Extension ID: ${extension.extensionId}`);
  }

  return truncate(lines.join("\n"));
}

async function runNodeScript(args, cwd) {
  return new Promise((resolveResult) => {
    execFile("node", args, { cwd, timeout: 15000 }, (error, stdout, stderr) => {
      resolveResult({
        name: args.join(" "),
        ok: !error,
        code: error?.code ?? 0,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || error?.message || "").trim(),
      });
    });
  });
}
