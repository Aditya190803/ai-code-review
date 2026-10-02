/**
 * Minimal MCP stdio server exposing last review findings for IDE agents.
 * Run: ai-review mcp  (wired from CLI)
 */
import * as fs from 'fs-extra';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ScanIssue, ReviewCompletion } from './types.js';

const LAST_REVIEW_FILE = '.ai-review-last.json';

export async function writeLastReviewSnapshot(
    issues: ScanIssue[],
    files: string[],
    durationSecs: number,
    completion?: ReviewCompletion,
): Promise<void> {
    await fs.writeJson(
        LAST_REVIEW_FILE,
        {
            writtenAt: Date.now(),
            durationSecs,
            filesReviewed: files.length,
            findings: issues.length,
            issues,
            complete: completion?.complete ?? true,
            failedFiles: completion?.failedFiles ?? [],
            skippedFiles: completion?.skippedFiles ?? [],
        },
        { spaces: 2 },
    );
}

export async function readLastReviewSnapshot(): Promise<{
    issues: ScanIssue[];
    filesReviewed: number;
    findings: number;
    complete: boolean;
    failedFiles: string[];
    skippedFiles: string[];
} | null> {
    if (!(await fs.pathExists(LAST_REVIEW_FILE))) return null;
    const data = (await fs.readJson(LAST_REVIEW_FILE)) as {
        issues?: ScanIssue[];
        filesReviewed?: number;
        findings?: number;
        complete?: boolean;
        failedFiles?: string[];
        skippedFiles?: string[];
    };
    if (!Array.isArray(data.issues)) return null;
    return {
        issues: data.issues,
        filesReviewed: data.filesReviewed || 0,
        findings: data.findings || data.issues.length,
        complete: data.complete ?? false,
        failedFiles: data.failedFiles ?? [],
        skippedFiles: data.skippedFiles ?? [],
    };
}

export function createReviewMcpServer(): McpServer {
    const server = new McpServer({ name: 'ai-review', version: '1.0.0' });
    server.registerTool(
        'ai_review_list_findings',
        {
            description:
                'Read the latest review findings and completion status for this repository. Run ai-review review to refresh them.',
            annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        async () => {
            const snapshot = await readLastReviewSnapshot();
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: snapshot ? JSON.stringify(snapshot) : 'No review available. Run ai-review review first.',
                    },
                ],
                ...(snapshot ? { structuredContent: snapshot } : {}),
            };
        },
    );
    return server;
}

/** The SDK handles initialization, protocol negotiation and JSON-RPC framing. */
export async function runMcpStdioServer(): Promise<void> {
    await createReviewMcpServer().connect(new StdioServerTransport());
    // Keep the CLI alive until the client closes stdin.
    await new Promise<void>((resolve) => process.stdin.once('end', resolve));
}
