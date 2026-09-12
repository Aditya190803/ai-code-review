import { describe, expect, test } from 'bun:test';
import {
    getReviewSystemPrompt,
    getScanSystemPrompt,
    SCAN_PROMPT_VERSION,
    TRIAGE_SYSTEM_PROMPT,
} from './prompts.js';
import type { AppConfig } from './types.js';

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
    return {
        provider: 'opencode',
        apiKey: 'test-key',
        model: 'big-pickle',
        reviewLanguage: 'en',
        reviewTone: 'strict',
        ...overrides,
    };
}

describe('prompt version', () => {
    test('is stamped with the precision rewrite date', () => {
        // Bumping this invalidates the scan cache, which is intended: findings
        // produced by the old coercive prompt should not be replayed.
        expect(SCAN_PROMPT_VERSION).toBe('2026-08-09');
    });
});

describe('buildLanguageInstruction behavior', () => {
    test('carries the review language into both prompts', () => {
        const config = makeConfig({ reviewLanguage: 'ja' });

        expect(getReviewSystemPrompt(config)).toContain('Japanese');
        expect(getScanSystemPrompt(config)).toContain('Japanese');
    });

    test('switches tone between balanced and strict', () => {
        const balanced = getReviewSystemPrompt(makeConfig({ reviewTone: 'balanced' }));
        const strict = getReviewSystemPrompt(makeConfig({ reviewTone: 'strict' }));

        expect(balanced).toContain('constructive, team-friendly tone');
        expect(strict).toContain('strict production-readiness tone');

        const balancedScan = getScanSystemPrompt(makeConfig({ reviewTone: 'balanced' }));
        expect(balancedScan).toContain('constructive, team-friendly tone');
    });
});

describe('precision over recall', () => {
    const prompts = [
        ['review', getReviewSystemPrompt(makeConfig())],
        ['scan', getScanSystemPrompt(makeConfig())],
    ] as const;

    for (const [name, prompt] of prompts) {
        test(`${name} prompt drops the coercion that manufactured findings`, () => {
            expect(prompt).not.toContain('MUST check ALL');
            expect(prompt).not.toContain('is NOT acceptable');
            expect(prompt).not.toContain('lazy');
            expect(prompt).not.toContain('For EVERY file');
        });

        test(`${name} prompt requires a concrete failure scenario`, () => {
            expect(prompt).toContain('concrete failure scenario');
            expect(prompt.toLowerCase()).toContain('reachable');
        });

        test(`${name} prompt makes an empty result valid`, () => {
            expect(prompt.toLowerCase()).toContain('valid');
            expect(prompt).toMatch(/no issues|empty array/i);
        });

        test(`${name} prompt asks for confidence and omission over hedging`, () => {
            expect(prompt.toLowerCase()).toContain('confidence');
            expect(prompt).toMatch(/omit/i);
        });

        test(`${name} prompt frames categories as a lens, not a checklist`, () => {
            expect(prompt).toMatch(/skip the rest|skip what/i);
            expect(prompt).toMatch(/not a (form|checklist)/i);
        });
    }
});

describe('machine-parseable scan contract', () => {
    const scan = getScanSystemPrompt(makeConfig());

    test('preserves every field the downstream parser reads', () => {
        // These names are consumed by parseScanIssues in scanner.ts, the zod
        // IssueSchema, and ISSUE_JSON_SCHEMA in provider-runtime.ts.
        for (const field of [
            'category', 'severity', 'confidence', 'title', 'line', 'lineEnd',
            'codeContext', 'description', 'suggestedFix', 'aiPrompt',
        ]) {
            expect(scan).toContain(`"${field}"`);
        }
    });

    test('keeps the exact category and severity enums', () => {
        for (const category of [
            'bug', 'runtime', 'security', 'performance',
            'style', 'antipattern', 'crossfile', 'test',
        ]) {
            expect(scan).toContain(`"${category}"`);
        }

        for (const severity of ['critical', 'warning', 'info']) {
            expect(scan).toContain(`"${severity}"`);
        }
    });

    test('still specifies the top-level issues array and empty response', () => {
        expect(scan).toContain('"issues"');
        expect(scan).toContain('{"issues":[]}');
    });
});

describe('triage prompt', () => {
    test('keeps its JSON score contract and rates on evidence', () => {
        expect(TRIAGE_SYSTEM_PROMPT).toContain('{"score": <integer>}');
        expect(TRIAGE_SYSTEM_PROMPT).toMatch(/evidence/i);
    });
});
