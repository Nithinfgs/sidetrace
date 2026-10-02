import { capture } from './exec.js';

/** @returns {Promise<string | null>} crontab text, '' when empty, null when unavailable */
export async function collectCrontab() {
  const out = await capture('crontab', ['-l']);
  return out === null ? '' : out;
}

/**
 * @typedef {object} Listener
 * @property {string} addr
 * @property {number} port
 * @property {number} pid
 * @property {string} command
 */

/** @returns {Promise<Listener[] | null>} null when neither lsof nor ss is available */
export async function collectListeners() {
  const lsof = await capture('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']);
  if (lsof !== null) return parseLsof(lsof);
  const ss = await capture('ss', ['-ltnpH']);
  if (ss !== null) return parseSs(ss);
  return null;
}

/** @param {string} text @returns {Listener[]} */
export function parseLsof(text) {
  /** @type {Listener[]} */
  const out = [];
  let pid = 0;
  let command = '';
  for (const line of text.split('\n')) {
    const tag = line[0];
    const val = line.slice(1);
    if (tag === 'p') pid = Number(val);
    else if (tag === 'c') command = val;
    else if (tag === 'n') {
      const i = val.lastIndexOf(':');
      const port = Number(val.slice(i + 1));
      if (i > 0 && Number.isInteger(port)) out.push({ addr: val.slice(0, i), port, pid, command });
    }
  }
  return dedupe(out);
}

/** @param {string} text @returns {Listener[]} */
export function parseSs(text) {
  /** @type {Listener[]} */
  const out = [];
  for (const line of text.split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    const local = cols[3];
    const i = local.lastIndexOf(':');
    const port = Number(local.slice(i + 1));
    if (i < 0 || !Number.isInteger(port)) continue;
    const m = /\(\("([^"]+)",pid=(\d+)/.exec(line);
    out.push({ addr: local.slice(0, i), port, pid: m ? Number(m[2]) : 0, command: m ? m[1] : '?' });
  }
  return dedupe(out);
}

/** @param {Listener[]} list */
function dedupe(list) {
  const seen = new Set();
  return list.filter((l) => {
    const k = `${l.addr}:${l.port}:${l.pid}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** @param {string} addr */
export function isExposed(addr) {
  return addr === '*' || addr === '0.0.0.0' || addr === '[::]' || addr === '::';
}

/**
 * Globally installed packages (opt-in via --deep; slower).
 * @returns {Promise<Record<string, string>>}
 */
export async function collectPackages() {
  /** @type {Record<string, string>} */
  const pkgs = {};
  const npm = await capture('npm', ['ls', '-g', '--depth=0', '--json'], 20000);
  if (npm) {
    try {
      const deps = JSON.parse(npm).dependencies ?? {};
      for (const [name, info] of Object.entries(deps)) {
        pkgs[`npm:${name}`] = String(/** @type {any} */ (info).version ?? '?');
      }
    } catch {
      /* ignore malformed output */
    }
  }
  const brew = await capture('brew', ['list', '--versions'], 20000);
  if (brew) {
    for (const line of brew.split('\n')) {
      const [name, ...v] = line.trim().split(/\s+/);
      if (name) pkgs[`brew:${name}`] = v.join(' ');
    }
  }
  return pkgs;
}
