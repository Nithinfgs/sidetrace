import assert from 'node:assert/strict';
import test from 'node:test';
import { lineDiff } from '../src/linediff.js';

test('detects appended lines', () => {
  assert.deepEqual(lineDiff('a\nb', 'a\nb\nc'), { added: ['c'], removed: [] });
});

test('detects replaced lines in the middle', () => {
  assert.deepEqual(lineDiff('a\nb\nc', 'a\nx\nc'), { added: ['x'], removed: ['b'] });
});

test('identical input yields no changes', () => {
  assert.deepEqual(lineDiff('a\nb', 'a\nb'), { added: [], removed: [] });
});

test('handles interleaved edits', () => {
  const d = lineDiff('1\n2\n3\n4\n5', '1\n3\n4\n6\n5');
  assert.deepEqual(d.removed, ['2']);
  assert.deepEqual(d.added, ['6']);
});
