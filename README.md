# AI Code Review CLI

AI-powered code review in the terminal, built with React, Ink, Bun, and the Vercel AI SDK.

## What It Does

- Reviews staged and unstaged changes directly from git
- Scans an entire repository with static analysis plus AI deep review
- Builds a local project index on first run for cross-file review context
- Refreshes the project index incrementally as files change
- Caches file results to avoid rescanning unchanged files
- Generates PR summaries from current diffs
- Supports mouse-wheel navigation anywhere arrow-key navigation already works
- Persists provider keys, review language, UI language preference, and review tone
- Ships with a lightweight demo/docs site under [`web/`](./web)

## Supported Providers

- OpenAI
- Anthropic
- Google Gemini
- NVIDIA NIM
- OpenRouter
- Groq
- Cerebras
- Mistral
- Together
- xAI

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
bun dev
```

Or build the production bundle:

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
- Fetch and select a model
- Save provider-specific API keys
- Choose review output language
- Choose a UI language preference
- Choose a strict or balanced review tone

Configuration is stored in `~/.ai-reviewer.json`.

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
