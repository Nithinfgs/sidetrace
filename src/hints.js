/**
 * @typedef {object} Hint
 * @property {string} text
 * @property {import('./levels.js').Severity} severity
 */

/**
 * Pattern checks on lines a command *added*. These explain why a change
 * matters; they never decide whether something is malicious.
 * @param {string} label  display path, used to pick file-specific rules
 * @param {string[]} addedLines
 * @returns {Hint[]}
 */
export function hintsForAddedLines(label, addedLines) {
  /** @type {Hint[]} */
  const hints = [];
  const push = (/** @type {string} */ text, /** @type {import('./levels.js').Severity} */ severity) => {
    if (!hints.some((h) => h.text === text)) hints.push({ text, severity });
  };
  const base = label.split('/').pop() ?? label;

  for (const raw of addedLines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/.test(line)) {
      push('pipes a download straight into a shell', 'high');
    }
    if (/\balias\s+(sudo|ssh|git|cd|ls|rm|curl|npm|node|python3?)=/.test(line)) {
      push('shadows a core command with an alias', 'high');
    }
    if (/\b(export\s+)?PATH=/.test(line)) push('changes PATH', 'medium');
    if (/\beval\b.*\$\(/.test(line)) push('evals generated shell code on every shell start', 'medium');
    if (base === 'authorized_keys' && /^(ssh-|ecdsa-|sk-)/.test(line)) {
      push('adds an SSH login key', 'high');
    }
    if (/hooksPath|insteadOf|^\s*\w+\s*=\s*!/.test(line)) push('git config that can run code or redirect remotes', 'high');
    if (/"hooks"\s*:|"mcpServers"\s*:|"command"\s*:|^\s*\[mcp_servers/.test(line)) {
      push('agent config that can run commands on tool use', 'high');
    }
    if (/RunAtLoad|KeepAlive|ProgramArguments/.test(line)) push('starts automatically at login', 'medium');
    if (/^\s*(ExecStart|WantedBy)\s*=/.test(line)) push('starts automatically at login', 'medium');
    if (/\bnpm_config_|registry\s*=|_authToken/.test(line)) push('changes package registry or auth', 'high');
    if (/^\s*\d+\.\d+\.\d+\.\d+\s+\S+/.test(line) && base === 'hosts') push('redirects a hostname', 'medium');
  }
  return hints;
}
