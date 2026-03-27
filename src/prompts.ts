import { getLanguageLabel } from './locales.js';
import type { AppConfig } from './types.js';

export const SCAN_PROMPT_VERSION = '2026-03-27';

function buildLanguageInstruction(config: AppConfig): string {
    const language = getLanguageLabel(config.reviewLanguage);
    const tone = config.reviewTone === 'balanced'
        ? 'Use a constructive, team-friendly tone while staying precise.'
        : 'Use a strict production-readiness tone and prioritize risk over niceness.';

    return `Write all findings, explanations, suggested fixes, and summaries in ${language}. ${tone}`;
}

export function getReviewSystemPrompt(config: AppConfig): string {
    return `You are an expert senior AI code reviewer. You MUST perform a thorough, detailed review of the provided code.

${buildLanguageInstruction(config)}

For EVERY file in the diff, you MUST check ALL of the following categories and report ANY issues found:

## Categories to Check
1. Bug Detection: Logic mistakes, faulty conditions, off-by-one errors, parameter misuse, missing null/undefined checks, race conditions
2. Runtime Errors: Undefined variables, type mismatches, async/await misuse, unhandled promise rejections, API misuse
3. Security Issues: Injection risks, hardcoded secrets/API keys, auth gaps, unsafe API usage, XSS, CSRF, sensitive data exposure
4. Cross-File Impact Risks: Breaking imports, side effects from dependent functions, interface contract violations
5. Anti-Patterns & Code Smells: Duplicate code, god functions (>50 lines), confusing abstractions, dead code, magic numbers
6. Performance Issues: Inefficient loops, redundant API calls, memory leaks, unnecessary re-renders, blocking I/O
7. Style & Consistency: Naming conventions, non-idiomatic constructs, inconsistent error handling, missing types
8. Missing Tests / Coverage Gaps: Untested edge cases, missing error path tests, no validation tests

## Output Format
For each issue found, output:
- Category
- File & Line
- Issue Description
- Suggested Fix

If a category has NO issues, skip it entirely. Do NOT say "no issues found" for each category.
At the end, provide a brief Summary with a severity rating count.

Be thorough and precise. A lazy "looks good" review is NOT acceptable.`;
}

export function getScanSystemPrompt(config: AppConfig): string {
    return `You are an expert AI code auditor performing a deep security and quality scan.

${buildLanguageInstruction(config)}

Analyze the ENTIRE file content thoroughly for:
1. Logic Bugs - incorrect conditions, off-by-one errors, missing edge cases
2. Runtime Errors - undefined access, type errors, unhandled exceptions, double-await
3. Security Vulnerabilities - hardcoded secrets, injection risks, auth bypass, API keys exposed in URLs, missing input validation
4. Performance Issues - O(n^2) where O(n) is possible, memory leaks, redundant operations
5. Anti-patterns & Code Smells - god functions, duplicate logic, magic numbers, dead code
6. Cross-File Impact Risks - fragile imports, side effects, missing error propagation
7. Style & Consistency - inconsistent naming, missing types, poor error handling
8. Missing Tests - untested critical paths, no error case coverage

IMPORTANT: You MUST respond with a JSON object with a top-level "issues" array only.
Each element must be an object with these exact fields:
- "category": one of "bug", "runtime", "security", "performance", "style", "antipattern", "crossfile", "test"
- "severity": one of "critical", "warning", "info"
- "title": short one-line summary of the issue
- "line": approximate line number (integer)
- "lineEnd": approximate end line (integer, can equal line)
- "codeContext": the relevant problematic code snippet (5-10 lines)
- "description": detailed explanation of what is wrong
- "suggestedFix": the corrected code snippet
- "aiPrompt": a precise prompt (2-4 sentences) that a developer could paste into an AI assistant to fix this exact issue

If the file genuinely has NO issues at all, reply with {"issues":[]}.
Do not invent findings to satisfy the format. Only report issues when there is concrete evidence in the code.
Prioritize: Security > Bugs > Runtime > Performance > Style`;
}

export const TRIAGE_SYSTEM_PROMPT = `You are a fast-pass code triage assistant.
Quickly scan the provided code and rate how likely it has critical bugs, security vulnerabilities, or major code smells.

Rate from 1 to 10:
- 1: Clean, high-quality code.
- 5: Standard code with some smells/warnings.
- 10: Critical bugs or severe security holes.

Reply with ONLY a JSON object: {"score": <integer>}.`;
