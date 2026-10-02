#!/usr/bin/env node
import { main } from '../src/cli.js';

// quietly stop when the reader closes the pipe (e.g. `sidetrace paths | head`)
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err) => {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EPIPE') process.exit(0);
    throw err;
  });
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`sidetrace: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  },
);
