import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DescendantTracker } from './collectors/processes.js';
import { countBySeverity, diffSnapshots } from './diff.js';
import { takeSnapshot } from './snapshot.js';

/**
 * Build a report from two snapshots.
 * @param {import('./snapshot.js').Snapshot} before
 * @param {import('./snapshot.js').Snapshot} after
 * @param {{ command: string, exitCode: number | null, durationMs: number, leftover?: import('./collectors/processes.js').Proc[] }} meta
 * @returns {import('./report/terminal.js').Report}
 */
export function buildReport(before, after, meta) {
  const findings = diffSnapshots(before, after, { leftover: meta.leftover });
  /** @type {string[]} */
  const warnings = [];
  if (after.listeners === null) warnings.push('port check skipped: neither lsof nor ss is available');
  return {
    command: meta.command,
    exitCode: meta.exitCode,
    durationMs: meta.durationMs,
    findings,
    counts: countBySeverity(findings),
    warnings,
  };
}

/**
 * Snapshot, run `argv` with inherited stdio, snapshot again.
 * @param {import('./snapshot.js').Options} opts
 * @param {string[]} argv
 * @param {{ env?: NodeJS.ProcessEnv, label?: string }} [run]
 */
export async function runWrapped(opts, argv, run = {}) {
  const before = await takeSnapshot(opts);
  const started = Date.now();
  const child = spawn(argv[0], argv.slice(1), {
    cwd: opts.cwd,
    stdio: 'inherit',
    env: run.env ?? process.env,
  });

  /** @type {DescendantTracker | undefined} */
  let tracker;
  if (child.pid) {
    tracker = new DescendantTracker(child.pid);
    tracker.start();
  }
  // Ctrl-C reaches the child through the shared process group; we stay alive to print the receipt.
  const ignoreSigint = () => {};
  process.on('SIGINT', ignoreSigint);

  /** @type {number} */
  const exitCode = await new Promise((resolve) => {
    child.on('error', (err) => {
      process.stderr.write(`sidetrace: cannot run "${argv[0]}": ${err.message}\n`);
      resolve(127);
    });
    child.on('close', (code, signal) => resolve(code ?? (signal ? 128 + (os.constants.signals[signal] ?? 0) : 1)));
  });
  process.off('SIGINT', ignoreSigint);
  const leftover = tracker ? await tracker.stop() : [];
  const durationMs = Date.now() - started;
  const after = await takeSnapshot(opts);
  const report = buildReport(before, after, { command: run.label ?? [path.basename(argv[0]), ...argv.slice(1)].join(' '), exitCode, durationMs, leftover });
  return { report, exitCode, leftover };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} home
 */
export function stateDir(env, home) {
  return env.SIDETRACE_STATE_DIR || path.join(env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'sidetrace');
}

/** @param {string} name */
function safeName(name) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(name)) throw new Error(`invalid snapshot name: ${name}`);
  return name;
}

/** @param {string} dir @param {string} name @param {import('./snapshot.js').Snapshot} snap */
export async function saveSnapshot(dir, name, snap) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${safeName(name)}.json`);
  await fs.writeFile(file, JSON.stringify(snap), { mode: 0o600 });
  return file;
}

/** @param {string} dir @param {string} name @returns {Promise<import('./snapshot.js').Snapshot>} */
export async function loadSnapshot(dir, name) {
  const file = path.join(dir, `${safeName(name)}.json`);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    throw new Error(`no saved snapshot "${name}". Run "sidetrace start" first.`);
  }
}
