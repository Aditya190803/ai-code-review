import * as fs from 'fs-extra';
import type { PathInstruction, RepoReviewConfig } from './types.js';

const DEFAULT_INSTRUCTIONS_FILE = '.ai-review/path-instructions.json';
const MAX_GUIDELINE_BYTES = 48_000;
const MAX_PATH_INSTRUCTION_CHARS = 8_000;

function globToRegExp(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '::DOUBLE_STAR::')
        .replace(/\*/g, '[^/]*')
        .replace(/::DOUBLE_STAR::/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
}

function pathMatches(filePath: string, pattern: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return globToRegExp(pattern).test(normalized);
}

export async function loadGuidelineText(paths: string[] = []): Promise<string> {
    const chunks: string[] = [];

    for (const rel of paths) {
        if (!(await fs.pathExists(rel))) continue;
        try {
            const stat = await fs.stat(rel);
            if (!stat.isFile() || stat.size > MAX_GUIDELINE_BYTES) continue;
            const text = (await fs.readFile(rel, 'utf-8')).trim();
            if (text) chunks.push(`--- ${rel} ---\n${text}`);
        } catch {
            // skip unreadable guidelines
        }
    }

    return chunks.join('\n\n');
}

export async function loadPathInstructionsFile(filePath = DEFAULT_INSTRUCTIONS_FILE): Promise<PathInstruction[]> {
    if (!(await fs.pathExists(filePath))) return [];

    try {
        const raw = await fs.readJson(filePath) as unknown;
        if (!Array.isArray(raw)) return [];

        return raw
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return null;
                const pathValue = (entry as { path?: unknown }).path;
                const instructions = (entry as { instructions?: unknown }).instructions;
                if (typeof pathValue !== 'string' || typeof instructions !== 'string') return null;
                return {
                    path: pathValue,
                    instructions: instructions.slice(0, MAX_PATH_INSTRUCTION_CHARS),
                };
            })
            .filter(Boolean) as PathInstruction[];
    } catch {
        return [];
    }
}

export function pathInstructionsForFile(filePath: string, rules: PathInstruction[]): string {
    const matched = rules
        .filter((rule) => pathMatches(filePath, rule.path))
        .map((rule) => rule.instructions.trim())
        .filter(Boolean);

    if (matched.length === 0) return '';
    return matched.join('\n\n');
}

export interface ReviewContextBundle {
    globalGuidelines: string;
    pathInstructions: PathInstruction[];
    customRules: string[];
}

export async function buildReviewContextBundle(repoConfig: RepoReviewConfig): Promise<ReviewContextBundle> {
    const instructionsFile = repoConfig.pathInstructionsFile || DEFAULT_INSTRUCTIONS_FILE;
    const fromFile = await loadPathInstructionsFile(instructionsFile);
    const pathInstructions = [...(repoConfig.pathInstructions || []), ...fromFile];

    return {
        globalGuidelines: await loadGuidelineText(repoConfig.guidelineFiles || []),
        pathInstructions,
        customRules: (repoConfig.customRules || []).map((r) => String(r).trim()).filter(Boolean),
    };
}

export function formatReviewContextForPrompt(
    filePath: string,
    bundle: ReviewContextBundle,
): string {
    const parts: string[] = [];

    if (bundle.customRules.length > 0) {
        parts.push('Team rules (must enforce when applicable):');
        parts.push(bundle.customRules.map((r, i) => `${i + 1}. ${r}`).join('\n'));
    }

    if (bundle.globalGuidelines) {
        parts.push('Repository guidelines:');
        parts.push(bundle.globalGuidelines);
    }

    const scoped = pathInstructionsForFile(filePath, bundle.pathInstructions);
    if (scoped) {
        parts.push(`Path-specific instructions for ${filePath}:`);
        parts.push(scoped);
    }

    return parts.join('\n\n');
}