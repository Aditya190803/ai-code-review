# AI Code Review CLI

AI-powered code review in the terminal, built with React, Ink, Bun, and the Vercel AI SDK.

## What It Does

- Reviews staged and unstaged changes directly from git in plain, interactive, or agent JSON mode
- Scans an entire repository with static analysis plus AI deep review
- Builds a local project index on first run for cross-file review context
- Refreshes the project index incrementally as files change
- Caches file results to avoid rescanning unchanged files
- Generates PR summaries from current diffs
- Supports review scopes for staged, unstaged, uncommitted, committed, full-repo, base branch, and base commit reviews
- Applies team guidelines (`AGENTS.md`, etc.), custom rules, and glob-scoped path instructions from `.ai-review/`
- Learns from local feedback (`ai-review feedback --down`) to suppress repeated noise via `.ai-review-memory.json`
- Outputs GitHub PR comment markdown (`--output github`) and diff-inline findings (`--diff`)
- Ships with repo-level `.ai-review.yaml` initialization and local diagnostics through `doctor`
- Optional GitHub Actions workflow (`.github/workflows/ai-review.yml`) for PR comments
- Supports mouse-wheel navigation anywhere arrow-key navigation already works
- Persists provider keys, review language, UI language preference, and review tone
- Ships with a lightweight demo/docs site under [`web/`](./web)

## Supported Providers

- OpenCode (`big-pickle` is the default model)
- OpenAI Codex through the official Codex CLI ChatGPT login
- OpenAI API
- Claude Code through the official Claude Agent SDK
- Anthropic API
- Google Gemini
- OpenRouter
- Cerebras

## Supported Review Languages

- English
- Hindi
- Spanish
- French
- German
- Japanese
- Chinese (Simplified)
- Portuguese (Brazil)
- Korean
- Russian

## Supported Programming Languages

- JavaScript (`.js`, `.jsx`, `.mjs`, `.cjs`)
- TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`)
- Python
- Go
- Java
- Rust
- C
- C++
- Shell

Framework projects built on JavaScript and TypeScript are supported through the same source-file scanning flow, including React, Next.js, Node.js, and similar ecosystems.

## Installation

### Prerequisites

- [Bun](https://bun.sh/)

### Local Setup

```bash
git clone https://github.com/Aditya190803/ai-code-review.git
cd ai-code-review
bun install
```

### Run The CLI

```bash
bun dev -- review
```

The default review command runs in plain terminal mode for staged/unstaged changes:

```bash
ai-review review
```

Useful modes:

```bash
ai-review review --interactive
ai-review review --agent
ai-review review --type staged
ai-review review --type all
ai-review review --base main
ai-review review --base-commit <sha>
ai-review review --base main --output json
ai-review review --base main --output sarif --output-file ai-review.sarif
ai-review review --fail-on warning
ai-review doctor
ai-review init
ai-review auth status
```

Build the production bundle:

```bash
bun run build
node dist/app.js
```

## Terminal Navigation

- `↑` / `↓`: Navigate lists and scroll content
- Mouse wheel: Mirrors arrow-key vertical navigation
- `PgUp` / `PgDn`: Jump through long issue lists and reports
- `Enter`: Select
- `Esc`: Go back
- `Ctrl+C`: Exit

## Configuration

On first run, the setup wizard lets you:

- Choose a provider
- Fetch and select a model, with remote model lists for OpenCode and static fallbacks when discovery is unavailable
- Save provider-specific API keys
- Choose review output language
- Choose a UI language preference
- Choose a strict or balanced review tone

After setup, the Settings screen lets you change only the model, provider, language, or tone without replaying the entire wizard.

Configuration is stored in `~/.ai-reviewer.json`.

The CLI defaults to OpenCode with the `big-pickle` model. Set `OPENCODE_API_KEY` or `AI_CODE_REVIEW_API_KEY`, or run:

```bash
ai-review review --interactive
```

Codex is optional and uses your existing official Codex CLI login:

```bash
codex login
```

Claude Code account access is optional and uses the official `@anthropic-ai/claude-agent-sdk`. API-key providers remain available separately for OpenAI, Anthropic, Gemini, OpenRouter, and Cerebras.

Create a repo config:

```bash
ai-review init
```

## Project Indexing

The first time you run the reviewer in a repository, it builds a local project index in the repo root. The index captures structural metadata such as symbols, imports, local dependencies, and related files so future scans can reason about cross-file impact more accurately.

After the initial build, the index is refreshed incrementally as files change.

## Demo And Docs Site

Run the local site:

```bash
bun run web:dev
```

Build the web app:

```bash
bun run web:build
```

## Development

```bash
bun run lint
bun test
```

Production notes live in [`docs/PRODUCTION.md`](./docs/PRODUCTION.md).
