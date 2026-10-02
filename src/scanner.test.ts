import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scanCodebase } from './scanner.js';
import { git, getChangedCodeFiles } from './git.js';

const { generateObject } = vi.hoisted(() => ({ generateObject: vi.fn() }));
vi.mock('ai', () => ({ generateObject }));
vi.mock('./config.js', () => ({ getModel: () => ({}) }));

const config = { provider: 'opencode', model: 'fixture', apiKey: 'fixture' };
const callbacks = {
    onProgress: vi.fn(),
    onLog: vi.fn(),
    onIssuesUpdate: vi.fn(),
    onReviewUpdate: vi.fn(),
};
const originalCwd = process.cwd();
let root: string;
function runGit(...args: string[]) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}
async function scan(
    selection: {
        scope: 'all' | 'staged' | 'unstaged' | 'uncommitted' | 'committed';
        base?: string;
    } = { scope: 'all' },
) {
    return scanCodebase(config, callbacks, ['main.ts'], undefined, undefined, selection);
}

beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ai-review-test-'));
    process.chdir(root);
    await git.cwd(root);
    runGit('init');
    runGit('config', 'core.autocrlf', 'false');
    runGit('config', 'user.email', 'fixture@example.test');
    runGit('config', 'user.name', 'Fixture');
    await writeFile('main.ts', 'export const value = "original";\n');
    runGit('add', '.');
    runGit('commit', '-m', 'initial');
    generateObject.mockReset();
    generateObject.mockResolvedValue({ object: { issues: [] } });
    vi.clearAllMocks();
});
afterEach(async () => {
    process.chdir(originalCwd);
    await git.cwd(originalCwd);
    await rm(root, { recursive: true, force: true });
});

describe('review pipeline with a real Git repository', () => {
    test('deleted code is reviewed with surviving callers, rather than silently omitted', async () => {
        await writeFile('caller.ts', 'import { value } from "./main";\nexport const result = value;\n');
        runGit('add', '.');
        runGit('commit', '-m', 'caller');
        await rm('main.ts');
        expect(await getChangedCodeFiles()).toContain('main.ts');
        const result = await scan({ scope: 'uncommitted' });
        expect(result.complete).toBe(true);
        const prompt = generateObject.mock.calls.at(-1)![0].prompt;
        expect(prompt).toContain('+++ /dev/null');
        expect(prompt).toContain('caller.ts');
        expect(prompt).toContain('import { value }');
    });
    test('staged review uses the index, even when the working tree differs', async () => {
        await writeFile('main.ts', 'export const value = "staged";\n');
        runGit('add', 'main.ts');
        await writeFile('main.ts', 'export const value = "unstaged";\n');
        await scan({ scope: 'staged' });
        const prompt = generateObject.mock.calls.at(-1)![0].prompt;
        expect(prompt).toContain('+export const value = "staged"');
        expect(prompt).not.toContain('"unstaged"');
    });
    test('full review sends the complete file even when a diff exists', async () => {
        await writeFile('main.ts', 'export const value = "changed";\n');
        await scan();
        expect(generateObject.mock.calls.at(-1)![0].prompt).toContain('Review mode: full file');
    });
    test('committed review excludes subsequent local edits', async () => {
        await writeFile('main.ts', 'export const value = "committed";\n');
        runGit('add', '.');
        runGit('commit', '-m', 'change');
        await writeFile('main.ts', 'export const value = "local";\n');
        await scan({ scope: 'committed' });
        const prompt = generateObject.mock.calls.at(-1)![0].prompt;
        expect(prompt).toContain('+export const value = "committed"');
        expect(prompt).not.toContain('"local"');
    });
    test('committed review supports the first commit in a repository', async () => {
        const result = await scan({ scope: 'committed' });
        expect(result.complete).toBe(true);
        expect(generateObject.mock.calls.at(-1)![0].prompt).toContain('+export const value = "original"');
    });
    test('team rules invalidate a cached clean review', async () => {
        await scan();
        generateObject.mockClear();
        await scanCodebase(
            config,
            callbacks,
            ['main.ts'],
            undefined,
            {
                globalGuidelines: 'Validate all exported values',
                customRules: [],
                pathInstructions: [],
            },
            { scope: 'all' },
        );
        expect(generateObject).toHaveBeenCalled();
    });
    test('provider failures are incomplete and cannot become cached clean results', async () => {
        generateObject.mockRejectedValue(new Error('provider unavailable'));
        const result = await scan();
        expect(result.complete).toBe(false);
        expect(result.failedFiles).toEqual(['main.ts']);
        expect(callbacks.onReviewUpdate.mock.calls.at(-1)![0]).toContain('Incomplete');
        expect(JSON.parse(await readFile('.ai-reviewer-cache.json', 'utf8'))).toEqual({});
    });
    test('malformed model output fails the review instead of reporting clean', async () => {
        generateObject.mockResolvedValue({ object: { unexpected: true } });
        expect((await scan()).complete).toBe(false);
    });
    test('cancelled review is incomplete', async () => {
        const controller = new AbortController();
        controller.abort();
        const result = await scanCodebase(config, callbacks, ['main.ts'], controller.signal);
        expect(result.complete).toBe(false);
    });
    test('console output is a hint, not an automatically confirmed defect', async () => {
        await writeFile('main.ts', 'console.log("CLI output");\n');
        const result = await scan();
        expect(result.issues).toEqual([]);
        expect(generateObject.mock.calls.at(-1)![0].prompt).toContain('Unverified static hints');
    });
    test('related source is read from the index for a staged review', async () => {
        await writeFile('helper.ts', 'export const helper = "staged helper";\n');
        await writeFile('main.ts', 'import { helper } from "./helper.js";\nexport const value = helper;\n');
        runGit('add', '.');
        await writeFile('helper.ts', 'export const helper = "local helper";\n');
        await scan({ scope: 'staged' });
        const prompt = generateObject.mock.calls.at(-1)![0].prompt;
        expect(prompt).toContain('reason: direct dependency');
        expect(prompt).toContain('staged helper');
        expect(prompt).not.toContain('local helper');
    });
    test('large files are explicitly skipped and mark the review incomplete', async () => {
        await writeFile('main.ts', '// large\n' + 'x'.repeat(50_001));
        const result = await scan();
        expect(result.complete).toBe(false);
        expect(result.skippedFiles).toEqual(['main.ts']);
    });
});
