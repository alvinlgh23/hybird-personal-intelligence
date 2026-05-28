import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { compactJson, safeJsonParse } from "../utils/safeJson.js";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const DEFAULT_TOKEN_PATH = ".tokens/gmail-token.json";

export async function getGmailAuthUrl({ env }) {
  const client = await createOAuthClient(env);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_READONLY_SCOPE],
  });
}

export async function saveGmailAuthCode(code, { env }) {
  const client = await createOAuthClient(env);
  const { tokens } = await client.getToken(extractCode(code));
  client.setCredentials(tokens);
  writeToken(tokens, env);
  return "Gmail connected with read-only access.";
}

export async function listUnreadEmails({ env, limit = 10 }) {
  const client = await authorizedClient(env);
  const { google } = await importGoogleApis();
  const gmail = google.gmail({ version: "v1", auth: client });

  const list = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
    maxResults: limit,
  });

  const messages = list.data.messages || [];
  const full = await Promise.all(
    messages.slice(0, limit).map(async (message) => {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers || [];
      return {
        id: message.id,
        sender: header(headers, "From"),
        subject: header(headers, "Subject") || "(no subject)",
        timestamp: header(headers, "Date"),
        preview: cleanPreview(detail.data.snippet || ""),
      };
    }),
  );

  return full;
}

export async function gmailStatus({ env }) {
  validateGmailEnv(env);
  return readToken(env) ? "Gmail is connected." : "Gmail is not connected. Run /gmail_auth first.";
}

export function exportGmailToken({ env }) {
  if (env.ALLOW_TOKEN_EXPORT !== "true") {
    return "Token export is disabled. Set ALLOW_TOKEN_EXPORT=true locally, restart, run /gmail_export_token, then turn it off again.";
  }
  const token = readToken(env);
  if (!token) return "No Gmail token found. Run /gmail_auth first.";
  return ["GOOGLE_OAUTH_TOKEN_JSON for Railway Variables:", "", compactJson(token), "", "Turn ALLOW_TOKEN_EXPORT=false after copying."].join("\n");
}

async function authorizedClient(env) {
  const client = await createOAuthClient(env);
  const token = readToken(env);
  if (!token) {
    throw new Error("Gmail is not connected. Run /gmail_auth first.");
  }
  client.setCredentials(token);
  client.on("tokens", (tokens) => {
    if (tokens.refresh_token || tokens.access_token) {
      writeToken({ ...client.credentials, ...tokens }, env);
    }
  });
  return client;
}

async function createOAuthClient(env) {
  validateGmailEnv(env);
  const { google } = await importGoogleApis();
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

async function importGoogleApis() {
  try {
    return await import("googleapis");
  } catch {
    throw new Error("Missing dependency: run npm install before using Gmail commands.");
  }
}

function validateGmailEnv(env) {
  const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"].filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing Gmail config: ${missing.join(", ")}`);
  }
}

function writeToken(tokens, env) {
  const path = tokenPath(env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function readToken(env) {
  const path = tokenPath(env);
  if (existsSync(path)) return safeJsonParse(readFileSync(path, "utf8"));
  if (env.GOOGLE_OAUTH_TOKEN_JSON) return safeJsonParse(env.GOOGLE_OAUTH_TOKEN_JSON);
  return null;
}

function tokenPath(env) {
  return resolve(env.GMAIL_TOKEN_PATH || DEFAULT_TOKEN_PATH);
}

function header(headers, name) {
  return headers.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function cleanPreview(value) {
  return value.replace(/\s+/gu, " ").trim().slice(0, 180);
}

function extractCode(value) {
  try {
    const parsed = new URL(value);
    return parsed.searchParams.get("code") || value;
  } catch {
    return value;
  }
}
