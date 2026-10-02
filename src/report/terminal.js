/**
 * @typedef {object} Report
 * @property {string} command      display string, or '(manual session)'
 * @property {number | null} exitCode
 * @property {number} durationMs
 * @property {import('../diff.js').Finding[]} findings
 * @property {{ high: number, medium: number, low: number, info: number }} counts
 * @property {string[]} warnings
 */

const SEVERITY_STYLE = {
  high: { label: 'HIGH', color: '31', mark: '▲' },
  medium: { label: 'MEDIUM', color: '33', mark: '●' },
  low: { label: 'LOW', color: '36', mark: '○' },
  info: { label: 'INFO', color: '90', mark: '·' },
};
const ACTION_MARK = { added: '+', modified: '~', removed: '-', running: '!', listening: '!', info: '·' };
const MAX_WIDTH = 108;
const MAX_DIFF_LINES = 4;

/** @param {boolean} on */
function painter(on) {
  return (/** @type {string} */ code, /** @type {string} */ s) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
}

/** @param {string} s */
function clip(s) {
  return s.length > MAX_WIDTH ? s.slice(0, MAX_WIDTH - 1) + '…' : s;
}

/**
 * @param {Report} report
 * @param {{ color?: boolean }} [opts]
 */
export function renderTerminal(report, opts = {}) {
  const c = painter(Boolean(opts.color));
  const out = [];
  const secs = (report.durationMs / 1000).toFixed(1);
  const exit = report.exitCode === null ? '' : ` · exit ${report.exitCode}`;
  out.push('');
  out.push(` ${c('1', 'sidetrace receipt')} ${c('90', '·')} ${clip(report.command)}${c('90', `${exit} · ${secs}s`)}`);
  out.push('');

  if (report.findings.length === 0) {
    out.push(` ${c('32', '✓')} Nothing changed in the places sidetrace watches.`);
  }

  for (const sev of /** @type {const} */ (['high', 'medium', 'low', 'info'])) {
    const group = report.findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    const style = SEVERITY_STYLE[sev];
    out.push(` ${c(`1;${style.color}`, `${style.mark} ${style.label}`)} ${c('90', String(group.length))}`);
    for (const f of group) {
      const mark = ACTION_MARK[f.action];
      out.push(`   ${c(style.color, mark)} ${c('1', clip(f.title))}${['info', 'running', 'listening'].includes(f.action) ? '' : c('90', `  ${f.action}`)}`);
      for (const l of f.lines?.removed ?? []) out.push(`       ${c('31', clip('- ' + l))}`);
      const added = f.lines?.added ?? [];
      for (const l of added.slice(0, MAX_DIFF_LINES)) out.push(`       ${c('32', clip('+ ' + l))}`);
      if (added.length > MAX_DIFF_LINES) out.push(`       ${c('90', `  … ${added.length - MAX_DIFF_LINES} more lines`)}`);
      for (const n of f.notes) {
        const marker = f.action === 'info' ? ' ' : '!';
        out.push(`       ${c(style.color, marker)} ${c('90', clip(n))}`);
      }
    }
    out.push('');
  }

  const { high, medium, low } = report.counts;
  out.push(` ${c('90', `${high} high · ${medium} medium · ${low} low`)}`);
  for (const w of report.warnings) out.push(` ${c('33', 'note:')} ${c('90', w)}`);
  out.push(` ${c('90', 'sidetrace reports changes. It is not a sandbox and cannot see everything.')}`);
  out.push('');
  return out.join('\n');
}
