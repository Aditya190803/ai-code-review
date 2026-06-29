import { describe, expect, test } from 'bun:test';
import { shouldAutoApprove } from './pr-approval.js';
import type { ScanIssue } from './types.js';

const issue = (sev: string): ScanIssue => ({
    category: 'bug',
    severity: sev,
    title: 't',
    line: 1,
    lineEnd: 1,
    codeContext: '',
    description: '',
    suggestedFix: '',
    aiPrompt: '',
    file: 'a.ts',
});

describe('shouldAutoApprove', () => {
    test('rejects critical', () => {
        expect(shouldAutoApprove([issue('critical')], 5).approve).toBe(false);
    });
    test('approves within limit', () => {
        expect(shouldAutoApprove([issue('info')], 3).approve).toBe(true);
    });
});