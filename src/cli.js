import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.js';
import { runDemo } from './demo.js';
import { countBySeverity, diffSnapshots, tildify } from './diff.js';
import { isSeverity, RANK } from './levels.js';
import { renderMarkdown } from './report/markdown.js';
import { renderTerminal } from './report/terminal.js';
import { buildReport, loadSnapshot, runWrapped, saveSnapshot, stateDir } from './session.js';
import { resolveHome, takeSnapshot } from './snapshot.js';
import { defaultTargets } from './watchlist.js';

const VERSION = '0.1.0';

const HELP = `sidetrace ${VERSION}
Run any command and get a receipt of what it changed on your machine.

Usage
  sidetrace run [options] -- <command> [args...]   run a command, then print the receipt
  sidetrace start [--name <n>]                     save a snapshot (for sessions you run by hand)
  sidetrace end   [--name <n>] [options]           compare the machine now against that snapshot
  sidetrace demo                                   safe demo against a throwaway home directory
  sidetrace paths                                  list what is being watched

Options
  --json               machine-readable receipt
  --md                 markdown receipt (good for PR comments)
  --out <file>         write the --json/--md receipt to a file instead of the terminal
  --watch <path>       also watch this path (repeatable)
  --ignore <text>      drop findings whose path contains this text (repeatable)
  --fail-on <level>    exit 3 if any finding is at least low|medium|high (and the command succeeded)
  --deep               also compare globally installed npm and Homebrew packages (slower)
  --no-project         do not scan the working directory
  --name <n>           snapshot name for start/end (default: default)
  -v, --version        print the version
  -h, --help           show this help

The receipt goes to stderr for "run", so the wrapped command's stdout stays pipeable.
Config: .sidetrace.json in the working directory ({ "watch": [], "ignore": [], "failOn": "high" }).
`;

/** @param {NodeJS.WriteStream} stream */
function useColor(stream) {
  if (process.env.NO_COLOR) return false;
  return Boolean(stream.isTTY || process.env.FORCE_COLOR);
}

/**
 * @param {import('./report/terminal.js').Report} report
 * @param {{ json?: boolean, md?: boolean, out?: string }} fmt
 * @param {NodeJS.WriteStream} stream
 */
async function emit(report, fmt, stream) {
  let text;
  if (fmt.json) text = JSON.stringify(report, null, 2) + '\n';
  else if (fmt.md) text = renderMarkdown(report);
  else text = renderTerminal(report, { color: useColor(stream) }) + '\n';
  if (fmt.out) await fs.writeFile(fmt.out, text);
  else stream.write(text);
}

/** @param {number} code */
function fail(code, /** @type {string} */ msg) {
  process.stderr.write(`sidetrace: ${msg}\n`);
  return code;
}

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {Promise<number>} exit code
 */
export async function main(argv) {
  const sep = argv.indexOf('--');
  const own = sep === -1 ? argv : argv.slice(0, sep);
  const wrapped = sep === -1 ? [] : argv.slice(sep + 1);

  /** @type {ReturnType<typeof parseArgs>} */
  let parsed;
  try {
    parsed = parseArgs({
      args: own,
      allowPositionals: true,
      options: {
        json: { type: 'boolean' },
        md: { type: 'boolean' },
        out: { type: 'string' },
        watch: { type: 'string', multiple: true },
        ignore: { type: 'string', multiple: true },
        'fail-on': { type: 'string' },
        deep: { type: 'boolean' },
        'no-project': { type: 'boolean' },
        name: { type: 'string' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (e) {
    return fail(2, `${/** @type {Error} */ (e).message}\n\n${HELP}`);
  }
  const { values, positionals } = parsed;
  const cmd = positionals[0];

  if (values.version) {
    process.stdout.write(VERSION + '\n');
    return 0;
  }
  if (values.help || !cmd || cmd === 'help') {
    process.stdout.write(HELP);
    return cmd || values.help ? 0 : 2;
  }

  const home = resolveHome();
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const failOn = /** @type {string | undefined} */ (values['fail-on'] ?? config.failOn);
  if (failOn !== undefined && (!isSeverity(failOn) || failOn === 'info')) {
    return fail(2, '--fail-on must be low, medium or high');
  }
  /** @type {import('./snapshot.js').Options} */
  const opts = {
    home,
    cwd,
    watch: [...config.watch, .../** @type {string[]} */ (values.watch ?? [])],
    ignore: [...config.ignore, .../** @type {string[]} */ (values.ignore ?? [])],
    deep: Boolean(values.deep ?? config.deep),
    project: !values['no-project'],
  };
  const fmt = {
    json: Boolean(values.json),
    md: Boolean(values.md),
    out: /** @type {string | undefined} */ (values.out),
  };
  const gate = (/** @type {import('./report/terminal.js').Report} */ report) =>
    failOn && report.findings.some((f) => RANK[f.severity] >= RANK[/** @type {import('./levels.js').Severity} */ (failOn)]);

  switch (cmd) {
    case 'run': {
      if (wrapped.length === 0) return fail(2, 'nothing to run. Usage: sidetrace run -- <command> [args]');
      const { report, exitCode } = await runWrapped(opts, wrapped);
      await emit(report, fmt, process.stderr);
      if (exitCode !== 0) return exitCode;
      return gate(report) ? 3 : 0;
    }
    case 'start': {
      const snap = await takeSnapshot(opts);
      const file = await saveSnapshot(stateDir(process.env, home), /** @type {string} */ (values.name ?? 'default'), snap);
      process.stdout.write(`snapshot saved: ${tildify(file, home)}\nRun your session, then: sidetrace end\n`);
      return 0;
    }
    case 'end': {
      const dir = stateDir(process.env, home);
      let before;
      try {
        before = await loadSnapshot(dir, /** @type {string} */ (values.name ?? 'default'));
      } catch (e) {
        return fail(2, /** @type {Error} */ (e).message);
      }
      const after = await takeSnapshot({ ...opts, deep: before.packages !== null });
      const findings = diffSnapshots(before, after);
      const report = {
        ...buildReport(before, after, { command: '(manual session)', exitCode: null, durationMs: Date.parse(after.takenAt) - Date.parse(before.takenAt) }),
        findings,
        counts: countBySeverity(findings),
      };
      await emit(report, fmt, process.stdout);
      return gate(report) ? 3 : 0;
    }
    case 'demo': {
      process.stdout.write('Running a badly behaved "installer" against a throwaway home directory...\n');
      const report = await runDemo();
      await emit(report, fmt, process.stdout);
      process.stdout.write('Nothing on your real machine was touched. Try it on a real command:\n  sidetrace run -- npm install -g some-package\n\n');
      return 0;
    }
    case 'paths': {
      for (const t of defaultTargets(home)) {
        const exists = await fs.access(t.abs).then(() => true, () => false);
        const label = path.resolve(t.abs) === path.resolve(home) ? '~ (top level only)' : tildify(t.abs, home);
        process.stdout.write(`${exists ? '●' : '○'} ${t.severity.padEnd(6)} ${t.category.padEnd(12)} ${label}${t.secret ? '  (contents never read)' : ''}\n`);
      }
      process.stdout.write('\n● exists  ○ not present on this machine\n');
      return 0;
    }
    default:
      return fail(2, `unknown command "${cmd}"\n\n${HELP}`);
  }
}
