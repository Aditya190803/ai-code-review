import * as fs from 'fs-extra';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
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
    durationSecs?: number;
} | null> {
    if (!(await fs.pathExists(LAST_REVIEW_FILE))) return null;
    const data = await fs.readJson(LAST_REVIEW_FILE) as {
        issues?: ScanIssue[];
        filesReviewed?: number;
        findings?: number;
        durationSecs?: number;
    };
    if (!Array.isArray(data.issues)) return null;
    return {
        issues: data.issues,
        filesReviewed: data.filesReviewed || 0,
        findings: data.findings || data.issues.length,
        durationSecs: data.durationSecs,
    };
}

export async function runMcpStdioServer(): Promise<void> {
    const server = new Server(
        { name: 'ai-review', version: '1.0.0' },
        { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            {
                name: 'list_findings',
                description: 'List issues from the last ai-review run in this repository',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            },
            {
                name: 'get_issue',
                description: 'Get one finding by 1-based index from the last review',
                inputSchema: {
                    type: 'object',
                    properties: { index: { type: 'number', description: '1-based index' } },
                    required: ['index'],
                    additionalProperties: false,
                },
            },
        ],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const snap = await readLastReviewSnapshot();
        if (!snap) {
            return { content: [{ type: 'text', text: 'No review snapshot. Run `ai-review review` first.' }] };
        }

        if (request.params.name === 'list_findings') {
            const text = JSON.stringify({
                findings: snap.findings,
                filesReviewed: snap.filesReviewed,
                issues: snap.issues,
            }, null, 2);
            return { content: [{ type: 'text', text }] };
        }

        if (request.params.name === 'get_issue') {
            const index = Number((request.params.arguments as { index?: number })?.index) || 1;
            const issue = snap.issues[index - 1];
            if (!issue) {
                return { content: [{ type: 'text', text: `No issue at index ${index}` }] };
            }
            return { content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }] };
        }

        return { content: [{ type: 'text', text: 'Unknown tool' }], isError: true };
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}