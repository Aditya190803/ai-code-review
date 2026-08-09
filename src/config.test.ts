import { describe, expect, test } from 'bun:test';
import { fetchModels, normalizeConfig } from './config.js';
import { PROVIDERS } from './providers.js';

describe('normalizeConfig', () => {
    test('defaults to OpenCode Big Pickle', () => {
        const config = normalizeConfig();

        expect(config.provider).toBe('opencode');
        expect(config.model).toBe('big-pickle');
        expect(config.authMode).toBe('subscription');
    });

    test('fills in persisted defaults for language and tone', () => {
        const config = normalizeConfig({
            provider: 'openai',
            apiKey: 'test-key',
            model: 'gpt-5-mini',
        });

        expect(config.reviewLanguage).toBe('en');
        expect(config.uiLanguage).toBe('en');
        expect(config.reviewTone).toBe('strict');
    });

    test('uses provider-specific defaults when model is missing', () => {
        const config = normalizeConfig({
            provider: 'cerebras',
            apiKey: 'test-key',
        });

        expect(config.model).toBe('llama-3.3-70b');
    });

    test('does not offer the deprecated llama-4-scout model anywhere', () => {
        const deadModel = 'llama-4-scout-17b-16e-instruct';

        for (const provider of PROVIDERS) {
            expect(provider.defaultModel).not.toBe(deadModel);
            for (const model of provider.staticModels || []) {
                expect(model.value).not.toBe(deadModel);
            }
        }
    });

    test('falls back to OpenCode when a saved provider is no longer supported', () => {
        const config = normalizeConfig({
            provider: 'xai',
            apiKey: 'old-key',
            model: 'grok-3-mini',
        });

        expect(config.provider).toBe('opencode');
        expect(config.model).toBe('big-pickle');
    });

    test('does not borrow the OpenCode key for account-backed providers', () => {
        const config = normalizeConfig({
            provider: 'codex',
        });

        expect(config.apiKey).toBeNull();
        expect(config.model).toBe('codex-default');
    });
});

describe('fetchModels', () => {
    test('fetches OpenCode remote models before using the static fallback', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response(JSON.stringify({
            data: [
                { id: 'big-pickle' },
                { id: 'reasoning-model' },
                { id: 'fast-review-model' },
            ],
        }), { status: 200 })) as unknown as typeof fetch;

        try {
            const models = await fetchModels('opencode', 'test-key');

            expect(models.map((model) => model.value)).toEqual([
                'big-pickle',
                'reasoning-model',
                'fast-review-model',
            ]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('falls back to OpenCode static model when remote model discovery fails', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;

        try {
            const models = await fetchModels('opencode', 'test-key');

            expect(models).toEqual([{ label: 'big-pickle', value: 'big-pickle' }]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
