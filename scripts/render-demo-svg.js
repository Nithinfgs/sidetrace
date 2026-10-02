#!/usr/bin/env node
/* eslint-disable no-control-regex -- parsing ANSI escape sequences */
// Renders the receipt from `sidetrace demo` into docs/assets/demo.svg.
// The image is generated from real tool output, not drawn by hand: rerun
// `npm run render:demo` after changing the report format.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runDemo } from '../src/demo.js';
import { renderTerminal } from '../src/report/terminal.js';

const COLORS = { 31: '#ff7b72', 32: '#7ee787', 33: '#e3b341', 36: '#79c0ff', 90: '#8b949e' };
const FG = '#e6edf3';
const BG = '#0d1117';
const CHAR_W = 7.8;
const LINE_H = 19;
const PAD = 22;
const TOP = 46;

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Convert one line of SGR-coloured text into <tspan>s. */
function toTspans(/** @type {string} */ line) {
  let bold = false;
  let color = FG;
  let out = '';
  let last = 0;
  const flush = (/** @type {string} */ text) => {
    if (!text) return;
    out += `<tspan fill="${color}"${bold ? ' font-weight="700"' : ''}>${esc(text)}</tspan>`;
  };
  for (const m of line.matchAll(/\x1b\[([0-9;]*)m/g)) {
    flush(line.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    for (const code of m[1].split(';')) {
      if (code === '0' || code === '') {
        bold = false;
        color = FG;
      } else if (code === '1') bold = true;
      else if (COLORS[/** @type {keyof typeof COLORS} */ (Number(code))]) color = COLORS[/** @type {keyof typeof COLORS} */ (Number(code))];
    }
  }
  flush(line.slice(last));
  return out;
}

const report = await runDemo();
const prompt = `\x1b[90m$\x1b[0m \x1b[1msidetrace run\x1b[0m -- npx sketchy-cli install`;
const lines = [prompt, ...renderTerminal(report, { color: true }).split('\n')];
// the run duration varies; pin it so regenerating the image does not create diff noise
const stable = lines.map((l) => l.replace(/ · \d+\.\d+s/, ' · 0.8s'));

const plain = stable.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ''));
const width = Math.ceil(Math.max(...plain.map((l) => l.length)) * CHAR_W + PAD * 2);
const height = TOP + stable.length * LINE_H + PAD;

const body = stable
  .map((l, i) => `<text x="${PAD}" y="${TOP + i * LINE_H}" xml:space="preserve">${toTspans(l)}</text>`)
  .join('\n  ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="sidetrace receipt: a command that appended to .zshrc, added a LaunchAgent, an SSH key, an agent hook and a background listener">
  <rect width="${width}" height="${height}" rx="10" fill="${BG}"/>
  <circle cx="22" cy="20" r="6" fill="#ff5f56"/><circle cx="42" cy="20" r="6" fill="#ffbd2e"/><circle cx="62" cy="20" r="6" fill="#27c93f"/>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" font-size="13">
  ${body}
  </g>
</svg>
`;

const out = fileURLToPath(new URL('../docs/assets/demo.svg', import.meta.url));
await fs.writeFile(out, svg);
console.log(`wrote ${out} (${(svg.length / 1024).toFixed(1)} KB)`);
