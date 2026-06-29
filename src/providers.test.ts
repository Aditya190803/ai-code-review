import { describe, expect, test } from 'bun:test';
import { getProviderDefinition, providerRequiresApiKey, PROVIDERS } from './providers.js';

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
});
