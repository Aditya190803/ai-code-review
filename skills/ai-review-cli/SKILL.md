---
name: ai-review-cli
description: Use when working with the ai-review CLI code review tool, including ai-review review, doctor, init, auth, .ai-review.yaml, review scopes, provider setup, CI output, SARIF, JSON, or agent mode.
---

# AI Review CLI

Use this skill when the user asks how to run, configure, troubleshoot, automate, or integrate this repository's `ai-review` CLI code review tool.

## What The Tool Does

`ai-review` reviews code from git using static analysis plus AI review. It supports staged, unstaged, uncommitted, committed, full-repository, base branch, and base commit review scopes.

The CLI can run in plain terminal output, interactive Ink UI mode, machine-readable JSON mode, SARIF mode for code scanning integrations, and newline-delimited agent event mode.

## Core Commands

Use these commands from a git repository:

```bash
ai-review review
ai-review review --interactive
ai-review review --agent
ai-review review --type staged
ai-review review --type unstaged
ai-review review --type uncommitted
ai-review review --type committed
ai-review review --type all
ai-review review --base main
ai-review review --base-commit <sha>
ai-review review --output json
ai-review review --output sarif --output-file ai-review.sarif
ai-review review --fail-on warning
ai-review doctor
ai-review init
ai-review auth status
ai-review auth logout
```

If running from the source repo before packaging, use:

```bash
bun dev -- review
bun dev -- doctor
bun run build
node dist/app.js review
```

## First-Time Setup

1. Confirm dependencies are installed with `bun install` in this project.
2. Run `ai-review doctor` to check git, provider configuration, model configuration, and optional static-analysis tools.
3. If credentials or model settings are missing, run `ai-review review --interactive` and complete the setup wizard.
4. For repo defaults, run `ai-review init` to create `.ai-review.yaml`.

Configuration is stored in `~/.ai-reviewer.json`. Repo-level defaults are stored in `.ai-review.yaml` or `.ai-review.yml`.

## Providers And Auth

The default provider is `opencode` with the `big-pickle` model.

Supported providers include:

- `opencode`, using `OPENCODE_API_KEY` or `AI_CODE_REVIEW_API_KEY`
- `codex`, using the official Codex CLI login from `codex login`
- `claude-code`, using the official Claude Agent SDK account authentication
- `openai`, using `OPENAI_API_KEY`
- `anthropic`, using `ANTHROPIC_API_KEY`
- `google`, using `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `openrouter`, using `OPENROUTER_API_KEY`
- `cerebras`, using `CEREBRAS_API_KEY`

Use `AI_MODEL=<model>` to override the selected model for a command when appropriate.
Use `OPENCODE_BASE_URL=<url>` to point the default provider at a proxy or gateway.

## Review Scopes

Choose the smallest scope that matches the user intent:

- Use `ai-review review` or `--type uncommitted` for current staged plus unstaged work.
- Use `--type staged` before committing only staged changes.
- Use `--type unstaged` while iterating locally before staging.
- Use `--type committed` to review the latest committed changes.
- Use `--base main` for branch-versus-base review, such as before opening a PR.
- Use `--base-commit <sha>` for review against a specific commit.
- Use `--type all` for full repository scans, usually after initial setup or large refactors.

## Output Modes

Use plain output for humans:

```bash
ai-review review --base main
```

Use JSON for scripts and bots:

```bash
ai-review review --base main --output json --output-file review.json
```

Use SARIF for code scanning tools:

```bash
ai-review review --base main --output sarif --output-file ai-review.sarif
```

Use `--agent` when another automation layer wants streaming event objects. In agent mode, the CLI emits JSON lines with event types such as `status`, `finding`, and `complete`.

## Failure Thresholds

`--fail-on` controls the process exit code for CI.

Supported threshold values are:

- `critical`
- `warning`
- `info`
- `none`

Examples:

```bash
ai-review review --base main --fail-on critical
ai-review review --base main --fail-on warning
ai-review review --base main --fail-on none
```

Use `--fail-on none` when the review should report findings without blocking the job.

## Repo Config

Run this to create the default config:

```bash
ai-review init
```

The generated `.ai-review.yaml` can define defaults such as:

```yaml
reviewProfile: assertive
severityThreshold: info
failOn: critical
provider: opencode
model: big-pickle
output: plain
ignoredPaths:
  - dist/**
  - node_modules/**
guidelineFiles:
  - AGENTS.md
  - CLAUDE.md
  - .cursorrules
  - .github/copilot-instructions.md
enabledTools:
  - typescript
  - eslint
  - gitleaks
webSearch: false
mcp: false
```

Use `--config <path>` to load a specific config file:

```bash
ai-review review --config .ai-review.yaml
```

## CI Pattern

For pull request CI, prefer branch-versus-base review with SARIF or JSON output:

```bash
ai-review doctor
ai-review review --base main --output sarif --output-file ai-review.sarif --fail-on warning
```

For non-blocking CI comments or artifacts:

```bash
ai-review review --base main --output json --output-file ai-review.json --fail-on none
```

## Troubleshooting

If the tool reports missing credentials, check the relevant provider environment variable or run `ai-review review --interactive`.

If the provider ping fails, run `ai-review doctor` and verify the provider, model, API key, and network access.

If no files are reviewed, check that the selected git scope has matching code changes and that `.ai-review.yaml` `ignoredPaths` does not exclude them.

If SARIF or JSON output is needed in a file, always include `--output-file <path>`.

If reviewing from source, run `bun run build` after CLI code changes before using `node dist/app.js`.

## Agent Guidance

When helping a user with this CLI:

1. Inspect `ai-review doctor` output first for setup or auth issues.
2. Prefer repo config via `ai-review init` when the user wants repeatable defaults.
3. Prefer `--base main` for PR-style review and `--type staged` for pre-commit review.
4. Prefer `--output sarif --output-file ...` for code scanning integrations.
5. Prefer `--output json --output-file ...` for custom scripts and bots.
6. Use `--agent` only for automation that consumes streaming JSON events.
