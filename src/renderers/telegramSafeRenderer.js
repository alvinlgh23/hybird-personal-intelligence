export function renderTelegramSafeText(value) {
  return stripMarkdownSyntax(String(value || ""))
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{4,}/gu, "\n\n")
    .trim();
}

export function renderTelegramPlainFallback(value) {
  return renderTelegramSafeText(value)
    .replace(/[\\*_`[\]()~>#+\-=|{}.!]/gu, "")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

function stripMarkdownSyntax(value) {
  return value
    .replace(/\*\*([^*\n]+)\*\*/gu, "$1")
    .replace(/__([^_\n]+)__/gu, "$1")
    .replace(/\*([^*\n]+)\*/gu, "$1")
    .replace(/_([^_\n]+)_/gu, "$1")
    .replace(/`([^`\n]+)`/gu, "$1")
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/gu, "$1 ($2)");
}
