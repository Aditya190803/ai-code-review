import { describe, expect, test } from 'bun:test';
import { normalizeConfig } from './config.js';

describe('normalizeConfig', () => {
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
            provider: 'mistral',
            apiKey: 'test-key',
        });

        expect(config.model).toBe('mistral-small-latest');
    });
});
