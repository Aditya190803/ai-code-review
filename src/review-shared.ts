import { buildReviewContextBundle } from './review-context.js';
import { filterSuppressedIssues, loadReviewMemory } from './review-memory.js';
import { loadRepoConfig } from './repo-config.js';
import type { RepoReviewConfig, ScanIssue } from './types.js';

export async function prepareReviewContext(configPaths: string[] = []): Promise<{
    repoConfig: RepoReviewConfig;
    reviewContext: Awaited<ReturnType<typeof buildReviewContextBundle>>;
    memoryStore: Awaited<ReturnType<typeof loadReviewMemory>>;
    useMemory: boolean;
}> {
    const repoConfig = await loadRepoConfig(configPaths);
    const reviewContext = await buildReviewContextBundle(repoConfig);
    const useMemory = repoConfig.reviewMemory !== false;
    const memoryStore = useMemory ? await loadReviewMemory() : { version: 1 as const, entries: [] };
    return { repoConfig, reviewContext, memoryStore, useMemory };
}

export function finalizeIssues(
    issues: ScanIssue[],
    repoConfig: RepoReviewConfig,
    memoryStore: Awaited<ReturnType<typeof loadReviewMemory>>,
    useMemory: boolean,
): ScanIssue[] {
    const rank: Record<string, number> = { info: 1, warning: 3, critical: 4 };
    let out = issues;
    const threshold = repoConfig.severityThreshold;
    if (threshold && rank[threshold]) {
        const t = rank[threshold];
        out = out.filter((i) => (rank[i.severity] || 1) >= t);
    }
    if (useMemory) out = filterSuppressedIssues(out, memoryStore);
    return out;
}