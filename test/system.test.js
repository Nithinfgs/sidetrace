import assert from 'node:assert/strict';
import test from 'node:test';
import { isExposed, parseLsof, parseSs } from '../src/collectors/system.js';
import { parsePs } from '../src/collectors/processes.js';

test('parses lsof -F output', () => {
  const out = ['p123', 'cnode', 'n*:3000', 'n127.0.0.1:9229', 'p456', 'cpostgres', 'n[::1]:5432', ''].join('\n');
  assert.deepEqual(parseLsof(out), [
    { addr: '*', port: 3000, pid: 123, command: 'node' },
    { addr: '127.0.0.1', port: 9229, pid: 123, command: 'node' },
    { addr: '[::1]', port: 5432, pid: 456, command: 'postgres' },
  ]);
});

test('parses ss output', () => {
  const out = 'LISTEN 0 511 0.0.0.0:8080 0.0.0.0:* users:(("node",pid=77,fd=19))\n';
  assert.deepEqual(parseSs(out), [{ addr: '0.0.0.0', port: 8080, pid: 77, command: 'node' }]);
});

test('knows which bind addresses are reachable from the network', () => {
  assert.ok(isExposed('*'));
  assert.ok(isExposed('0.0.0.0'));
  assert.ok(!isExposed('127.0.0.1'));
  assert.ok(!isExposed('[::1]'));
});

test('parses ps output', () => {
  assert.deepEqual(parsePs('  10     1 /sbin/launchd\n 99 10 node server.js --port 1\n'), [
    { pid: 10, ppid: 1, command: '/sbin/launchd' },
    { pid: 99, ppid: 10, command: 'node server.js --port 1' },
  ]);
});
