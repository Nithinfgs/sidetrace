import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { redactText } from '../redact.js';

const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.sidetrace', 'dist', 'build', '.next', '.nuxt', 'target',
  '__pycache__', '.venv', 'venv', '.cache', 'coverage', '.turbo', '.gradle', 'Pods',
]);
const MAX_ENTRIES = 50_000;

/**
 * Files that execute code later (git hooks, task runners, MCP/agent config).
 * A change to one of these in your project is worth a second look.
 */
export const EXEC_SURFACE = [
  /^\.git\/hooks\/[^/]+$/,
  /^\.git\/config$/,
  /^\.husky\//,
  /^\.vscode\/(tasks|settings|mcp)\.json$/,
  /^\.envrc$/,
  /^\.mcp\.json$/,
  /^\.claude\/(settings(\.local)?\.json|hooks\/|commands\/|agents\/|skills\/)/,
  /^\.cursor\/(mcp\.json|rules\/)/,
  /^\.github\/workflows\//,
  /^(AGENTS|CLAUDE|GEMINI)\.md$/,
  /^(package\.json|Makefile|justfile|Dockerfile|docker-compose\.ya?ml)$/,
];

/** @param {string} rel */
export function isExecSurface(rel) {
  return EXEC_SURFACE.some((re) => re.test(rel.split(path.sep).join('/')));
}

/**
 * @typedef {object} ProjectEntry
 * @property {number} size
 * @property {number} mtimeMs
 * @property {string} [hash]
 * @property {string} [text]
 */

/**
 * @param {string} root
 * @returns {Promise<{ files: Record<string, ProjectEntry>, truncated: boolean }>}
 */
export async function collectProject(root) {
  /** @type {Record<string, ProjectEntry>} */
  const files = {};
  let count = 0;
  let truncated = false;

  /** @param {string} rel @param {import('node:fs').Dirent[]} entries */
  async function addExecDir(rel, entries) {
    for (const e of entries) {
      if (e.isFile()) await add(path.join(rel, e.name));
    }
  }

  /** @param {string} rel */
  async function add(rel) {
    if (count >= MAX_ENTRIES) {
      truncated = true;
      return;
    }
    let st;
    try {
      st = await fs.lstat(path.join(root, rel));
    } catch {
      return;
    }
    if (!st.isFile()) return;
    count++;
    /** @type {ProjectEntry} */
    const entry = { size: st.size, mtimeMs: Math.round(st.mtimeMs) };
    if (isExecSurface(rel) && st.size <= 128 * 1024) {
      try {
        const buf = await fs.readFile(path.join(root, rel));
        entry.hash = createHash('sha256').update(buf).digest('hex');
        if (!buf.includes(0)) entry.text = redactText(buf.toString('utf8'));
      } catch {
        /* ignore */
      }
    }
    files[rel] = entry;
  }

  /** @param {string} rel @param {number} depth */
  async function walk(rel, depth) {
    if (depth > 12 || count >= MAX_ENTRIES) {
      if (count >= MAX_ENTRIES) truncated = true;
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = path.join(rel, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        await walk(childRel, depth + 1);
      } else if (e.isFile()) {
        await add(childRel);
      }
    }
  }

  await walk('', 0);
  // .git is skipped wholesale above, but hooks and config are execution surfaces.
  try {
    await addExecDir(
      path.join('.git', 'hooks'),
      await fs.readdir(path.join(root, '.git', 'hooks'), { withFileTypes: true }),
    );
  } catch {
    /* not a git repo */
  }
  await add(path.join('.git', 'config'));
  return { files, truncated };
}
