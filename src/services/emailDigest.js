import { generateDigest } from "../ai/router.js";

export async function buildEmailDigest(emails, { env }) {
  if (!emails.length) return "Daily Digest\n\nNo unread Gmail messages.";

  const compact = emails.slice(0, 10).map((email) => ({
    sender: email.sender,
    subject: email.subject,
    timestamp: email.timestamp,
    preview: email.preview,
  }));

  const prompt = [
    "Create a concise Gmail digest.",
    "Categorize messages into Important, Finance, University/Work, Action Needed, Promotions, and Noise.",
    "Only include categories with useful content.",
    "Use short bullets with concrete action cues.",
    "Do not expose raw email tokens or secrets.",
    "Summarize previews only; do not reproduce sensitive full content.",
    "",
    "Input:",
    JSON.stringify(compact, null, 2),
  ].join("\n");

  return generateDigest(prompt, { env, fallback: fallbackDigest(compact), maxOutputTokens: 1400 });
}

function fallbackDigest(emails) {
  return [
    "Daily Digest",
    "",
    "Unread:",
    ...emails.slice(0, 10).map((email) => `- ${email.subject} (${email.sender || "unknown sender"})`),
  ].join("\n");
}
