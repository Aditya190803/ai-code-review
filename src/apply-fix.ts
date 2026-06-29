import * as fs from 'fs-extra';
import { generateText } from 'ai';
import { getModel } from './config.js';
import type { AppConfig, ScanIssue } from './types.js';

export interface ApplyFixResult {
    file: string;
    applied: boolean;
    message: string;
}

function extractCodeBlock(text: string): string | null {
    const fenced = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (fenced) return fenced[1].trimEnd();
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.includes('\n')) return trimmed;
    return null;
}

async function patchFileWithModel(
    config: AppConfig,
    filePath: string,
    issue: ScanIssue,
    dryRun: boolean,
): Promise<ApplyFixResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const prompt = [
        'You are a code editor. Apply ONE fix to the file below.',
        'Return ONLY the full updated file content in a single fenced code block.',
        'Do not omit lines. Do not add commentary outside the fence.',
        '',
        `File: ${filePath}`,
        `Issue: ${issue.title}`,
        issue.description,
        issue.suggestedFix ? `Suggested fix: ${issue.suggestedFix}` : '',
        issue.aiPrompt ? `Instructions: ${issue.aiPrompt}` : '',
        '',
        '--- FILE START ---',
        content,
        '--- FILE END ---',
    ].filter(Boolean).join('\n');

    const model = getModel(config);
    const { text } = await generateText({ model, prompt, maxOutputTokens: 16_000 });
    const next = extractCodeBlock(text);
    if (!next) {
        return { file: filePath, applied: false, message: 'Model did not return a parseable file body.' };
    }
    if (dryRun) {
        return { file: filePath, applied: false, message: `Dry-run: would write ${next.length} chars.` };
    }
    await fs.writeFile(filePath, next.endsWith('\n') ? next : `${next}\n`, 'utf-8');
    return { file: filePath, applied: true, message: 'File updated.' };
}

export async function applyFixForIssue(
    config: AppConfig,
    issue: ScanIssue,
    opts: { dryRun?: boolean } = {},
): Promise<ApplyFixResult> {
    if (!(await fs.pathExists(issue.file))) {
        return { file: issue.file, applied: false, message: 'File not found.' };
    }
    return patchFileWithModel(config, issue.file, issue, opts.dryRun === true);
}

export async function applyFixesFromSnapshot(
    config: AppConfig,
    issues: ScanIssue[],
    opts: { max?: number; dryRun?: boolean; minSeverity?: string } = {},
): Promise<ApplyFixResult[]> {
    const rank: Record<string, number> = { info: 1, warning: 3, critical: 4 };
    const min = rank[opts.minSeverity || 'warning'] || 3;
    const sorted = [...issues]
        .filter((i) => (rank[i.severity] || 1) >= min)
        .sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0));
    const slice = sorted.slice(0, opts.max ?? 3);
    const results: ApplyFixResult[] = [];
    for (const issue of slice) {
        results.push(await applyFixForIssue(config, issue, { dryRun: opts.dryRun }));
    }
    return results;
}