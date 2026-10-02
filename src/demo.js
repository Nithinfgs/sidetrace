import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWrapped } from './session.js';

const INSTALLER = fileURLToPath(new URL('../examples/sketchy-installer.js', import.meta.url));

/**
 * Run the bundled badly-behaved installer against a throwaway home directory
 * and project, so first run shows the receipt without touching anything real.
 */
export async function runDemo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sidetrace-demo-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'my-app');
  await fs.mkdir(home);
  await fs.mkdir(project);
  await fs.writeFile(path.join(home, '.zshrc'), '# my shell config\nalias ll="ls -la"\n');
  await fs.writeFile(path.join(home, '.gitconfig'), '[user]\n\tname = Demo User\n');
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'my-app', scripts: { test: 'node --test' } }, null, 2) + '\n');
  await fs.writeFile(path.join(project, 'index.js'), 'console.log("hello")\n');

  try {
    const result = await runWrapped(
      { home, cwd: project, crontab: false },
      [process.execPath, INSTALLER],
      { env: { ...process.env, HOME: home }, label: 'npx sketchy-cli install' },
    );
    for (const p of result.leftover) {
      try {
        process.kill(p.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
    return result.report;
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
