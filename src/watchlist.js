import path from 'node:path';

/**
 * @typedef {import('./levels.js').Severity} Severity
 * @typedef {object} Target
 * @property {string} abs        absolute path (file or directory)
 * @property {string} category   persistence | credentials | agent-config | path-binary | system | home | custom
 * @property {Severity} severity severity when something here is added or modified
 * @property {boolean} [secret]  never capture or print file contents
 * @property {number} [depth]    levels of children to list when abs is a directory
 * @property {boolean} [hash]    hash file contents (default true)
 * @property {RegExp[]} [ignore] basename patterns to skip
 */

/** Names in $HOME that change constantly and are never interesting. */
const HOME_NOISE = [
  /^\.DS_Store$/,
  /^\.Trash$/,
  /^Library$/,
  /history$/i,
  /^\.zsh_sessions$/,
  /^\.zcompdump/,
  /^\.lesshst$/,
  /^\.viminfo$/,
  /^\.CFUserTextEncoding$/,
  /^\.claude\.json/,
  /^\.cache$/,
  /^\.npm$/,
  /^\.local$/,
  /^\.config$/,
  /^\.Xauthority$/,
];

/**
 * The places a command can leave something behind that outlives the command.
 * @param {string} home
 * @returns {Target[]}
 */
export function defaultTargets(home) {
  const h = (/** @type {string} */ rel) => path.join(home, rel);
  /** @type {Target[]} */
  const t = [];
  const add = (/** @type {Target} */ target) => t.push(target);

  for (const rc of [
    '.zshrc', '.zshenv', '.zprofile', '.zlogin', '.bashrc', '.bash_profile', '.bash_login', '.profile',
  ]) {
    add({ abs: h(rc), category: 'persistence', severity: 'high' });
  }
  add({ abs: h('.config/fish'), category: 'persistence', severity: 'high', depth: 2 });
  add({ abs: h('Library/LaunchAgents'), category: 'persistence', severity: 'high', depth: 1 });
  add({ abs: h('.config/systemd/user'), category: 'persistence', severity: 'high', depth: 2 });
  add({ abs: h('.config/autostart'), category: 'persistence', severity: 'high', depth: 1 });
  add({ abs: h('.config/environment.d'), category: 'persistence', severity: 'high', depth: 1 });
  add({ abs: h('.ssh/authorized_keys'), category: 'persistence', severity: 'high' });
  add({ abs: h('.ssh/config'), category: 'persistence', severity: 'high' });
  add({ abs: h('.ssh/rc'), category: 'persistence', severity: 'high' });
  add({ abs: h('.gitconfig'), category: 'persistence', severity: 'medium' });
  add({ abs: h('.config/git'), category: 'persistence', severity: 'medium', depth: 2 });

  add({
    abs: h('.ssh'), category: 'credentials', severity: 'high', secret: true, depth: 1,
    ignore: [/^known_hosts/, /^authorized_keys$/, /^config$/, /^rc$/, /\.pub$/],
  });
  for (const cred of ['.npmrc', '.netrc', '.pypirc', '.git-credentials', '.docker/config.json', '.kube/config', '.cargo/credentials.toml']) {
    add({ abs: h(cred), category: 'credentials', severity: 'high', secret: true });
  }
  add({ abs: h('.aws'), category: 'credentials', severity: 'high', secret: true, depth: 2 });
  add({ abs: h('.config/gh'), category: 'credentials', severity: 'high', secret: true, depth: 2 });
  add({ abs: h('.gnupg'), category: 'credentials', severity: 'high', secret: true, depth: 1, ignore: [/^S\./, /\.lock$/, /^random_seed$/, /^trustdb/, /^pubring/, /^public-keys/] });

  for (const f of [
    '.claude/settings.json', '.claude/settings.local.json', '.claude/CLAUDE.md',
    '.codex/config.toml', '.codex/AGENTS.md', '.cursor/mcp.json',
    '.gemini/settings.json', '.gemini/GEMINI.md',
    '.vscode/mcp.json',
    'Library/Application Support/Claude/claude_desktop_config.json',
    '.config/Claude/claude_desktop_config.json',
    'Library/Application Support/Code/User/mcp.json',
    '.config/Code/User/mcp.json',
  ]) {
    add({ abs: h(f), category: 'agent-config', severity: 'medium' });
  }
  for (const [dir, depth] of /** @type {[string, number][]} */ ([
    ['.claude/commands', 3], ['.claude/skills', 4], ['.claude/agents', 2], ['.claude/hooks', 2],
    ['.codex/prompts', 2], ['.cursor/rules', 2], ['.config/opencode', 2],
  ])) {
    add({ abs: h(dir), category: 'agent-config', severity: 'medium', depth });
  }

  add({ abs: h('.local/bin'), category: 'path-binary', severity: 'medium', depth: 1 });
  add({ abs: h('bin'), category: 'path-binary', severity: 'medium', depth: 1 });
  add({ abs: '/etc/hosts', category: 'system', severity: 'medium' });

  add({ abs: home, category: 'home', severity: 'low', depth: 1, hash: false, ignore: HOME_NOISE });
  return t;
}
