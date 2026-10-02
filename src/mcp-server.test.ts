import { expect, test } from 'vite-plus/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createReviewMcpServer, writeLastReviewSnapshot } from './mcp-server.js';

test('MCP client initializes, discovers the tool, and reads fresh completion metadata', async () => {
    const cwd = process.cwd();
    const root = await mkdtemp(path.join(os.tmpdir(), 'ai-review-mcp-'));
    const server = createReviewMcpServer();
    const client = new Client({ name: 'fixture', version: '1.0.0' });
    try {
        process.chdir(root);
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const tools = await client.listTools();
        expect(tools.tools[0]!.name).toBe('ai_review_list_findings');
        const empty = await client.callTool({ name: 'ai_review_list_findings' });
        expect(empty.content).toEqual([{ type: 'text', text: 'No review available. Run ai-review review first.' }]);
        await writeLastReviewSnapshot([], ['a.ts'], 1, { complete: false, failedFiles: ['a.ts'], skippedFiles: [] });
        const result = await client.callTool({ name: 'ai_review_list_findings' });
        expect(result.structuredContent).toMatchObject({ complete: false, failedFiles: ['a.ts'], findings: 0 });
    } finally {
        await client.close();
        await server.close();
        process.chdir(cwd);
        await rm(root, { recursive: true, force: true });
    }
});
