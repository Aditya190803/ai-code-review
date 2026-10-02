import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Explicit opt-in: this exercises a real provider and may use billable tokens.
const provider = process.env.REVIEW_SMOKE_PROVIDER || 'codex';
const model = process.env.REVIEW_SMOKE_MODEL || 'codex-default';
const bundle = path.resolve('dist/app.js');
const root = await mkdtemp(path.join(os.tmpdir(), 'ai-review-live-'));
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
function review(scope: string) {
    return JSON.parse(
        execFileSync(
            process.execPath,
            [
                bundle,
                'review',
                '--type',
                scope,
                '--provider',
                provider,
                '--model',
                model,
                '--output',
                'json',
                '--fail-on',
                'none',
            ],
            {
                cwd: root,
                encoding: 'utf8',
                timeout: 240_000,
                maxBuffer: 4 * 1024 * 1024,
            },
        ),
    );
}
try {
    git('init');
    git('config', 'user.name', 'Review Fixture');
    git('config', 'user.email', 'fixture@example.test');
    git('config', 'core.autocrlf', 'false');
    await writeFile(
        path.join(root, 'transfer.ts'),
        `type Account = { balance: number };
// Caller validates positive amount, sufficient funds, and distinct accounts. Debit sender and credit receiver.
export function transfer(sender: Account, receiver: Account, amount: number) {
    sender.balance -= amount;
    receiver.balance += amount;
}
`,
    );
    git('add', '.');
    git('commit', '-m', 'correct transfer');
    const clean = review('all');
    assert.equal(clean.complete, true);
    assert.equal(clean.findings, 0, 'Reviewer should accept the correct implementation under its documented contract');
    await writeFile(
        path.join(root, 'transfer.ts'),
        `type Account = { balance: number };
// Caller validates positive amount, sufficient funds, and distinct accounts. Debit sender and credit receiver.
export function transfer(sender: Account, receiver: Account, amount: number) {
    sender.balance -= amount;
    receiver.balance -= amount;
}
`,
    );
    git('add', '.');
    const report = review('staged');
    assert.equal(report.complete, true, 'Live review must complete');
    assert.equal(report.filesReviewed, 1);
    assert.ok(
        report.issues.some(
            (issue: { file: string; line: number; description: string }) =>
                issue.file === 'transfer.ts' &&
                issue.line === 5 &&
                /receiver|recipient|credit/i.test(issue.description),
        ),
        'Reviewer must find the introduced receiver debit on line 5',
    );
    const requests = [
        {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1.0' } },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ai_review_list_findings', arguments: {} } },
    ];
    const mcpOutput = execFileSync(process.execPath, [bundle, 'mcp'], {
        cwd: root,
        input: requests.map((request) => JSON.stringify(request)).join('\n') + '\n',
        encoding: 'utf8',
        timeout: 20_000,
    });
    const mcpResult = mcpOutput
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .find((response) => response.id === 2);
    assert.equal(mcpResult?.result?.structuredContent?.complete, true);
    assert.equal(mcpResult?.result?.structuredContent?.findings, report.findings);
    console.log(
        JSON.stringify({
            provider,
            model,
            complete: report.complete,
            findings: report.findings,
            detectedPlantedBug: true,
            cleanFixtureAccepted: true,
            mcpStdioVerified: true,
        }),
    );
} finally {
    await rm(root, { recursive: true, force: true });
}
