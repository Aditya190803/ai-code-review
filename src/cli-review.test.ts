import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseCliArgs, runReviewCommand } from './cli.js';
import type { ScanIssue } from './types.js';

const { scanCodebase } = vi.hoisted(() => ({ scanCodebase: vi.fn() }));
vi.mock('./scanner.js', () => ({ scanCodebase }));
vi.mock('./config.js', () => ({
    loadConfig: async () => ({ provider: 'codex', model: 'codex-default', apiKey: null }),
    normalizeConfig: (config: unknown) => config,
    checkProviderHealth: async () => ({ ok: true }),
}));
vi.mock('./git.js', () => ({ getChangedCodeFiles: async () => ['a.ts'] }));
const cwd = process.cwd();
let root: string;
beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ai-review-cli-'));
    process.chdir(root);
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
});
test('an incomplete CLI review returns exit 2 even when fail-on is none', async () => {
    scanCodebase.mockResolvedValue({
        issues: [],
        durationSecs: 1,
        complete: false,
        failedFiles: ['a.ts'],
        skippedFiles: [],
    });
    const code = await runReviewCommand(
        parseCliArgs(['review', '--output', 'json', '--output-file', 'review.json', '--fail-on', 'none']),
    );
    expect(code).toBe(2);
    expect(JSON.parse(await readFile('review.json', 'utf8'))).toMatchObject({ complete: false, failedFiles: ['a.ts'] });
    expect(JSON.parse(await readFile('.ai-review-last.json', 'utf8')).complete).toBe(false);
});
test('agent findings are emitted once and completion includes the authoritative results', async () => {
    const issue: ScanIssue = {
        file: 'a.ts',
        line: 1,
        lineEnd: 1,
        title: 'Bug',
        category: 'bug',
        severity: 'warning',
        description: 'Fails',
        codeContext: '',
        suggestedFix: '',
        aiPrompt: '',
    };
    scanCodebase.mockImplementation(async (_config, callbacks) => {
        callbacks.onIssuesUpdate([issue]);
        callbacks.onIssuesUpdate([issue]);
        return { issues: [issue], durationSecs: 1, complete: true, failedFiles: [], skippedFiles: [] };
    });
    expect(await runReviewCommand(parseCliArgs(['review', '--agent']))).toBe(0);
    const events = vi.mocked(console.log).mock.calls.map((args) => JSON.parse(args[0]));
    expect(events.filter((event) => event.type === 'finding')).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: 'complete', complete: true, issues: [issue] });
});
