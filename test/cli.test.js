import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { sandbox } from './helpers.js';

const BIN = fileURLToPath(new URL('../bin/sidetrace.js', import.meta.url));
const INSTALLER = fileURLToPath(new URL('../examples/sketchy-installer.js', import.meta.url));

function run(sb, args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: sb.project,
    env: { ...process.env, HOME: sb.home, NO_COLOR: '1', ...env },
    encoding: 'utf8',
  });
}

test('run: wrapped command stdout stays on stdout, receipt goes to stderr', async () => {
  const sb = await sandbox();
  try {
    const r = run(sb, ['run', '--', process.execPath, '-e', 'console.log("hello")']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), 'hello');
    assert.match(r.stderr, /sidetrace receipt/);
    assert.match(r.stderr, /Nothing changed/);
  } finally {
    await sb.cleanup();
  }
});

test('run: propagates the wrapped command exit code', async () => {
  const sb = await sandbox();
  try {
    const r = run(sb, ['run', '--', process.execPath, '-e', 'process.exit(7)']);
    assert.equal(r.status, 7);
  } finally {
    await sb.cleanup();
  }
});

test('run: --json reports findings and --fail-on gates the exit code', async () => {
  const sb = await sandbox();
  try {
    const script = `require('fs').appendFileSync(process.env.HOME + '/.zshrc', 'alias sudo="x"\\n')`;
    const r = run(sb, ['run', '--json', '--fail-on', 'high', '--', process.execPath, '-e', script]);
    assert.equal(r.status, 3);
    const report = JSON.parse(r.stderr);
    assert.equal(report.counts.high, 1);
    assert.equal(report.findings[0].title, '~/.zshrc');
  } finally {
    await sb.cleanup();
  }
});

test('run: --md and --out write a markdown receipt file', async () => {
  const sb = await sandbox();
  try {
    const out = path.join(sb.root, 'receipt.md');
    const script = `require('fs').writeFileSync(process.env.HOME + '/.bashrc', 'export A=1\\n')`;
    const r = run(sb, ['run', '--md', '--out', out, '--', process.execPath, '-e', script]);
    assert.equal(r.status, 0);
    assert.match(await fs.readFile(out, 'utf8'), /### sidetrace receipt/);
  } finally {
    await sb.cleanup();
  }
});

test('run: missing command reports an error and exit 127', async () => {
  const sb = await sandbox();
  try {
    const r = run(sb, ['run', '--', 'definitely-not-a-real-command-xyz']);
    assert.equal(r.status, 127);
    assert.match(r.stderr, /cannot run/);
  } finally {
    await sb.cleanup();
  }
});

test('start/end: compares against a saved snapshot', async () => {
  const sb = await sandbox();
  try {
    const state = { SIDETRACE_STATE_DIR: path.join(sb.root, 'state') };
    assert.equal(run(sb, ['start', '--name', 't1'], state).status, 0);
    await fs.writeFile(path.join(sb.home, '.profile'), 'export X=1\n');
    const r = run(sb, ['end', '--name', 't1', '--json'], state);
    assert.equal(r.status, 0);
    assert.ok(JSON.parse(r.stdout).findings.some((f) => f.title === '~/.profile'));
  } finally {
    await sb.cleanup();
  }
});

test('end: friendly error when no snapshot exists', async () => {
  const sb = await sandbox();
  try {
    const r = run(sb, ['end', '--name', 'nope'], { SIDETRACE_STATE_DIR: path.join(sb.root, 'state') });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Run "sidetrace start" first/);
  } finally {
    await sb.cleanup();
  }
});

test('the sketchy installer example is caught across categories', async () => {
  const sb = await sandbox();
  try {
    await fs.writeFile(path.join(sb.project, 'package.json'), '{"name":"x","scripts":{}}\n');
    const r = run(sb, ['run', '--json', '--', process.execPath, INSTALLER]);
    assert.equal(r.status, 0);
    const report = JSON.parse(r.stderr.slice(r.stderr.indexOf('{')));
    const titles = report.findings.map((f) => f.title);
    for (const expected of ['~/.zshrc', '~/.npmrc', '~/.ssh/authorized_keys', '~/.claude/settings.json', '~/Library/LaunchAgents/com.sketchy.helper.plist', './.git/hooks/pre-push']) {
      assert.ok(titles.includes(expected), `missing finding for ${expected}`);
    }
    assert.ok(report.counts.high >= 6);
    // clean up the detached listener the installer leaves behind
    for (const f of report.findings) {
      const m = /still running after exit: pid (\d+)/.exec(f.title);
      if (m) process.kill(Number(m[1]));
    }
  } finally {
    await sb.cleanup();
  }
});

test('unknown commands and flags exit 2', async () => {
  const sb = await sandbox();
  try {
    assert.equal(run(sb, ['bogus']).status, 2);
    assert.equal(run(sb, ['run', '--nope']).status, 2);
    assert.equal(run(sb, ['--version']).stdout.trim(), '0.1.0');
  } finally {
    await sb.cleanup();
  }
});
