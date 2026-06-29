/**
 * Minimal MCP stdio server exposing last review findings for IDE agents.
 * Run: ai-review mcp  (wired from CLI)
 */
import * as fs from 'fs-extra';
import type { ScanIssue } from './types.js';

const LAST_REVIEW_FILE = '.ai-review-last.json';

export async function writeLastReviewSnapshot(
    issues: ScanIssue[],
    files: string[],
    durationSecs: number,
): Promise<void> {
    await fs.writeJson(LAST_REVIEW_FILE, {
        writtenAt: Date.now(),
        durationSecs,
        filesReviewed: files.length,
        findings: issues.length,
        issues,
    }, { spaces: 2 });
}

export async function readLastReviewSnapshot(): Promise<{
    issues: ScanIssue[];
    filesReviewed: number;
    findings: number;
} | null> {
    if (!(await fs.pathExists(LAST_REVIEW_FILE))) return null;
    const data = await fs.readJson(LAST_REVIEW_FILE) as {
        issues?: ScanIssue[];
        filesReviewed?: number;
        findings?: number;
    };
    if (!Array.isArray(data.issues)) return null;
    return {
        issues: data.issues,
        filesReviewed: data.filesReviewed || 0,
        findings: data.findings || data.issues.length,
    };
}

/** JSON-RPC style lines on stdin/stdout for simple MCP tool listing. */
export async function runMcpStdioServer(): Promise<void> {
    const snapshot = await readLastReviewSnapshot();
    const payload = {
        tools: [
            {
                name: 'ai_review_list_findings',
                description: 'Return findings from the most recent ai-review run in this repo',
            },
        ],
        lastReview: snapshot,
    };
    process.stdout.write(JSON.stringify(payload) + '\n');
}