import { describe, expect, test } from 'bun:test';
import { filterSuppressedIssues, recordReviewFeedback } from './review-memory.js';
import type { ScanIssue } from './types.js';

const sample: ScanIssue = {
    category: 'style',
    severity: 'info',
    title: 'console.log left in code',
    line: 1,
    lineEnd: 1,
    codeContext: 'console.log(1)',
    description: 'debug',
    suggestedFix: 'remove',
    aiPrompt: 'fix',
    file: 'src/a.ts',
};

describe('review memory', () => {
    test('suppresses after repeated downvotes', () => {
        let store: import('./review-memory.js').ReviewMemoryStore = { version: 1, entries: [] };
        store = recordReviewFeedback(store, sample, 'down');
        store = recordReviewFeedback(store, sample, 'down');
        const filtered = filterSuppressedIssues([sample], store);
        expect(filtered).toHaveLength(0);
    });
});