import { compactJson } from "../utils/safeJson.js";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

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
  console.log(`GMAIL_TOKEN_JSON=${compactJson(tokens)}`);
  return [
    "Gmail connected with read-only access.",
    "",
    "Add this variable to Railway so Gmail survives restarts/redeploys:",
    "",
    "GMAIL_TOKEN_JSON=",
    compactJson(tokens),
    "",
    "Then redeploy Railway.",
  ].join("\n");
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
  const { token, source, error } = loadGmailToken(env);
  if (error) return error;
  if (!token) return missingTokenMessage(env);
  return source === "env" ? "Gmail is connected from GMAIL_TOKEN_JSON." : "Gmail is connected.";
}

export function exportGmailToken({ env }) {
  if (env.ALLOW_TOKEN_EXPORT !== "true") {
    return "Token export is disabled. Set ALLOW_TOKEN_EXPORT=true locally, restart, run /gmail_export_token, then turn it off again.";
  }
  const { token, error } = loadGmailToken(env);
  if (error) return error;
  if (!token) return "No Gmail token found. Run /gmail_auth first, then copy GMAIL_TOKEN_JSON into Railway Variables.";
  return ["GMAIL_TOKEN_JSON for Railway Variables:", "", compactJson(token), "", "Turn ALLOW_TOKEN_EXPORT=false after copying."].join("\n");
}

async function authorizedClient(env) {
  const client = await createOAuthClient(env);
  const { token, error } = loadGmailToken(env);
  if (error) {
    throw new Error(error);
  }
  if (!token) {
    throw new Error(missingTokenMessage(env));
  }
  client.setCredentials(token);
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

function loadGmailToken(env) {
  const raw = env.GMAIL_TOKEN_JSON || process.env.GMAIL_TOKEN_JSON;
  const parsed = parseGoogleOAuthToken(raw);
  if (raw && parsed.error) {
    console.log("Gmail disabled: invalid GMAIL_TOKEN_JSON.");
    return { token: null, source: "none", error: parsed.error };
  }
  const envToken = parsed.token;
  if (envToken) {
    console.log("Gmail auth loaded from GMAIL_TOKEN_JSON.");
    return { token: envToken, source: "env" };
  }

  console.log("Gmail disabled.");
  return { token: null, source: "none", error: "" };
}

export function parseGoogleOAuthToken(value) {
  if (!value) return { token: null, error: "" };
  let parsed;
  try {
    parsed = JSON.parse(String(value).trim());
  } catch {
    return { token: null, error: "Invalid GMAIL_TOKEN_JSON: value must be valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") return { token: null, error: "Invalid GMAIL_TOKEN_JSON: value must be valid JSON." };
  if (!parsed.refresh_token && !parsed.access_token) return { token: null, error: "Invalid GMAIL_TOKEN_JSON: token JSON must include refresh_token or access_token." };
  return { token: parsed, error: "" };
}

function missingTokenMessage(env) {
  if ((env.AGENT_MODE || "local") === "cloud") {
    return "Gmail not connected in cloud. Run /gmail_auth or configure GMAIL_TOKEN_JSON.";
  }
  return "Gmail is not connected. Run /gmail_auth first, then set GMAIL_TOKEN_JSON.";
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
