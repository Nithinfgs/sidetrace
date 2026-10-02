# Research notes

How sidetrace was chosen. Snapshot taken on 2026-10-02 from GitHub Trending (weekly and monthly),
Hacker News, and the READMEs of the projects below. Star counts are approximate and were read from
the pages on that date.

## What is trending

Agent infrastructure dominates. In the weekly and monthly trending lists most entries are about
running, orchestrating, remembering for, or constraining coding agents: orchestration
(`paperclipai/paperclip`, `google/ax`), memory (`vectorize-io/hindsight`), skills and plugin packs
(`alirezarezvani/claude-skills`, `tt-a1i/archify`), context-window control
(`mksglu/context-mode`), parallel worktrees (`max-sixty/worktrunk`), computer use (`trycua/cua`),
and skill security (`NVIDIA/SkillSpector`). Outside agents: local-first media tools
(`debpalash/VoiceStudio`), small terminal utilities (`pablostanley/yoinks`), and "write HTML, get
video" (`heygen-com/hyperframes`).

Hacker News in the same period keeps returning to one argument: do agent instruction files
(`AGENTS.md`) actually help, and how much context is wasted. Developer complaints cluster around
bloat, stale rules and trust in third-party skills.

## Projects studied

| Project | What it does | Why it spread | Gap |
| --- | --- | --- | --- |
| paperclipai/paperclip (~96k) | manage teams of agents: tasks, budgets, governance | one-line `npx` start, strong metaphor, local by default | answers "what should agents do", not "what did they do to my machine" |
| vectorize-io/hindsight (~45k) | agent memory | benchmark results, many integrations | needs a database to run |
| heygen-com/hyperframes (~56k) | HTML to deterministic video | agent-native authoring, playground | needs Chrome + FFmpeg |
| trycua/cua (~28k) | computer-use drivers and VMs | real bottleneck, try-now links | fragmented docs, licensing mix |
| google/ax (~13k) | agent runtime on Kubernetes | Google, three simple primitives | heavy infrastructure |
| alibaba/open-code-review (~43k) | hybrid deterministic + LLM review | production claims, benchmarks | needs an LLM provider |
| tt-a1i/archify (~76k) | agent skill that draws verifiable diagrams | video up top, live gallery | agent-dependent |
| tashfeenahmed/freellmapi (~30k) | one endpoint over free LLM tiers | removes real friction | quota-bound, no frontier models |
| pablostanley/yoinks (~3k) | terminal video downloader | zero-dependency `npx`, polished TUI | no scripting |
| debpalash/VoiceStudio (~52k) | local voice cloning and dubbing | local-first, GIFs | heavy hardware |
| mksglu/context-mode (~25k) | keeps tool output out of agent context | solves a visible pain | 17-platform hook matrix is fragile |
| NVIDIA/SkillSpector (~19k) | scans agent skills before install | NVIDIA, concrete statistics | static, pre-install only |
| max-sixty/worktrunk (~9k) | git worktree CLI for parallel agents | GIFs, short commands, Homebrew | worktree-scoped |
| seojoonkim/agentlinter and six similar | lint AGENTS.md / CLAUDE.md for stale paths | clear pain | at least seven near-identical tools |
| Arthur031221/agentleaks, jonit-dev cleaner, Notchlet | scan agent transcripts for leaked keys | real incidents | three-plus tools already |

Patterns that repeat among the winners: a one-command start with no account, a visual in the first
screen, a single sharp metaphor, local by default, and a README that shows output instead of
describing it. Patterns among the weak spots: heavy prerequisites, claims that cannot be checked,
and crowded niches where the fifth tool adds nothing.

## Ideas considered

| # | Idea | Verdict |
| --- | --- | --- |
| 1 | AGENTS.md / CLAUDE.md linter | Rejected: at least seven existing tools |
| 2 | Scanner for secrets in agent transcripts | Rejected: three-plus existing tools |
| 3 | Per-worktree port and env isolation | Rejected: several small tools exist; narrow audience |
| 4 | **Receipt of what a command changed outside the project** | **Chosen** |
| 5 | MCP tool-description pinning and diff | Maybe later: needs ongoing threat intelligence to be useful |
| 6 | Agent token and cost dashboard | Rejected: well served by existing tools |
| 7 | MCP tool-definition token cost inspector | Runner-up: useful, but narrower and needs live MCP handshakes |
| 8 | Flaky-test bisector for agent changes | Rejected: generic, hard to demo |
| 9 | Agent session replay TUI | Rejected: heavy UI, many entrants |
| 10 | `.env` drift checker across environments | Rejected: small utility, low shareability |

## Why sidetrace

- **Real, current problem.** Running code you did not write is now routine, and the existing
  tooling is either a sandbox (prevent) or a pre-install scanner (guess). I did not find a common tool that
  answers "what did it do?" for an arbitrary command (this is from a limited search, not an exhaustive one).
- **Works on day one.** No account, no API key, no model, no daemon. `npx ... demo` shows value
  in seconds, and `run -- <anything>` works on a real machine immediately.
- **Honest scope.** Compare known locations before and after. Easy to reason about, easy to extend
  (one line per location), easy to test hermetically.
- **Low maintenance, high contribution surface.** The watch list and the hint rules are small data
  tables that people who know a specific tool can improve.
