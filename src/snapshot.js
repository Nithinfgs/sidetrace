import os from 'node:os';
import path from 'node:path';
import { collectFiles } from './collectors/files.js';
import { collectProject } from './collectors/project.js';
import { collectCrontab, collectListeners, collectPackages } from './collectors/system.js';
import { defaultTargets } from './watchlist.js';

/**
 * @typedef {object} Options
 * @property {string} home
 * @property {string} cwd
 * @property {string[]} [watch]      extra paths to watch (absolute or relative to cwd)
 * @property {string[]} [ignore]     substrings; matching absolute paths are dropped
 * @property {boolean} [deep]        also snapshot global npm/brew packages
 * @property {boolean} [project]     snapshot the working directory (default true)
 * @property {boolean} [crontab]     default true
 * @property {boolean} [listeners]   default true
 */

/**
 * @typedef {object} Snapshot
 * @property {1} version
 * @property {string} takenAt
 * @property {string} home
 * @property {string} cwd
 * @property {Record<string, import('./collectors/files.js').FileEntry>} files
 * @property {Record<string, import('./collectors/project.js').ProjectEntry>} project
 * @property {boolean} projectTruncated
 * @property {string | null} crontab
 * @property {import('./collectors/system.js').Listener[] | null} listeners
 * @property {Record<string, string> | null} packages
 */

export function resolveHome() {
  return process.env.HOME || os.homedir();
}

/** @param {Options} opts @returns {Promise<Snapshot>} */
export async function takeSnapshot(opts) {
  const targets = defaultTargets(opts.home);
  for (const w of opts.watch ?? []) {
    const abs = path.resolve(opts.cwd, w);
    targets.unshift({ abs, category: 'custom', severity: 'medium', depth: 4 });
  }
  const inHome = path.resolve(opts.cwd) === path.resolve(opts.home);
  const [files, project, crontab, listeners, packages] = await Promise.all([
    collectFiles(targets),
    opts.project === false || inHome
      ? Promise.resolve({ files: {}, truncated: false })
      : collectProject(opts.cwd),
    opts.crontab === false ? Promise.resolve(null) : collectCrontab(),
    opts.listeners === false ? Promise.resolve(null) : collectListeners(),
    opts.deep ? collectPackages() : Promise.resolve(null),
  ]);
  const ignore = opts.ignore ?? [];
  const keep = (/** @type {string} */ p) => !ignore.some((s) => p.includes(s));
  return {
    version: 1,
    takenAt: new Date().toISOString(),
    home: opts.home,
    cwd: opts.cwd,
    files: Object.fromEntries(Object.entries(files).filter(([p]) => keep(p))),
    project: Object.fromEntries(Object.entries(project.files).filter(([p]) => keep(p))),
    projectTruncated: project.truncated,
    crontab,
    listeners,
    packages,
  };
}
