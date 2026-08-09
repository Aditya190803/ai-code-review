import { describe, expect, test } from 'bun:test';
import {
    getProviderBaseURL,
    getProviderDefinition,
    getProviderMaxOutputTokens,
    providerRequiresApiKey,
    PROVIDERS,
} from './providers.js';

describe('OpenCode provider', () => {
    test('discovers all models from the OpenAI-compatible models endpoint', () => {
        const provider = getProviderDefinition('opencode');

        expect(provider?.defaultModel).toBe('big-pickle');
        expect(provider?.baseURL).toBe('https://opencode.ai/zen/v1');
        expect(provider?.modelListURL).toBe('https://opencode.ai/zen/v1/models');
        expect(provider?.modelResponsePath).toBe('data');
        expect(provider?.authModes).toContain('subscription');
        expect(provider?.staticModels?.[0]?.value).toBe('big-pickle');
        expect(providerRequiresApiKey('opencode')).toBe(true);
    });

    test('offers official account-backed subscription providers as optional choices', () => {
        const codex = getProviderDefinition('codex');
        const claudeCode = getProviderDefinition('claude-code');

        expect(codex?.runtime).toBe('codex-cli');
        expect(codex?.authModes).toEqual(['subscription']);
        expect(providerRequiresApiKey('codex')).toBe(false);

        expect(claudeCode?.runtime).toBe('claude-agent-sdk');
        expect(claudeCode?.authModes).toEqual(['subscription']);
        expect(providerRequiresApiKey('claude-code')).toBe(false);
    });

    test('keeps unsupported providers out of the built-in list', () => {
        const providerIds = PROVIDERS.map((provider) => provider.id);

        expect(providerIds).not.toContain('xai');
        expect(providerIds).not.toContain('groq');
        expect(providerIds).not.toContain('mistral');
        expect(providerIds).not.toContain('together');
        expect(providerIds).not.toContain('nvidia');
    });

    test('is the first provider, so it wins as the default', () => {
        expect(PROVIDERS[0]?.id).toBe('opencode');
        expect(getProviderDefinition('opencode')?.envKeys).toContain('OPENCODE_API_KEY');
    });

    test('honors OPENCODE_BASE_URL over the built-in base URL', () => {
        const original = process.env.OPENCODE_BASE_URL;

        try {
            delete process.env.OPENCODE_BASE_URL;
            expect(getProviderBaseURL('opencode')).toBe('https://opencode.ai/zen/v1');

            process.env.OPENCODE_BASE_URL = 'https://proxy.internal/zen/v1';
            expect(getProviderBaseURL('opencode')).toBe('https://proxy.internal/zen/v1');

            // An explicit override still beats the environment variable.
            expect(getProviderBaseURL('opencode', 'https://explicit/v1')).toBe('https://explicit/v1');
        } finally {
            if (original === undefined) delete process.env.OPENCODE_BASE_URL;
            else process.env.OPENCODE_BASE_URL = original;
        }
    });

    test('budgets output tokens generously because reasoning tokens share the limit', () => {
        // big-pickle bills reasoning tokens against max_tokens, so a review-sized
        // budget must stay well clear of the visible answer length, and under the
        // 32k output ceiling.
        const budget = getProviderMaxOutputTokens('opencode');

        expect(budget).toBeGreaterThanOrEqual(8_000);
        expect(budget).toBeLessThanOrEqual(32_000);
    });
});
