# Production Readiness Notes

## Terminal UX

- Mouse-wheel input is translated into navigation anywhere arrow keys are already supported.
- Long views support `PgUp` and `PgDn` to reduce repetitive scrolling in larger result sets.
- Settings now reopen a real configuration wizard instead of clearing the existing API key.
- Settings include focused actions for changing only the model, provider/access type, language, or review tone.

## Configuration

- Provider definitions are centralized so adding or updating providers is no longer spread across the wizard and runtime config.
- OpenCode is available as an OpenAI-compatible provider, and `big-pickle` is the default model for fresh installs.
- Codex is available as an optional account-backed provider through the official Codex CLI login, while OpenAI API usage stays on the separate API-key provider.
- Claude Code is available as an optional account-backed provider through the official Claude Agent SDK, while Anthropic API usage stays on the separate API-key provider.
- Model fetching prefers remote provider model lists, including OpenCode in both subscription/account and API-key flows, with static fallbacks so setup does not block when discovery fails.
- Review output language, UI language preference, and review tone are persisted in the user config file.
- Provider keys are stored per provider so switching models or providers no longer destroys existing credentials.
- `.ai-review.yaml` can be generated with `ai-review init` for repo-level defaults.

## CLI Automation

- The default CLI path is now plain non-interactive review output.
- The existing Ink experience is available through `ai-review review --interactive`.
- `ai-review review --agent` emits newline-delimited JSON events for coding agents.
- `ai-review review --output json|sarif` emits final machine-readable reports for CI and code scanning.
- `ai-review review --output-file <path>` writes reports to disk without mixing progress logs into structured output.
- `ai-review review --fail-on critical|warning|info|none` controls CI failure behavior.
- `ai-review doctor` reports provider, git, and optional local tool status.

## Demo Surface

- The repository includes a lightweight static demo/docs site under `site/`.
- `bun run site:dev` serves the demo locally.
- `bun run site:build` copies the static site into `dist/site` for deployment alongside the CLI build output.
