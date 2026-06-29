import { describe, expect, test } from 'bun:test';
import { pathInstructionsForFile } from './review-context.js';

describe('pathInstructionsForFile', () => {
    test('matches glob patterns and stacks instructions', () => {
        const rules = [
            { path: 'src/**', instructions: 'Validate all inputs.' },
            { path: 'src/api/**', instructions: 'Require rate limiting.' },
        ];

        const text = pathInstructionsForFile('src/api/routes.ts', rules);
        expect(text).toContain('Validate all inputs.');
        expect(text).toContain('Require rate limiting.');
    });

    test('returns empty when no rules match', () => {
        const text = pathInstructionsForFile('docs/readme.md', [
            { path: 'src/**', instructions: 'x' },
        ]);
        expect(text).toBe('');
    });
});