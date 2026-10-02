import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {object} Config
 * @property {string[]} watch
 * @property {string[]} ignore
 * @property {string} [failOn]
 * @property {boolean} [deep]
 */

/** @param {unknown} v @returns {string[]} */
function strings(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

/**
 * Reads .sidetrace.json from the working directory, if present.
 * @param {string} cwd
 * @returns {Promise<Config>}
 */
export async function loadConfig(cwd) {
  const file = path.join(cwd, '.sidetrace.json');
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return { watch: [], ignore: [] };
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${/** @type {Error} */ (e).message}`);
  }
  return {
    watch: strings(json.watch),
    ignore: strings(json.ignore),
    failOn: typeof json.failOn === 'string' ? json.failOn : undefined,
    deep: typeof json.deep === 'boolean' ? json.deep : undefined,
  };
}
