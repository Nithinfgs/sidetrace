import { capture } from './exec.js';

/**
 * @typedef {object} Proc
 * @property {number} pid
 * @property {number} ppid
 * @property {string} command
 */

/** @param {string} text @returns {Proc[]} */
export function parsePs(text) {
  /** @type {Proc[]} */
  const out = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] });
  }
  return out;
}

/** @returns {Promise<Proc[]>} */
export async function listProcesses() {
  const out = await capture('ps', ['-axo', 'pid=,ppid=,command=']);
  return out ? parsePs(out) : [];
}

/** @param {number} pid */
export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return /** @type {NodeJS.ErrnoException} */ (e).code === 'EPERM';
  }
}

/**
 * Follows the process tree under `rootPid` while the command runs, so that
 * afterwards we can tell which descendants outlived it (daemons, dev servers,
 * "helper" agents) without guessing from a before/after process list.
 */
export class DescendantTracker {
  /** @param {number} rootPid @param {number} [intervalMs] */
  constructor(rootPid, intervalMs = 150) {
    this.rootPid = rootPid;
    this.intervalMs = intervalMs;
    /** @type {Map<number, string>} */
    this.seen = new Map();
    this.timer = /** @type {NodeJS.Timeout | null} */ (null);
    this.busy = false;
  }

  start() {
    const tick = async () => {
      if (this.busy) return;
      this.busy = true;
      try {
        this.absorb(await listProcesses());
      } finally {
        this.busy = false;
      }
    };
    void tick();
    this.timer = setInterval(tick, this.intervalMs);
  }

  /** @param {Proc[]} procs */
  absorb(procs) {
    const family = new Set([this.rootPid, ...this.seen.keys()]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of procs) {
        if (!family.has(p.pid) && family.has(p.ppid)) {
          family.add(p.pid);
          this.seen.set(p.pid, p.command);
          grew = true;
        }
      }
    }
  }

  /** @returns {Promise<Proc[]>} descendants still running after the root exited */
  async stop() {
    if (this.timer) clearInterval(this.timer);
    await new Promise((r) => setTimeout(r, 50));
    this.absorb(await listProcesses());
    const alive = await listProcesses();
    const live = new Map(alive.map((p) => [p.pid, p]));
    return [...this.seen.keys()]
      .filter((pid) => live.has(pid) && isAlive(pid))
      .map((pid) => /** @type {Proc} */ (live.get(pid)))
      .filter((p) => !/^\s*(ps|lsof|ss|crontab)\b/.test(p.command));
  }
}
