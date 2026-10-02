# Security policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting ("Security" tab, "Report a vulnerability").
Do not open a public issue for something exploitable. You should get a first reply within a week.

## What counts

sidetrace reads files, runs `ps`, `lsof`/`ss` and `crontab -l`, and prints what it found. The issues
we care most about:

- **Secret exposure**: a credential value reaching a receipt, a saved snapshot, or JSON/Markdown output.
- **Unsafe file handling**: a crafted file or symlink in a watched location causing writes or reads
  outside what sidetrace documents.
- **Command injection** through arguments, config, or snapshot names.

## What sidetrace is not

sidetrace is an auditing aid, not a sandbox and not a malware detector. It cannot see network
traffic, kernel-level changes, or anything outside its [watch list](README.md#what-it-watches).
A clean receipt does not prove a command is safe.

## Handling of sensitive data

- Files in credential locations (`~/.ssh`, `~/.aws`, `~/.npmrc`, ...) are hashed, never stored or printed.
- Other captured text passes through `src/redact.js` before it is held in a snapshot.
- Snapshots saved by `sidetrace start` are written with mode `0600` in a `0700` directory.
