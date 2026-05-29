import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_IGNORES = new Set([".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv"]);
const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".txt", ".env", ".yml", ".yaml", ".py", ".sh", ".css", ".html"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function createSafeCommandRegistry({ env = process.env, log = console } = {}) {
  const roots = approvedRoots(env);

  return {
    status: () => ({
      ok: true,
      version: env.npm_package_version || "local-agent",
      roots,
      tools: ["find", "sendfile", "searchcode", "repo", "logs", "recentfiles", "openproject"],
    }),
    find: ({ query, limit = 12 }) => findFiles({ roots, query, limit }),
    sendfile: ({ query }) => sendFile({ roots, query }),
    searchcode: ({ query, limit = 20 }) => searchCode({ roots, query, limit }),
    repo: ({ query = "" }) => repoStatus({ roots, query, log }),
    logs: ({ limit = 80 }) => recentLogs({ roots, limit }),
    recentfiles: ({ limit = 15 }) => recentFiles({ roots, limit }),
    openproject: ({ query, limit = 8 }) => findProjects({ roots, query, limit }),
  };
}

export function approvedRoots(env = process.env) {
  return String(env.LOCAL_AGENT_ROOTS || env.LOCAL_AGENT_ROOT || process.cwd())
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolve(item));
}

async function findFiles({ roots, query, limit }) {
  const needle = normalizeQuery(query);
  if (!needle) return { items: [] };
  const items = [];
  await walkRoots(roots, async (path, entry) => {
    if (items.length >= limit) return false;
    if (entry.name.toLowerCase().includes(needle)) items.push(fileSummary(path));
    return true;
  });
  return { items };
}

async function sendFile({ roots, query }) {
  const found = await findFiles({ roots, query, limit: 1 });
  const file = found.items[0];
  if (!file) return { error: "No matching file found." };
  const info = await stat(file.path);
  if (!info.isFile()) return { error: "Match is not a file." };
  if (info.size > MAX_FILE_BYTES) return { error: "File is too large to send safely.", path: file.path, size: info.size };
  const contentBase64 = (await readFile(file.path)).toString("base64");
  return { filename: basename(file.path), path: file.path, size: info.size, contentBase64, mimeType: mimeType(file.path) };
}

async function searchCode({ roots, query, limit }) {
  const needle = normalizeQuery(query);
  if (!needle) return { items: [] };
  const items = [];
  await walkRoots(roots, async (path, entry) => {
    if (items.length >= limit) return false;
    const info = await stat(path).catch(() => null);
    if (!info?.isFile() || info.size > 700_000 || !isTextFile(path)) return true;
    const text = await readFile(path, "utf8").catch(() => "");
    const lineIndex = text.toLowerCase().split("\n").findIndex((line) => line.includes(needle));
    if (lineIndex >= 0) {
      const lines = text.split("\n");
      items.push({ path, line: lineIndex + 1, preview: lines[lineIndex].trim().slice(0, 180) });
    }
    return true;
  });
  return { items };
}

async function repoStatus({ roots, query, log }) {
  const repos = await findProjects({ roots, query, limit: 1 });
  const repo = repos.items[0]?.path || roots[0];
  const cwd = await nearestRepo(repo, roots);
  const [branch, status, commits] = await Promise.all([
    git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"], log),
    git(cwd, ["status", "--short", "--branch"], log),
    git(cwd, ["log", "--oneline", "-5"], log),
  ]);
  return { repo: cwd, branch: branch.trim(), status: status.trim(), commits: commits.trim().split("\n").filter(Boolean) };
}

async function recentLogs({ roots, limit }) {
  const logs = [];
  await walkRoots(roots, async (path, entry) => {
    if (logs.length >= 8) return false;
    if (entry.isFile() && /\.(log|out|err)$/iu.test(entry.name)) logs.push(path);
    return true;
  }, { maxDepth: 5 });
  const blocks = [];
  for (const path of logs) {
    const text = await readFile(path, "utf8").catch(() => "");
    blocks.push({ path, lines: text.split("\n").slice(-limit).join("\n").trim().slice(-3000) });
  }
  return { items: blocks };
}

async function recentFiles({ roots, limit }) {
  const files = [];
  await walkRoots(roots, async (path, entry) => {
    const info = await stat(path).catch(() => null);
    if (info?.isFile()) files.push({ path, mtimeMs: info.mtimeMs, size: info.size });
    return files.length < 800;
  }, { maxDepth: 7 });
  return { items: files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit) };
}

async function findProjects({ roots, query = "", limit }) {
  const needle = normalizeQuery(query);
  const projects = [];
  await walkRoots(roots, async (path, entry) => {
    if (projects.length >= limit) return false;
    if (!entry.isDirectory()) return true;
    const nameMatch = !needle || entry.name.toLowerCase().includes(needle);
    const hasMarker = await stat(join(path, ".git")).then((s) => s.isDirectory()).catch(() => false) || await stat(join(path, "package.json")).then((s) => s.isFile()).catch(() => false);
    if (nameMatch && hasMarker) projects.push({ path, name: basename(path) });
    return true;
  }, { maxDepth: 5 });
  return { items: projects };
}

async function nearestRepo(path, roots) {
  let current = resolve(path);
  while (isInsideRoots(current, roots)) {
    if (await stat(join(current, ".git")).then((s) => s.isDirectory()).catch(() => false)) return current;
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return roots[0];
}

async function git(cwd, args, log) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: 7000, maxBuffer: 300_000 });
    return stdout;
  } catch (error) {
    log.error(`safe git failed: ${error.message}`);
    return "";
  }
}

async function walkRoots(roots, onEntry, options = {}) {
  for (const root of roots) await walk(root, onEntry, { depth: 0, maxDepth: options.maxDepth ?? 8, roots });
}

async function walk(dir, onEntry, state) {
  if (state.depth > state.maxDepth || !isInsideRoots(dir, state.roots)) return;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (DEFAULT_IGNORES.has(entry.name)) continue;
    const path = join(dir, entry.name);
    const keepGoing = await onEntry(path, entry);
    if (keepGoing === false) return;
    if (entry.isDirectory()) await walk(path, onEntry, { ...state, depth: state.depth + 1 });
  }
}

function isInsideRoots(path, roots) {
  const real = resolve(path);
  return roots.some((root) => real === root || real.startsWith(`${root}/`));
}

function normalizeQuery(query) {
  return String(query || "").trim().toLowerCase().slice(0, 120);
}

function fileSummary(path) {
  return { path, name: basename(path) };
}

function isTextFile(path) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase()) || basename(path).startsWith(".env");
}

function mimeType(path) {
  if (extname(path).toLowerCase() === ".pdf") return "application/pdf";
  if (isTextFile(path)) return "text/plain";
  return "application/octet-stream";
}
