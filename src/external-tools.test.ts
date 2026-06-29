import { describe, expect, test } from 'bun:test';
import { runExternalTools } from './external-tools.js';

describe('runExternalTools', () => {
    test('returns empty when no tools enabled', async () => {
        expect(await runExternalTools(undefined, ['a.ts'])).toEqual([]);
        expect(await runExternalTools([], ['a.ts'])).toEqual([]);
    });
});