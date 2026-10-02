import { createHash } from 'node:crypto';

const TOKEN_PATTERNS = [
  /AKIA[0-9A-Z]{16}/g,
  /gh[pousr]_[A-Za-z0-9]{30,}/g,
  /github_pat_[A-Za-z0-9_]{30,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /npm_[A-Za-z0-9]{30,}/g,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

const ASSIGNMENT =
  /((?:token|secret|passw(?:or)?d|api[_-]?key|auth|credential)[A-Za-z0-9_]*\s*[=:]\s*)(["']?)([^\s"']{8,})\2/gi;

/** Short stable fingerprint so a *changed* secret still shows up as a change. */
/** @param {string} value */
function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 4);
}

/**
 * Mask anything that looks like a credential. Receipts are meant to be pasted
 * into issues and PRs, so they must never contain secret values.
 * @param {string} line
 */
export function redactLine(line) {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) return '[PRIVATE KEY]';
  if (/^[A-Za-z0-9+/=]{48,}$/.test(line.trim())) return `[REDACTED:${fingerprint(line)}]`;
  let out = line;
  for (const re of TOKEN_PATTERNS) {
    out = out.replace(re, (m) => `[REDACTED:${fingerprint(m)}]`);
  }
  out = out.replace(
    ASSIGNMENT,
    (_m, head, quote, value) => `${head}${quote}[REDACTED:${fingerprint(value)}]${quote}`,
  );
  return out;
}

/** @param {string} text */
export function redactText(text) {
  return text.split('\n').map(redactLine).join('\n');
}
