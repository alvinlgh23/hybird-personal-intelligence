import { summarizeWithCodex } from "../ai/summarizer.js";

export async function buildEmailDigest(emails, { env }) {
  if (!emails.length) return "Daily Digest\n\nNo unread Gmail messages.";

  const compact = emails.slice(0, 10).map((email) => ({
    sender: email.sender,
    subject: email.subject,
    timestamp: email.timestamp,
    preview: email.preview,
  }));

  return summarizeWithCodex(
    [
      "Create a concise Gmail digest.",
      "Categorize messages into Important, Finance, University/Work, Action Needed, Promotions, and Noise.",
      "Only include categories with useful content.",
      "Use short bullets. Do not expose raw email tokens or secrets.",
      "Summarize previews only; do not reproduce sensitive full content.",
    ].join(" "),
    compact,
    { env, fallback: fallbackDigest(compact) },
  );
}

function fallbackDigest(emails) {
  return [
    "Daily Digest",
    "",
    "Unread:",
    ...emails.slice(0, 10).map((email) => `- ${email.subject} (${email.sender || "unknown sender"})`),
  ].join("\n");
}
