import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { redactText } from '../redact.js';

const MAX_HASH_BYTES = 1024 * 1024;
const MAX_TEXT_BYTES = 128 * 1024;

/**
 * @typedef {object} FileEntry
 * @property {'file' | 'dir' | 'symlink'} type
 * @property {number} size
 * @property {number} mtimeMs
 * @property {number} mode
 * @property {string} [hash]
 * @property {string} [text]    redacted text content, only for small non-secret files
 * @property {string} [link]    symlink target
 * @property {string} category
 * @property {import('../levels.js').Severity} severity
 * @property {boolean} secret
 */

/**
 * @param {string} abs
 * @param {import('../watchlist.js').Target} target
 * @returns {Promise<FileEntry | null>}
 */
async function describe(abs, target) {
  let st;
  try {
    st = await fs.lstat(abs);
  } catch {
    return null;
  }
  /** @type {FileEntry} */
  const entry = {
    type: st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'dir' : 'file',
    size: st.size,
    mtimeMs: Math.round(st.mtimeMs),
    mode: st.mode & 0o7777,
    category: target.category,
    severity: target.severity,
    secret: Boolean(target.secret),
  };
  if (entry.type === 'symlink') {
    try {
      entry.link = await fs.readlink(abs);
    } catch {
      /* dangling or unreadable: ignore */
    }
  }
  if (entry.type === 'file' && target.hash !== false && st.size <= MAX_HASH_BYTES) {
    try {
      const buf = await fs.readFile(abs);
      entry.hash = createHash('sha256').update(buf).digest('hex');
      if (!entry.secret && st.size <= MAX_TEXT_BYTES && !buf.includes(0)) {
        entry.text = redactText(buf.toString('utf8'));
      }
    } catch {
      /* unreadable: fall back to size+mtime comparison */
    }
  }
  return entry;
}

/**
 * @param {string} abs
 * @param {import('../watchlist.js').Target} target
 * @param {number} depth
 * @param {Map<string, FileEntry>} out
 */
async function visit(abs, target, depth, out) {
  if (depth <= 0) return;
  let names;
  try {
    names = await fs.readdir(abs);
  } catch {
    return;
  }
  for (const name of names) {
    if (target.ignore?.some((re) => re.test(name))) continue;
    if (name === '.DS_Store') continue;
    const child = path.join(abs, name);
    if (out.has(child)) continue;
    const entry = await describe(child, target);
    if (!entry) continue;
    out.set(child, entry);
    if (entry.type === 'dir' && depth > 1) await visit(child, target, depth - 1, out);
  }
}

/**
 * Snapshot every watch target. Earlier targets win when paths overlap, so list
 * the specific ones before the catch-all.
 * @param {import('../watchlist.js').Target[]} targets
 * @returns {Promise<Record<string, FileEntry>>}
 */
export async function collectFiles(targets) {
  /** @type {Map<string, FileEntry>} */
  const out = new Map();
  for (const target of targets) {
    const self = await describe(target.abs, target);
    if (!self) continue;
    if (self.type === 'dir') {
      // the catch-all home listing must not report $HOME itself
      if (target.category !== 'home' && !out.has(target.abs)) out.set(target.abs, self);
      await visit(target.abs, target, target.depth ?? 1, out);
    } else if (!out.has(target.abs)) {
      out.set(target.abs, self);
    }
  }
  return Object.fromEntries(out);
}
