import { describe, expect, test } from 'bun:test';
import { renderJsonReview, renderSarifReview } from './reporters.js';
import type { ScanIssue } from './types.js';

const issue: ScanIssue = {
    category: 'security',
    severity: 'critical',
    title: 'Unsafe eval',
    line: 12,
    lineEnd: 12,
    codeContext: 'eval(input)',
    description: 'eval executes arbitrary code.',
    suggestedFix: 'Use a safe parser.',
    aiPrompt: 'Replace eval with a safe parser.',
    file: 'src/app.ts',
};

describe('reporters', () => {
    test('renders final JSON output', () => {
        const parsed = JSON.parse(renderJsonReview([issue], 1.2, ['src/app.ts']));

        expect(parsed.filesReviewed).toBe(1);
        expect(parsed.findings).toBe(1);
        expect(parsed.issues[0].title).toBe('Unsafe eval');
    });

    test('renders SARIF output for code scanning integrations', () => {
        const parsed = JSON.parse(renderSarifReview([issue], 1.2, ['src/app.ts']));
        const result = parsed.runs[0].results[0];

        expect(parsed.version).toBe('2.1.0');
        expect(result.level).toBe('error');
        expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe('src/app.ts');
        expect(result.locations[0].physicalLocation.region.startLine).toBe(12);
    });
});
