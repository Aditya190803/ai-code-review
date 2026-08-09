import { renderDiffReview } from './diff-inline.js';
import { buildGithubCommentBody } from './pr-summary.js';
import type { ReviewOutput, ScanIssue } from './types.js';

const severityRank: Record<string, number> = {
    info: 1,
    trivial: 1,
    minor: 2,
    warning: 3,
    major: 3,
    critical: 4,
};

function issueRank(issue: ScanIssue): number {
    return severityRank[issue.severity] || 1;
}

function sarifLevel(issue: ScanIssue): 'error' | 'warning' | 'note' {
    if (issue.severity === 'critical') return 'error';
    if (issue.severity === 'warning' || issue.severity === 'major') return 'warning';
    return 'note';
}

function ruleId(issue: ScanIssue): string {
    return `ai-review/${issue.category || 'general'}/${issue.severity || 'info'}`;
}

export function formatIssue(issue: ScanIssue, index: number): string {
    const location = `${issue.file}:${issue.line}${issue.lineEnd > issue.line ? `-${issue.lineEnd}` : ''}`;
    return [
        `${index + 1}. [${issue.severity.toUpperCase()}] ${issue.title}`,
        `   ${location} · ${issue.category}`,
        issue.description ? `   ${issue.description}` : '',
        issue.suggestedFix ? `   Fix: ${issue.suggestedFix.replace(/\n/g, '\n   ')}` : '',
    ].filter(Boolean).join('\n');
}

export function renderPlainReview(issues: ScanIssue[], durationSecs: number, files: string[]): string {
    const sorted = [...issues].sort((a, b) => issueRank(b) - issueRank(a));
    const counts = sorted.reduce<Record<string, number>>((acc, issue) => {
        acc[issue.severity] = (acc[issue.severity] || 0) + 1;
        return acc;
    }, {});

    const lines = [
        `AI Code Review complete in ${durationSecs}s`,
        `Files reviewed: ${files.length}`,
        `Findings: ${sorted.length}`,
        `Severity: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
        '',
    ];

    if (sorted.length === 0) {
        lines.push('No findings.');
    } else {
        lines.push(...sorted.map(formatIssue));
    }

    return lines.join('\n');
}

export function renderJsonReview(issues: ScanIssue[], durationSecs: number, files: string[]): string {
    return JSON.stringify({
        tool: 'ai-review',
        durationSecs,
        filesReviewed: files.length,
        findings: issues.length,
        issues,
    }, null, 2);
}

export function renderSarifReview(issues: ScanIssue[], durationSecs: number, files: string[]): string {
    const rules = new Map<string, { id: string; name: string; shortDescription: { text: string } }>();

    for (const issue of issues) {
        const id = ruleId(issue);
        if (!rules.has(id)) {
            rules.set(id, {
                id,
                name: id,
                shortDescription: {
                    text: `${issue.category || 'general'} ${issue.severity || 'info'} finding`,
                },
            });
        }
    }

    return JSON.stringify({
        version: '2.1.0',
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        runs: [
            {
                tool: {
                    driver: {
                        name: 'AI Code Review',
                        informationUri: 'https://github.com/Aditya190803/ai-code-review',
                        rules: [...rules.values()],
                    },
                },
                invocations: [
                    {
                        executionSuccessful: true,
                        properties: {
                            durationSecs,
                            filesReviewed: files.length,
                        },
                    },
                ],
                results: issues.map((issue) => ({
                    ruleId: ruleId(issue),
                    level: sarifLevel(issue),
                    message: {
                        text: [issue.title, issue.description].filter(Boolean).join(': '),
                    },
                    locations: [
                        {
                            physicalLocation: {
                                artifactLocation: {
                                    uri: issue.file,
                                },
                                region: {
                                    startLine: Math.max(1, issue.line || 1),
                                    endLine: Math.max(issue.lineEnd || issue.line || 1, issue.line || 1),
                                },
                            },
                        },
                    ],
                    properties: {
                        category: issue.category,
                        severity: issue.severity,
                        confidence: issue.confidence,
                        suggestedFix: issue.suggestedFix,
                        aiPrompt: issue.aiPrompt,
                        codeContext: issue.codeContext,
                    },
                })),
            },
        ],
    }, null, 2);
}

export async function renderReview(
    output: ReviewOutput,
    issues: ScanIssue[],
    durationSecs: number,
    files: string[],
    options?: { baseRef?: string },
): Promise<string> {
    if (output === 'json') return renderJsonReview(issues, durationSecs, files);
    if (output === 'sarif') return renderSarifReview(issues, durationSecs, files);
    if (output === 'diff') return renderDiffReview(issues, durationSecs, files);
    if (output === 'github') return buildGithubCommentBody(issues, files, durationSecs, options?.baseRef);
    return renderPlainReview(issues, durationSecs, files);
}
