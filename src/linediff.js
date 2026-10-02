/**
 * Minimal line diff (common prefix/suffix trim + LCS). Good enough for config
 * files; falls back to a set difference when the middle section is huge.
 * @param {string} before
 * @param {string} after
 * @returns {{ added: string[], removed: string[] }}
 */
export function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  if (midA.length * midB.length > 4_000_000) {
    const setA = new Set(midA);
    const setB = new Set(midB);
    return {
      added: midB.filter((l) => !setA.has(l)),
      removed: midA.filter((l) => !setB.has(l)),
    };
  }

  const n = midA.length;
  const m = midB.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        midA[i] === midB[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const added = [];
  const removed = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      removed.push(midA[i++]);
    } else {
      added.push(midB[j++]);
    }
  }
  while (i < n) removed.push(midA[i++]);
  while (j < m) added.push(midB[j++]);
  return { added, removed };
}
