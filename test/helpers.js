import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Create an isolated fake home + project; returns paths and a cleanup function. */
export async function sandbox() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sidetrace-test-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  await fs.mkdir(home);
  await fs.mkdir(project);
  return { root, home, project, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

/** Options that keep tests hermetic: no real crontab or port scan. */
export const hermetic = { crontab: false, listeners: false };
