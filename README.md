# AI Code Review CLI

A lightning-fast, interactive Terminal User Interface (TUI) that brings AI-powered, context-aware code reviews directly into your terminal. Built with React (Ink), Bun, and the Vercel AI SDK.

## Key Features

- **Blazing Fast Scans**: Seamlessly blends instant regex-based Static Analysis (for common bugs) with deep LLM heuristic reviews.
- **Incremental Caching**: Only analyzes lines of code that have actually changed since your last scan using SHA-256 caching. Repeated scans are near-instant.
- **Git Diff Engine**: Only sends the exact diffs to the LLM when possible, saving drastic amounts of tokens, time, and API cost.
- **PR Summaries**: Automatically pulls your staged and unstaged `git diff`s to generate perfectly formatted Pull Request summaries (Features, Fixes, Refactors) directly to your clipboard.
- **AST Extraction**: Automatically skips huge boilerplate blocks, focusing the AI only on meaningful code logic via `ts-morph` AST extraction.
- **Sleek TUI**: No emojis—strictly a professional, deeply interactive dashboard with full mouse-scroll support, text selection, and native terminal keybinds.

## Installation

### Prerequisites
- [Bun](https://bun.sh/) (Required runtime)

### Quick Install (Recommended)

Run the included install script to automatically clone the repository, install dependencies, and securely link the executable (`ai-review`) to your global path:

```bash
curl -fsSL https://raw.githubusercontent.com/Aditya190803/ai-code-review/main/install.sh | bash
```

### Manual Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Aditya190803/ai-code-review.git
   cd ai-code-review
   ```
2. Install dependencies:
   ```bash
   bun install
   ```
3. Copy the binary to your path (or simply run via `bun run app.tsx`):
   ```bash
   bun run build
   # Optional: link the built source to your binary path
   ```

## Usage

Simply navigate to any local Git repository in your terminal and run:

```bash
ai-review
```

Or, if running from source:

```bash
bun dev
# (or `bun run app.tsx`)
```

### Setup & Onboarding
On your very first run, the interactive onboarding wizard will automatically display. You will be prompted to select your preferred AI provider (e.g., OpenAI, Anthropic, Google, Groq, OpenRouter) and securely enter your API key, which is saved locally to a `.env` file for future runs.

## Configuration

### Ignoring Files
If you have massive generated files or specific directories you don't want the AI analyzing, simply create an `.ai-reviewignore` file at the root of your project directory. It works exactly like a `.gitignore`:

```text
# .ai-reviewignore
dist/
node_modules/
*.test.ts
__snapshots__/
src/generated/
```

### Changing Settings
To switch AI providers or models at any time, just select **Settings** from the main dashboard inside the CLI.

## Development

To contribute or run locally in watch mode:

```bash
# Start development server
bun dev

# Run static typechecks
bun run lint

# Build production bundle
bun run build
```

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Framework:** React / [Ink](https://github.com/vadimdemedes/ink) (Terminal UI)
- **AI Integration:** Vercel AI SDK
- **Git Integration:** `simple-git`
- **AST Parsing:** `ts-morph`

## License

MIT License. Open source and ready to improve your workflow.
