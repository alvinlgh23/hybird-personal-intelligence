import { buildEmailDigest } from "../services/emailDigest.js";
import { exportGmailToken, getGmailAuthUrl, gmailStatus, listUnreadEmails, saveGmailAuthCode } from "../services/gmail.js";
import { buildDeepBrief, buildMorningDigest } from "../services/morning.js";

export async function handleGmailCommand(text, { env, context }) {
  if (text.startsWith("/gmail_status")) {
    return gmailStatus({ env });
  }

  if (text.startsWith("/gmail_reconnect")) {
    const url = await getGmailAuthUrl({ env });
    return [
      "Gmail reconnect link:",
      "",
      url,
      "",
      "After approving read-only access, send:",
      "/gmail_code <code-or-full-url>",
      "",
      "In Railway cloud mode, /gmail_code will return GOOGLE_OAUTH_TOKEN_JSON for Railway Variables.",
    ].join("\n");
  }

  if (text.startsWith("/gmail_auth")) {
    const url = await getGmailAuthUrl({ env });
    return ["Gmail OAuth link:", "", url, "", "After approving access, send:", "/gmail_code <code-or-full-url>"].join("\n");
  }

  if (text.startsWith("/gmail_code")) {
    const code = text.replace(/^\/gmail_code(@\w+)?\s*/u, "").trim();
    if (!code) return "Usage: /gmail_code <code-or-full-url>";
    return saveGmailAuthCode(code, { env });
  }

  if (text.startsWith("/gmail_export_token")) {
    if (!isOwner(context.userId, env)) return "Gmail token export is owner-only.";
    return exportGmailToken({ env });
  }

  if (text.startsWith("/gmail")) {
    await context.loading("Reading unread Gmail messages...");
    return formatUnreadEmails(await listUnreadEmails({ env, limit: 10 }));
  }

  if (text.startsWith("/digest")) {
    await context.loading("Building Gmail digest...");
    return buildEmailDigest(await listUnreadEmails({ env, limit: 10 }), { env });
  }

  if (text.startsWith("/morning")) {
    await context.loading("Building your morning dashboard...");
    return buildMorningDigest({ env });
  }

  if (text.startsWith("/deepbrief")) {
    await context.loading("Building institutional deep brief...");
    return buildDeepBrief({ env });
  }

  return null;
}

function isOwner(userId, env) {
  const owner = (env.TELEGRAM_ALLOWED_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)[0];
  return owner ? String(userId) === owner : true;
}

function formatUnreadEmails(emails) {
  if (!emails.length) return "Gmail\n\nNo unread messages.";
  return [
    "Unread Gmail",
    "",
    ...emails.map((email, index) =>
      [`${index + 1}. ${email.subject}`, `From: ${email.sender || "unknown sender"}`, email.timestamp ? `Time: ${email.timestamp}` : "", email.preview ? `Preview: ${email.preview}` : ""]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n\n");
}
