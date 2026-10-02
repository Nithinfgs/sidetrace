import { isExposed } from './collectors/system.js';
import { hintsForAddedLines } from './hints.js';
import { downgrade, maxSeverity, RANK } from './levels.js';
import { lineDiff } from './linediff.js';
import { isExecSurface } from './collectors/project.js';

/**
 * @typedef {import('./levels.js').Severity} Severity
 * @typedef {object} Finding
 * @property {Severity} severity
 * @property {string} category
 * @property {'added' | 'modified' | 'removed' | 'running' | 'listening' | 'info'} action
 * @property {string} title
 * @property {{ added: string[], removed: string[] }} [lines]
 * @property {string[]} notes
 */

const MAX_LINES = 40;

/** @param {string} abs @param {string} home */
export function tildify(abs, home) {
  return abs === home ? '~' : abs.startsWith(home + '/') ? '~' + abs.slice(home.length) : abs;
}

/** Drop the directory of the executable and cap the length. */
export function shortCommand(/** @type {string} */ command) {
  const out = command.replace(/^\S*\//, '');
  return out.length > 56 ? out.slice(0, 55) + '…' : out;
}

/** @param {string | undefined} text */
function nonEmptyLines(text) {
  return (text ?? '').split('\n').filter((l) => l.trim() !== '');
}

/**
 * @param {import('./collectors/files.js').FileEntry | undefined} a
 * @param {import('./collectors/files.js').FileEntry | undefined} b
 */
function fileChanged(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return true;
  if (a.type === 'dir') return false;
  if (a.type === 'symlink') return a.link !== b.link;
  if (a.mode !== b.mode) return true;
  if (a.hash && b.hash) return a.hash !== b.hash;
  return a.size !== b.size || a.mtimeMs !== b.mtimeMs;
}

/**
 * @param {import('./snapshot.js').Snapshot} before
 * @param {import('./snapshot.js').Snapshot} after
 * @returns {Finding[]}
 */
function diffFiles(before, after) {
  const home = after.home;
  /** @type {Finding[]} */
  const out = [];
  const paths = new Set([...Object.keys(before.files), ...Object.keys(after.files)]);
  /** @type {string[]} */
  const dirsAdded = [];

  for (const p of [...paths].sort()) {
    const a = before.files[p];
    const b = after.files[p];
    const label = tildify(p, home);
    const meta = b ?? a;

    if (!a && b) {
      if (b.type === 'dir') {
        dirsAdded.push(p);
        continue;
      }
      const lines = b.text !== undefined ? { added: nonEmptyLines(b.text), removed: [] } : undefined;
      const hints = lines ? hintsForAddedLines(label, lines.added) : [];
      const notes = hints.map((h) => h.text);
      if (b.secret) notes.push('contents hidden');
      if (b.type === 'symlink' && b.link) notes.push(`symlink to ${b.link}`);
      if (b.type === 'file' && b.mode & 0o111) notes.push('executable');
      const sev = hints.reduce((s, h) => maxSeverity(s, h.severity), meta.severity);
      out.push({ severity: sev, category: meta.category, action: 'added', title: label, lines, notes });
    } else if (a && !b) {
      if (a.type === 'dir') continue;
      const sev = a.secret && a.severity === 'high' ? 'medium' : downgrade(a.severity);
      out.push({ severity: sev, category: a.category, action: 'removed', title: label, notes: a.secret ? ['contents hidden'] : [] });
    } else if (a && b && fileChanged(a, b)) {
      const notes = [];
      /** @type {Finding['lines']} */
      let lines;
      let sev = b.severity;
      if (a.type !== b.type) notes.push(`changed from ${a.type} to ${b.type}`);
      else if (b.type === 'symlink') notes.push(`symlink now points to ${b.link}`);
      else if (b.secret) notes.push('contents changed (hidden)');
      else if (a.text !== undefined && b.text !== undefined) {
        lines = lineDiff(a.text, b.text);
        lines = { added: lines.added.filter((l) => l.trim()), removed: lines.removed.filter((l) => l.trim()) };
        for (const h of hintsForAddedLines(label, lines.added)) {
          notes.push(h.text);
          sev = maxSeverity(sev, h.severity);
        }
      } else notes.push('contents changed');
      if (a.mode !== b.mode) {
        notes.push(`mode ${a.mode.toString(8)} -> ${b.mode.toString(8)}`);
        if (!(a.mode & 0o111) && b.mode & 0o111) notes.push('became executable');
      }
      if (lines && lines.added.length === 0 && lines.removed.length === 0 && a.mode === b.mode) continue;
      out.push({ severity: sev, category: b.category, action: 'modified', title: label, lines, notes });
    }
  }

  // A new directory is only worth its own line when nothing inside it was reported.
  for (const d of dirsAdded) {
    const covered = out.some((f) => f.title.startsWith(tildify(d, home) + '/'));
    if (!covered) {
      const meta = after.files[d];
      out.push({ severity: meta.severity, category: meta.category, action: 'added', title: tildify(d, home) + '/', notes: ['new directory'] });
    }
  }
  return out;
}

/** @param {string} rel @returns {Severity} */
function surfaceSeverity(rel) {
  if (/^\.git\/hooks\//.test(rel) || /^\.husky\//.test(rel)) return 'high';
  if (/^(package\.json|Makefile|justfile|Dockerfile|docker-compose\.ya?ml|(AGENTS|CLAUDE|GEMINI)\.md)$/.test(rel)) return 'low';
  return 'medium';
}

/**
 * @param {import('./snapshot.js').Snapshot} before
 * @param {import('./snapshot.js').Snapshot} after
 * @returns {Finding[]}
 */
function diffProject(before, after) {
  /** @type {Finding[]} */
  const out = [];
  const keys = new Set([...Object.keys(before.project), ...Object.keys(after.project)]);
  /** @type {string[]} */ const added = [];
  /** @type {string[]} */ const modified = [];
  /** @type {string[]} */ const removed = [];

  for (const rel of [...keys].sort()) {
    const a = before.project[rel];
    const b = after.project[rel];
    const surface = isExecSurface(rel);
    if (!a && b) {
      added.push(rel);
      if (surface) {
        const lines = b.text !== undefined ? { added: nonEmptyLines(b.text), removed: [] } : undefined;
        const hints = lines ? hintsForAddedLines(rel, lines.added) : [];
        out.push({
          severity: hints.reduce((s, h) => maxSeverity(s, h.severity), surfaceSeverity(rel)),
          category: 'project-exec',
          action: 'added',
          title: `./${rel}`,
          lines,
          notes: ['runs code or steers an agent later', ...hints.map((h) => h.text)],
        });
      }
    } else if (a && !b) {
      removed.push(rel);
    } else if (a && b) {
      const changed = a.hash && b.hash ? a.hash !== b.hash : a.size !== b.size || a.mtimeMs !== b.mtimeMs;
      if (!changed) continue;
      modified.push(rel);
      if (surface && a.text !== undefined && b.text !== undefined) {
        const d = lineDiff(a.text, b.text);
        const lines = { added: d.added.filter((l) => l.trim()), removed: d.removed.filter((l) => l.trim()) };
        const hints = hintsForAddedLines(rel, lines.added);
        out.push({
          severity: hints.reduce((s, h) => maxSeverity(s, h.severity), surfaceSeverity(rel)),
          category: 'project-exec',
          action: 'modified',
          title: `./${rel}`,
          lines,
          notes: ['runs code or steers an agent later', ...hints.map((h) => h.text)],
        });
      }
    }
  }

  const total = added.length + modified.length + removed.length;
  if (total > 0) {
    const plain = (/** @type {string[]} */ list) => list.filter((p) => !isExecSurface(p));
    const sample = [
      ...plain(added).map((p) => `+ ${p}`),
      ...plain(modified).map((p) => `~ ${p}`),
      ...plain(removed).map((p) => `- ${p}`),
    ];
    out.push({
      severity: 'info',
      category: 'project',
      action: 'info',
      title: `project directory: ${added.length} added, ${modified.length} modified, ${removed.length} removed`,
      lines: undefined,
      notes: [...sample.slice(0, 8), ...(sample.length > 8 ? [`... and ${sample.length - 8} more`] : [])],
    });
  }
  if (after.projectTruncated) {
    out.push({ severity: 'info', category: 'project', action: 'info', title: 'project scan was capped at 50,000 files', notes: [] });
  }
  return out;
}

/**
 * @param {import('./snapshot.js').Snapshot} before
 * @param {import('./snapshot.js').Snapshot} after
 * @param {{ leftover?: import('./collectors/processes.js').Proc[] }} [extra]
 * @returns {Finding[]}
 */
export function diffSnapshots(before, after, extra = {}) {
  /** @type {Finding[]} */
  const findings = [...diffFiles(before, after), ...diffProject(before, after)];

  if (before.crontab !== null && after.crontab !== null && before.crontab !== after.crontab) {
    const d = lineDiff(before.crontab, after.crontab);
    const lines = { added: d.added.filter((l) => l.trim()), removed: d.removed.filter((l) => l.trim()) };
    findings.push({
      severity: lines.added.length ? 'high' : 'medium',
      category: 'persistence',
      action: 'modified',
      title: 'crontab',
      lines,
      notes: lines.added.length ? ['scheduled jobs run without you'] : [],
    });
  }

  if (before.listeners && after.listeners) {
    const known = new Set(before.listeners.map((l) => `${l.addr}:${l.port}`));
    for (const l of after.listeners) {
      if (known.has(`${l.addr}:${l.port}`)) continue;
      const exposed = isExposed(l.addr);
      findings.push({
        severity: exposed ? 'high' : 'medium',
        category: 'network',
        action: 'listening',
        title: `new listener ${l.addr === '*' ? '0.0.0.0' : l.addr}:${l.port}  (${l.command}, pid ${l.pid})`,
        notes: exposed ? ['reachable from other machines on your network'] : ['local only'],
      });
    }
  }

  for (const p of extra.leftover ?? []) {
    findings.push({
      severity: 'medium',
      category: 'process',
      action: 'running',
      title: `still running after exit: pid ${p.pid}  ${shortCommand(p.command)}`,
      notes: [],
    });
  }

  if (before.packages && after.packages) {
    const names = new Set([...Object.keys(before.packages), ...Object.keys(after.packages)]);
    for (const n of [...names].sort()) {
      const a = before.packages[n];
      const b = after.packages[n];
      if (a === undefined && b !== undefined) {
        findings.push({ severity: 'medium', category: 'packages', action: 'added', title: `global package ${n} ${b}`, notes: [] });
      } else if (a !== undefined && b === undefined) {
        findings.push({ severity: 'low', category: 'packages', action: 'removed', title: `global package ${n}`, notes: [] });
      } else if (a !== b) {
        findings.push({ severity: 'low', category: 'packages', action: 'modified', title: `global package ${n}: ${a} -> ${b}`, notes: [] });
      }
    }
  }

  const order = (/** @type {Finding} */ f) => 3 - RANK[f.severity];
  findings.sort((x, y) => order(x) - order(y) || x.category.localeCompare(y.category) || x.title.localeCompare(y.title));
  for (const f of findings) {
    if (f.lines && f.lines.added.length > MAX_LINES) {
      f.notes.push(`${f.lines.added.length - MAX_LINES} more added lines not shown`);
      f.lines = { added: f.lines.added.slice(0, MAX_LINES), removed: f.lines.removed };
    }
  }
  return findings;
}

/** @param {Finding[]} findings */
export function countBySeverity(findings) {
  const c = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}
