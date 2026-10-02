# Contributing

Thanks for helping. sidetrace is small on purpose: zero runtime dependencies, plain JavaScript with
JSDoc types checked by `tsc`.

## Setup

```bash
git clone https://github.com/Nithinfgs/sidetrace && cd sidetrace
npm install
npm run check      # lint + typecheck + tests
npm run demo       # see it work against a throwaway home directory
```

Node 20 or newer. macOS and Linux are supported; Windows is not yet.

## The easiest valuable contribution: a new watched location

Open `src/watchlist.js` and add a target. Each one has a category, a severity, and optionally
`secret: true` (contents are never read). Good candidates: other agents' config and hook files,
shell plugin managers, package manager configs, Linux desktop autostart paths.
Please add a test in `test/diff.test.js` and say in the PR which tool writes there.

Pattern checks on added lines live in `src/hints.js`. Keep them precise: a hint should explain
why a line matters, and false positives on ordinary dotfiles are worse than a missed hint.

## Ground rules

- Never print or store a secret value. Anything that captures file text must go through `redactText`.
- Collectors must degrade gracefully (missing `lsof`, no crontab, unreadable file): return nothing, don't throw.
- No runtime dependencies without a strong reason.
- Tests must be hermetic: use `test/helpers.js` to get a fake `$HOME`, never the real one.

## Pull requests

Small and focused. Describe what changed and why; conventional commit prefixes (`feat:`, `fix:`,
`docs:`, `test:`) are appreciated but not enforced.
