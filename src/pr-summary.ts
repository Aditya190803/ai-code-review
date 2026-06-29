import { autoApproveComment } from './pr-approval.js';
import type { ScanIssue } from './types.js';

export function buildPrWalkthroughSummary(
    issues: ScanIssue[],
    files: string[],
    baseRef?: string,
): string {
    const bySeverity = issues.reduce<Record<string, number>>((acc, i) => {
        acc[i.severity] = (acc[i.severity] || 0) + 1;
        return acc;
    }, {});

    const scope = baseRef ? `changes vs \`${baseRef}\`` : 'current review scope';
    const lines = [
        '## AI Code Review Summary',
        '',
        `Reviewed **${files.length}** file(s) for ${scope}.`,
        '',
        '### Findings',
        `- **Total:** ${issues.length}`,
        ...Object.entries(bySeverity).map(([sev, n]) => `- **${sev}:** ${n}`),
        '',
    ];

    if (issues.length === 0) {
        lines.push('No issues detected. ✅');
        return lines.join('\n');
    }

    const top = [...issues]
        .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
        .slice(0, 8);

    lines.push('### Highlights');
    for (const issue of top) {
        lines.push(`- **${issue.severity}** \`${issue.file}:${issue.line}\` — ${issue.title}`);
    }

    lines.push('', '_Full details in the review artifact or `ai-review review --diff`._');
    return lines.join('\n');
}

function severityWeight(severity: string): number {
    if (severity === 'critical') return 3;
    if (severity === 'warning' || severity === 'major') return 2;
    return 1;
}

export function buildGithubCommentBody(
    issues: ScanIssue[],
    files: string[],
    durationSecs: number,
    baseRef?: string,
    autoApproveMaxFindings?: number,
): string {
    const summary = buildPrWalkthroughSummary(issues, files, baseRef);
    const details = issues.length === 0
        ? ''
        : [
            '<details>',
            '<summary>Inline findings</summary>',
            '',
            '```',
            issues.slice(0, 30).map((i, idx) =>
                `${idx + 1}. [${i.severity}] ${i.file}:${i.line} ${i.title}`,
            ).join('\n'),
            issues.length > 30 ? `\n... and ${issues.length - 30} more` : '',
            '```',
            '</details>',
        ].join('\n');

    const approval = autoApproveMaxFindings
        ? autoApproveComment(issues, autoApproveMaxFindings)
        : '';
    return [
        summary,
        '',
        `Completed in ${durationSecs}s.`,
        details,
        approval,
    ].filter(Boolean).join('\n');
}