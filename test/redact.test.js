import assert from 'node:assert/strict';
import test from 'node:test';
import { redactLine, redactText } from '../src/redact.js';

test('masks well-known token formats', () => {
  const line = 'GH=ghp_' + 'a'.repeat(36);
  const out = redactLine(line);
  assert.match(out, /\[REDACTED:[0-9a-f]{4}\]/);
  assert.doesNotMatch(out, /ghp_a/);
});

test('masks key=value secrets but keeps the key name', () => {
  const out = redactLine('export API_KEY="supersecretvalue123"');
  assert.match(out, /API_KEY="\[REDACTED:[0-9a-f]{4}\]"/);
});

test('same secret gets the same fingerprint, different secrets differ', () => {
  const a = redactLine('token=aaaaaaaaaaaa');
  const b = redactLine('token=aaaaaaaaaaaa');
  const c = redactLine('token=bbbbbbbbbbbb');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('leaves ordinary lines alone', () => {
  assert.equal(redactLine('alias ll="ls -la"'), 'alias ll="ls -la"');
});

test('collapses private key material', () => {
  const text = ['-----BEGIN OPENSSH PRIVATE KEY-----', 'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW', '-----END OPENSSH PRIVATE KEY-----'].join('\n');
  const out = redactText(text);
  assert.doesNotMatch(out, /b3BlbnNzaC1/);
  assert.match(out, /\[PRIVATE KEY\]/);
});
