import { beforeEach, expect, test, vi } from 'vite-plus/test';
import { extractJsonObject, runExternalText } from './provider-runtime.js';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query }));
const config = { provider: 'claude-code', model: 'claude-default', apiKey: null };
beforeEach(() => query.mockReset());

test('empty provider output is an error, not a clean review', () => {
    expect(() => extractJsonObject('')).toThrow('no structured review output');
});
test('account-backed text generation returns the successful result with tools disabled', async () => {
    query.mockImplementation(async function* () {
        yield { type: 'result', subtype: 'success', result: '- Increased timeout.' };
    });
    expect(await runExternalText(config, 'Summarize', 'Changed timeout')).toBe('- Increased timeout.');
    expect(query.mock.calls[0]![0].options.tools).toEqual([]);
});
test('failed account-backed summary is surfaced instead of an empty success', async () => {
    query.mockImplementation(async function* () {
        yield { type: 'result', subtype: 'error_during_execution', errors: ['failure'] };
    });
    await expect(runExternalText(config, 'Summarize', 'Changed timeout')).rejects.toThrow('no summary text');
});
test('an already cancelled summary propagates cancellation to the account SDK', async () => {
    const controller = new AbortController();
    controller.abort();
    query.mockImplementation(async function* (request) {
        expect(request.options.abortController.signal.aborted).toBe(true);
        if (request.options.abortController.signal.aborted) throw new Error('aborted');
        yield { type: 'result', subtype: 'success', result: 'Unexpected uncancelled summary' };
    });
    await expect(runExternalText(config, 'Summarize', 'Changed timeout', controller.signal)).rejects.toThrow('aborted');
});
