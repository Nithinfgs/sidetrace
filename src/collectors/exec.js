import { execFile } from 'node:child_process';

/**
 * Run a helper binary and resolve with stdout, or null if it is missing,
 * fails, or times out. Collectors treat null as "unavailable", never as fatal.
 * @param {string} cmd
 * @param {string[]} args
 * @param {number} [timeoutMs]
 * @returns {Promise<string | null>}
 */
export function capture(cmd, args, timeoutMs = 5000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      resolve(err && !stdout ? null : String(stdout));
    });
  });
}
