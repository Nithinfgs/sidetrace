# Changelog

## 0.1.0

First release.

- `sidetrace run -- <command>`: snapshot before and after, print a receipt.
- `sidetrace start` / `sidetrace end` for sessions you run by hand (an editor, an interactive agent).
- Watches shell startup files, LaunchAgents/systemd/autostart, SSH, cloud and registry credentials,
  agent config and hooks (Claude Code, Codex, Cursor, Gemini, MCP), PATH directories, `/etc/hosts`,
  crontab, new listening ports, and processes that outlive the command.
- Project directory summary, with git hooks, CI workflows and agent files called out.
- Terminal, JSON and Markdown receipts; `--fail-on` for CI.
- `sidetrace demo`: safe demonstration against a throwaway home directory.
