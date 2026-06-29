import * as fs from 'fs-extra';
import type { ScanIssue } from './types.js';

const DEFAULT_CONTEXT = 3;

export async function renderIssueWithDiffContext(
    issue: ScanIssue,
    contextLines = DEFAULT_CONTEXT,
): Promise<string> {
    let lines: string[] = [];
    try {
        const content = await fs.readFile(issue.file, 'utf-8');
        lines = content.split('\n');
    } catch {
        return formatIssueHeader(issue);
    }

    const start = Math.max(0, (issue.line || 1) - 1 - contextLines);
    const end = Math.min(lines.length, (issue.lineEnd || issue.line || 1) + contextLines);
    const slice = lines.slice(start, end);

    const numbered = slice.map((line, idx) => {
        const lineNo = start + idx + 1;
        const marker = lineNo >= issue.line && lineNo <= (issue.lineEnd || issue.line) ? '>' : ' ';
        return `${marker} ${String(lineNo).padStart(5)} | ${line}`;
    });

    return [
        formatIssueHeader(issue),
        '',
        ...numbered,
        issue.suggestedFix ? `\nSuggested fix:\n${issue.suggestedFix}` : '',
    ].filter(Boolean).join('\n');
}

function formatIssueHeader(issue: ScanIssue): string {
    const loc = `${issue.file}:${issue.line}`;
    return `[${issue.severity}] ${issue.title} (${loc}) — ${issue.category}`;
}

export async function renderDiffReview(
    issues: ScanIssue[],
    durationSecs: number,
    files: string[],
): Promise<string> {
    const header = [
        `AI Code Review (${durationSecs}s) — ${issues.length} finding(s) across ${files.length} file(s)`,
        '',
    ].join('\n');

    const blocks = await Promise.all(
        issues.map((issue, i) => renderIssueWithDiffContext(issue).then((body) => `--- Finding ${i + 1} ---\n${body}`)),
    );

    return header + blocks.join('\n\n');
}