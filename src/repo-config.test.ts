import { describe, expect, test } from 'vite-plus/test';
import { parseSimpleYaml } from './repo-config.js';

describe('parseSimpleYaml', () => {
    test('empty inline lists from ai-review init remain arrays', () => {
        const config = parseSimpleYaml('customRules: []\nignoredPaths: []\nguidelineFiles: []\n');
        expect(config.customRules).toEqual([]);
        expect(config.ignoredPaths).toEqual([]);
        expect(config.guidelineFiles).toEqual([]);
    });
    test('parses scalar and list review config values', () => {
        const config = parseSimpleYaml(`
reviewProfile: assertive
provider: opencode
model: big-pickle
webSearch: false
ignoredPaths:
  - dist/**
  - node_modules/**
`);

        expect(config.reviewProfile).toBe('assertive');
        expect(config.provider).toBe('opencode');
        expect(config.model).toBe('big-pickle');
        expect(config.webSearch).toBe(false);
        expect(config.ignoredPaths).toEqual(['dist/**', 'node_modules/**']);
    });
});
