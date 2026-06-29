import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
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
autoApproveMaxFindings: 0
styleGuideFiles: []
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

/** User ~/.ai-review.yaml then repo file (repo overrides). */
export async function loadRepoConfig(paths: string[] = []): Promise<RepoReviewConfig> {
    const merged: RepoReviewConfig = {};
    const home = path.join(os.homedir(), '.ai-review.yaml');
    if (await fs.pathExists(home)) {
        Object.assign(merged, parseSimpleYaml(await fs.readFile(home, 'utf-8')));
    }
    const repoCandidates = paths.length > 0 ? paths : ['.ai-review.yaml', '.ai-review.yml'];
    for (const file of repoCandidates) {
        if (!(await fs.pathExists(file))) continue;
        Object.assign(merged, parseSimpleYaml(await fs.readFile(file, 'utf-8')));
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
