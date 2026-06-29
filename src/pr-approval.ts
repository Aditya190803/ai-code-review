import type { ScanIssue } from './types.js';

/** Suggest auto-approve when findings are below configured threshold. */
export function shouldAutoApprove(
    issues: ScanIssue[],
    maxFindings?: number,
): { approve: boolean; reason: string } {
    const limit = maxFindings ?? 0;
    if (limit <= 0) {
        return { approve: false, reason: 'autoApproveMaxFindings not configured' };
    }
    const critical = issues.filter((i) => i.severity === 'critical').length;
    if (critical > 0) {
        return { approve: false, reason: `${critical} critical finding(s)` };
    }
    if (issues.length > limit) {
        return { approve: false, reason: `${issues.length} findings exceed limit ${limit}` };
    }
    return { approve: true, reason: `≤${limit} non-critical findings` };
}

export function autoApproveComment(issues: ScanIssue[], maxFindings: number): string {
    const { approve, reason } = shouldAutoApprove(issues, maxFindings);
    if (!approve) return '';
    return `\n\n> **Auto-approve suggestion:** ✅ ${reason} — safe to merge if team policy allows.`;
}