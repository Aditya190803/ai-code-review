import * as fs from 'fs-extra';
import type { ScanIssue } from './types.js';

const METRICS_FILE = '.ai-review-metrics.json';

export interface ReviewRunRecord {
    at: number;
    scope: string;
    filesReviewed: number;
    findings: number;
    critical: number;
    warning: number;
    durationSecs: number;
}

export interface ReviewMetricsStore {
    version: 1;
    runs: ReviewRunRecord[];
}

export async function loadReviewMetrics(): Promise<ReviewMetricsStore> {
    if (!(await fs.pathExists(METRICS_FILE))) {
        return { version: 1, runs: [] };
    }
    const data = await fs.readJson(METRICS_FILE) as Partial<ReviewMetricsStore>;
    return { version: 1, runs: Array.isArray(data.runs) ? data.runs : [] };
}

export async function recordReviewRun(
    issues: ScanIssue[],
    files: string[],
    durationSecs: number,
    scope: string,
): Promise<void> {
    const store = await loadReviewMetrics();
    const critical = issues.filter((i) => i.severity === 'critical').length;
    const warning = issues.filter((i) => i.severity === 'warning' || i.severity === 'major').length;
    store.runs.push({
        at: Date.now(),
        scope,
        filesReviewed: files.length,
        findings: issues.length,
        critical,
        warning,
        durationSecs,
    });
    // ponytail: keep last 200 runs only
    if (store.runs.length > 200) store.runs = store.runs.slice(-200);
    await fs.writeJson(METRICS_FILE, store, { spaces: 2 });
}

export function renderMetricsSummary(store: ReviewMetricsStore): string {
    const runs = store.runs;
    if (!runs.length) return 'No review runs recorded yet. Run `ai-review review` to populate metrics.';
    const last = runs[runs.length - 1];
    const totalFindings = runs.reduce((a, r) => a + r.findings, 0);
    const avg = (totalFindings / runs.length).toFixed(1);
    return [
        `Review runs: ${runs.length}`,
        `Last run: ${new Date(last.at).toISOString()} · ${last.findings} findings · ${last.durationSecs}s`,
        `Avg findings/run: ${avg}`,
        `Last critical/warning: ${last.critical}/${last.warning}`,
    ].join('\n');
}