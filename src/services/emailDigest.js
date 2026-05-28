import { generateDigest } from "../ai/router.js";

const CATEGORIES = [
  "Immediate Attention",
  "Important / Strategic",
  "Security",
  "Infrastructure / Deployment",
  "Finance / Banking",
  "Personal",
  "Promotions / Noise",
  "Ignore",
];

export async function buildEmailDigest(emails, { env }) {
  if (!emails.length) return "Inbox Intelligence\n\nNo unread Gmail messages.";

  const compact = emails.slice(0, 20).map((email) => ({
    sender: email.sender,
    subject: email.subject,
    timestamp: email.timestamp,
    preview: email.preview,
  }));

  const prompt = [
    "Create an AI inbox intelligence triage for Telegram.",
    "Use only the provided Gmail metadata/snippets. Never invent email contents. If confidence is low, say so.",
    "Categorize emails into: Immediate Attention, Important / Strategic, Security, Infrastructure / Deployment, Finance / Banking, Personal, Promotions / Noise, Ignore.",
    "For important emails summarize: what happened, why it matters, whether action is needed, urgency level HIGH/MEDIUM/LOW/IGNORE, and likely context.",
    "Compress low-signal promotions/newsletters/discounts/marketing/spam-like items under 'Suppressed low-signal emails' instead of listing each one.",
    "Prioritize deployment failures, build failures, security alerts, banking, investment, university/admin, and account issues.",
    "Add 'AI observations / pattern detection' and 'Suggested next actions'.",
    "Keep concise, section-based, and mobile-readable.",
    "",
    "Input:",
    JSON.stringify(compact, null, 2),
  ].join("\n");

  return generateDigest(prompt, { env, fallback: fallbackInboxIntelligence(compact), maxOutputTokens: 1800 });
}

function fallbackInboxIntelligence(emails) {
  const classified = emails.map(classifyEmail);
  const important = classified.filter((item) => !["Promotions / Noise", "Ignore"].includes(item.category));
  const suppressed = classified.filter((item) => ["Promotions / Noise", "Ignore"].includes(item.category));

  return [
    "Inbox Intelligence",
    "",
    ...CATEGORIES.map((category) => formatCategory(category, important.filter((item) => item.category === category))).filter(Boolean),
    suppressed.length ? `Suppressed low-signal emails\n${suppressed.length} promotional/noise emails suppressed.` : "",
    "",
    "AI observations / pattern detection",
    observations(classified),
    "",
    "Suggested next actions",
    suggestedActions(classified),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatCategory(category, items) {
  if (!items.length) return "";
  return [
    category,
    ...items.slice(0, 5).map((item) =>
      [
        `- ${item.subject}`,
        `  From: ${item.sender || "unknown"}`,
        `  Priority: ${item.priority}`,
        `  What happened: ${item.summary}`,
        `  Why it matters: ${item.why}`,
        `  Action needed: ${item.action}`,
        `  Likely context: ${item.context}`,
      ].join("\n"),
    ),
  ].join("\n");
}

function classifyEmail(email) {
  const text = `${email.sender || ""} ${email.subject || ""} ${email.preview || ""}`.toLowerCase();
  if (/(failed|failure|error|incident|downtime|deploy|deployment|build|railway|github actions|vercel|server|database|api)/u.test(text)) {
    return enrich(email, "Infrastructure / Deployment", "HIGH", "An infrastructure or deployment-related issue may need attention.", "Could affect uptime, releases, or production reliability.", "Check logs/status and confirm whether a fix or rollback is needed.", "Deployment or operations workflow.");
  }
  if (/(security|sign-in|signin|login|password|2fa|oauth|verification|alert|suspicious)/u.test(text)) {
    return enrich(email, "Security", "HIGH", "A security or account-access alert was received.", "Account integrity and OAuth setup should be verified quickly.", "Confirm whether the activity was expected.", "Account security / authentication.");
  }
  if (/(bank|card|payment|invoice|statement|wire|transfer|brokerage|investment|portfolio|tax|finance)/u.test(text)) {
    return enrich(email, "Finance / Banking", "MEDIUM", "A financial or banking-related message arrived.", "Could involve payments, accounts, investments, or administrative finance.", "Review the message and verify any required action.", "Finance / account administration.");
  }
  if (/(university|college|course|registrar|admin|deadline|application|tuition|student)/u.test(text)) {
    return enrich(email, "Immediate Attention", "MEDIUM", "A university/admin message may involve a deadline or required response.", "Administrative deadlines can become costly if missed.", "Review for due dates or forms.", "University/admin workflow.");
  }
  if (/(meeting|invitation|family|friend|personal|appointment)/u.test(text)) {
    return enrich(email, "Personal", "LOW", "A personal or scheduling message arrived.", "May affect calendar or personal follow-up.", "Review when convenient.", "Personal coordination.");
  }
  if (/(sale|discount|promo|newsletter|unsubscribe|deal|offer|marketing|webinar|digest)/u.test(text)) {
    return enrich(email, "Promotions / Noise", "IGNORE", "Low-signal promotional or newsletter email.", "Unlikely to require attention.", "No action needed unless expected.", "Marketing/newsletter.");
  }
  return enrich(email, "Important / Strategic", "LOW", "Unread email may be relevant but confidence is limited from snippet only.", "Could be useful depending on sender/context.", "Skim subject and sender.", "General inbox item.");
}

function enrich(email, category, priority, summary, why, action, context) {
  return {
    ...email,
    category,
    priority,
    summary,
    why,
    action,
    context,
  };
}

function observations(items) {
  const infra = items.filter((item) => item.category === "Infrastructure / Deployment").length;
  const security = items.filter((item) => item.category === "Security").length;
  const finance = items.filter((item) => item.category === "Finance / Banking").length;
  const noise = items.filter((item) => ["Promotions / Noise", "Ignore"].includes(item.category)).length;
  const lines = [];
  if (infra) lines.push(`Deployment/infrastructure appears to be the highest operational risk (${infra} item${infra > 1 ? "s" : ""}).`);
  if (security) lines.push(`Security/account activity needs verification (${security} alert${security > 1 ? "s" : ""}).`);
  if (finance) lines.push(`Finance/banking items are present and should be reviewed for required action.`);
  if (noise) lines.push(`${noise} low-signal emails were suppressed to protect attention.`);
  return lines.length ? lines.join("\n") : "No strong pattern detected from unread snippets. Confidence is limited.";
}

function suggestedActions(items) {
  const high = items.filter((item) => item.priority === "HIGH");
  if (high.length) return high.slice(0, 3).map((item) => `- Check: ${item.subject}`).join("\n");
  const medium = items.filter((item) => item.priority === "MEDIUM");
  if (medium.length) return medium.slice(0, 3).map((item) => `- Review: ${item.subject}`).join("\n");
  return "- No urgent action detected. Skim LOW priority items when convenient.";
}
