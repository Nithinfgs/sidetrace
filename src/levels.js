/** @typedef {'info' | 'low' | 'medium' | 'high'} Severity */

/** @type {Record<Severity, number>} */
export const RANK = { info: 0, low: 1, medium: 2, high: 3 };

/** @param {string} s @returns {s is Severity} */
export function isSeverity(s) {
  return Object.hasOwn(RANK, s);
}

/** @param {Severity} a @param {Severity} b @returns {Severity} */
export function maxSeverity(a, b) {
  return RANK[a] >= RANK[b] ? a : b;
}

/** @param {Severity} s @returns {Severity} */
export function downgrade(s) {
  if (s === 'high') return 'medium';
  if (s === 'medium') return 'low';
  return s;
}
