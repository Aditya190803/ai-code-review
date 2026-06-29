import * as fs from 'fs-extra';
import type { RepoReviewConfig } from './types.js';

const DEFAULT_REPO_CONFIG = `.ai-review.yaml
# AI Code Review configuration
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
customRules: []
reviewMemory: true
enabledTools:
  - typescript
  - eslint
  - gitleaks
webSearch: false
mcp: false
`;

function parseScalar(value: string): unknown {
    const trimmed = value.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === '') return '';
    return trimmed.replace(/^['"]|['"]$/g, '');
}

export function parseSimpleYaml(input: string): RepoReviewConfig {
    const config: Record<string, unknown> = {};
    let activeListKey: string | null = null;

    for (const rawLine of input.split('\n')) {
        const withoutComment = rawLine.replace(/\s+#.*$/, '');
        if (!withoutComment.trim()) continue;

        const listMatch = withoutComment.match(/^\s*-\s+(.+)$/);
        if (listMatch && activeListKey) {
            const list = config[activeListKey];
            if (Array.isArray(list)) {
                list.push(String(parseScalar(listMatch[1])));
            }
            continue;
        }

        const keyValueMatch = withoutComment.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
        if (!keyValueMatch) continue;

        const key = keyValueMatch[1];
        const value = keyValueMatch[2];

        if (value.trim() === '') {
            config[key] = [];
            activeListKey = key;
        } else {
            config[key] = parseScalar(value);
            activeListKey = null;
        }
    }

    return config as RepoReviewConfig;
}

export async function loadRepoConfig(paths: string[] = []): Promise<RepoReviewConfig> {
    const candidates = paths.length > 0 ? paths : ['.ai-review.yaml', '.ai-review.yml'];
    const merged: RepoReviewConfig = {};

    for (const file of candidates) {
        if (!(await fs.pathExists(file))) continue;
        const parsed = parseSimpleYaml(await fs.readFile(file, 'utf-8'));
        Object.assign(merged, parsed);
    }

    return merged;
}

export async function initRepoConfig(file = '.ai-review.yaml'): Promise<boolean> {
    if (await fs.pathExists(file)) {
        return false;
    }

    await fs.writeFile(file, DEFAULT_REPO_CONFIG.replace(/^\.ai-review\.yaml\n/, ''));
    return true;
}
