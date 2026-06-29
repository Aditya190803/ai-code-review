# Feature Comparison: ai-review CLI vs CodeRabbit, Greptile, Macroscope

> Generated: 2026-06-29 — Core features only (no enterprise billing/management/admin).

## Legend

| Icon | Meaning |
|------|---------|
| ✅ | Supported |
| 🟡 | Partial / limited support |
| ❌ | Not supported |
| — | Not applicable / no info |

---

## Review Fundamentals

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| CLI-based code review | ✅ | ✅ | ✅ | 🟡 (GitHub-focused, CLI is minimal) |
| PR-based review (GitHub/GitLab) | ❌ | ✅ | ✅ | ✅ |
| Inline PR comments | ❌ | ✅ | ✅ | ✅ |
| Check run integration | ❌ | ✅ | ✅ | ✅ |
| Review scopes (staged/uncommitted/committed) | ✅ | ✅ | 🟡 (branch-based) | ❌ |
| Base branch vs HEAD review | ✅ | ✅ | ✅ | — |
| Full repository scan | ✅ | ✅ | ✅ | ✅ |
| Static analysis (regex/pattern) | ✅ | ✅ | — | ✅ |
| Multi-file concurrent scanning | ✅ | ✅ | ✅ | ✅ |
| Incremental review (auto re-review on push) | ❌ | ✅ | ✅ | ✅ |
| Per-file caching | ✅ | ✅ | ✅ | — |

## AI & Analysis Depth

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| AI deep scan per file | ✅ | ✅ | ✅ | ✅ |
| Project index (symbols, imports, deps) | ✅ | ✅ | ✅ | ✅ |
| Codebase graph (function-level call graph) | ❌ | 🟡 (limited) | ✅ | ✅ |
| Cross-file context awareness | 🟡 (dependency-based) | ✅ | ✅ | ✅ |
| AST-based deep analysis per language | ❌ | 🟡 (ast-grep) | ❌ | ✅ |
| Cross-repo context (Repo Clusters) | ❌ | ❌ | ✅ | ❌ |
| Web search during review | 🟡 (config option, not functional) | 🟡 (config option) | — | ✅ |
| Pattern consistency checks (codebase-wide) | ❌ | 🟡 | ✅ | ✅ |
| Impact analysis (find all callers) | ❌ | 🟡 | ✅ | ✅ |

## Output & Reporting

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| Plain terminal output | ✅ | ✅ | ✅ | ❌ |
| Interactive TUI | ✅ | ✅ | ✅ | ❌ |
| JSON output | ✅ | ✅ | ✅ | — |
| SARIF output | ✅ | ✅ | — | — |
| Agent/event-streaming mode | ✅ | ✅ | ✅ | — |
| PR walkthrough summary | ❌ | ✅ | ✅ | ✅ |
| Categorized findings (bug/security/perf/etc.) | ✅ | ✅ | ✅ | ✅ |
| Severity levels | critical/warning/info | critical/warning/info | high/medium/low | critical/high/medium/low |
| Diff-inline findings | ❌ | ✅ | ✅ | ✅ |

## Customization & Configuration

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| Repo-level YAML config | ✅ | ✅ | ✅ | ✅ |
| Path-based review instructions (glob scoped) | ❌ | ✅ | ✅ | ✅ |
| Custom rules (plain language) | ❌ | 🟡 (path instructions) | ✅ | ✅ |
| Upload style guides as review context | ❌ | ✅ | ✅ | ✅ |
| Config inheritance (org→repo→dir) | ❌ | ✅ | ✅ | ❌ |
| Per-directory cascading rules | ❌ | ❌ | ✅ (.greptile/) | ❌ |
| Ignored paths / file exclusions | ✅ | ✅ | ✅ | ✅ |
| Custom instruction files per path | ❌ | ✅ | ✅ | ✅ |
| Review tone / strictness control | ✅ | ✅ | ✅ | 🟡 |
| Severity/fail-on thresholds | ✅ | ✅ | ✅ | ✅ |

## Fix & Apply

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| Suggested fix text in findings | ✅ | ✅ | ✅ | ✅ |
| One-click apply fix | ❌ | ✅ (commit to PR or stacked PR) | ✅ (via MCP/IDE) | ✅ (Fix It For Me) |
| Auto-create PR with fixes | ❌ | ✅ (stacked PR) | ❌ | ✅ (branch + PR) |
| Resolve merge conflicts | ❌ | ✅ | — | — |
| Auto-generate unit tests | ❌ | ✅ | ❌ | ❌ |
| Auto-generate docstrings | ❌ | ✅ | ❌ | ❌ |
| Simplify code | ❌ | ✅ | ❌ | ❌ |
| Custom finishing-touch recipes | ❌ | ✅ | — | — |
| Fix from IDE (MCP) | ❌ | 🟡 | ✅ | ❌ |

## Learning & Memory

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| Team learning (adjusts over time) | ❌ | 🟡 (learnings for paid) | ✅ | ✅ |
| Reaction-based training (👍/👎) | ❌ | ❌ | ✅ | ✅ |
| Adaptive noise filtering (learns nitpick level) | ❌ | ❌ | ✅ | ✅ |
| Auto-discovers custom rules from team | ❌ | ❌ | ✅ | ✅ |
| Pattern repositories (share learnings across repos) | ❌ | ❌ | ✅ | ❌ |
| Commit history analysis for learning | ❌ | ✅ | ✅ | — |

## IDE & Agent Integration

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| MCP server | ❌ | ✅ (Claude Code plugin) | ✅ | ❌ |
| VS Code integration | ❌ | ✅ (extension) | ✅ (MCP) | ❌ |
| Cursor integration | ❌ | ✅ | ✅ (MCP) | ❌ |
| Claude Code native plugin | ❌ | ✅ | ✅ (MCP) | ❌ |
| Codex CLI integration | ❌ | ✅ | ✅ (MCP) | ❌ |
| Slack agent | ❌ | ❌ | ❌ | ✅ |
| Chat interface for review follow-up | ❌ | ✅ | ✅ | ✅ |
| Codebase-aware assistant | ❌ | 🟡 | 🟡 | ✅ |

## Code Review Automation

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| Auto-review on PR open | ❌ | ✅ | ✅ | ✅ |
| Auto-review on push | ❌ | ✅ | ✅ | ✅ |
| Draft PR support | ❌ | ✅ | ✅ | ✅ |
| Label-based review triggers | ❌ | ✅ | ✅ | ✅ |
| Author-based exclusions (bots, etc.) | ❌ | ✅ | ✅ | ✅ |
| Auto-pause after N commits | ❌ | ✅ | — | — |
| Manual review trigger (comment) | ❌ | ✅ | ✅ | ✅ |
| Custom Check Run Agents | ❌ | ❌ | ❌ | ✅ |
| Auto-approve low-risk PRs | ❌ | 🟡 | ✅ | ✅ |
| Custom approvability rules | ❌ | ❌ | — | ✅ |

## Analytics & Visibility

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| Web dashboard | ❌ | ✅ | ✅ | ✅ |
| Review metrics / analytics | ❌ | ✅ | ✅ | ✅ |
| Addressed-rate tracking | ❌ | ✅ | ✅ | ✅ |
| Developer activity reports | ❌ | ✅ | ❌ | — |
| Productivity insights | ❌ | ❌ | ❌ | ✅ |
| Sprint reports | ❌ | ❌ | ❌ | ✅ |

## Provider & Model Flexibility

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| Multi-provider support | ✅ (10 providers) | ❌ (own) | ❌ (own, with LLM config for self-host) | 🟡 (auto-tune multi-model) |
| Configurable model per provider | ✅ | ❌ | 🟡 (self-host) | 🟡 (Check Run Agents) |
| Auto-tune (best model per language) | ❌ | ❌ | ❌ | ✅ |

## Languages Supported

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| TypeScript/JavaScript | ✅ | ✅ | ✅ | ✅ |
| Python | ✅ | ✅ | ✅ | ✅ |
| Go | ✅ | ✅ | ✅ | ✅ |
| Rust | ✅ | ✅ | ✅ | ✅ |
| Java | ✅ | ✅ | ✅ | ✅ |
| C/C++ | ✅ | ✅ | ✅ | ✅ |
| Kotlin | ❌ | ✅ | ✅ | ✅ |
| Swift | ❌ | ✅ | ✅ | ✅ |
| Ruby | ❌ | ✅ | ✅ | ✅ |
| PHP | ✅ | ✅ | ✅ | — |
| Vue.js | ❌ | ✅ | ✅ | ✅ |
| Shell | ✅ | ✅ | ✅ | — |
| Elixir | ❌ | ❌ | ❌ | ✅ |
| Starlark | ❌ | ❌ | ❌ | ✅ |

## Internationalization

| Feature | ai-review CLI | CodeRabbit | Greptile | Macroscope |
|---------|:------------:|:----------:|:--------:|:----------:|
| Multi-language review output | ✅ (10 languages) | ❌ | ❌ | ❌ |
| Multi-language UI | ✅ | ❌ | ❌ | ❌ |

---

## Key Gaps Summary — What To Build Next

### Tier 1 — Biggest impact gaps (present in 2+ competitors)

| # | Feature | Why it matters | Present in |
|---|---------|---------------|------------|
| 1 | **PR integration** (GitHub/GitLab checks, inline comments, auto-review on PR events) | Turns CLI tool into a CI-native reviewer that works in team PR workflows | All three |
| 2 | **Learning/memory system** (adapts to team feedback, suppresses noise) | Without this, every review is a cold start; no signal improvement over time | Greptile, Macroscope |
| 3 | **Auto-fix PRs / fix application** (apply suggested fixes automatically) | Saves developer time — the most requested productivity feature | All three |
| 4 | **Custom rules & instructions** (glob-scoped, path-based review guidance) | Teams need to enforce domain-specific standards per directory | All three |
| 5 | **IDE integration** (MCP server or VS Code extension) | Reviews need to surface where developers work | CodeRabbit, Greptile |
| 6 | **Web dashboard** (metrics, review history, addressed-rate tracking) | Without data, teams can't measure improvement | All three |

### Tier 2 — Differentiators

| # | Feature | Why it matters | Present in |
|---|---------|---------------|------------|
| 7 | **Graph-based codebase understanding** (function-level call graph) | Catches cross-file breakage that file-level index misses | Greptile, Macroscope |
| 8 | **Codebase-aware chat assistant** (ask "how does auth work?") | Broader tool than just review — developer productivity agent | Macroscope (deep), CodeRabbit/Greptile (limited) |
| 9 | **AST-based analysis per language** (vs regex) | Catches language-specific bugs regex can't | Macroscope, CodeRabbit (ast-grep) |
| 10 | **Auto-approval for low-risk PRs** | Reduces team review burden | Greptile, Macroscope |
| 11 | **Cross-repo context** | Essential for microservice monorepo setups | Greptile |
| 12 | **Finishing touches** (auto docstrings, tests, simplify, merge conflict resolution) | Polishes PRs without human effort | CodeRabbit |

### Tier 3 — Nice-to-haves

| # | Feature | Present in |
|---|---------|------------|
| 13 | Check Run Agents (custom agents per check) | Macroscope |
| 14 | Pattern repositories (share learnings across repos) | Greptile |
| 15 | Style guide upload as review context | All three |
| 16 | Config inheritance (org → team → repo → dir) | CodeRabbit, Greptile |
| 17 | Draft PR support | All three |
| 18 | Label-based review triggers | All three |
| 19 | PR summary/walkthrough auto-generation | CodeRabbit, Macroscope |
| 20 | Commit summary feed | Macroscope |

---

## What ai-review CLI Already Does Well

- **Multi-provider flexibility** — 10 providers; competitors lock you into their own infra
- **CLI-first design** — no signup needed to run a review locally
- **Triage system** — score-based skip for clean files (unique approach)
- **i18n** — 10 review languages, no competitor offers this
- **Multiple review scopes** — staged/unstaged/committed/uncommitted/all (most granular)
- **Output modes** — plain, JSON, SARIF, agent event stream
- **Open-source** — can be extended, forked, self-hosted freely
- **Ink-based interactive TUI** — polished terminal UI with mouse support
