import type { ScanIssue } from './types.js';

// ── Static Analysis Engine ──
// Catches common issues in MILLISECONDS without any LLM call.
// This runs first, and the LLM only handles what static analysis can't.

interface StaticRule {
    id: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    /** Regex pattern to match against each line */
    pattern: RegExp;
    /** File extensions this rule applies to (empty = all) */
    extensions?: string[];
    /** Generate a suggested fix hint */
    suggestedFix?: string;
}

const JS_LIKE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs'];
const TS_LIKE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const JS_TS_EXTENSIONS = [...TS_LIKE_EXTENSIONS, ...JS_LIKE_EXTENSIONS];

const STATIC_RULES: StaticRule[] = [
    // ── Security ──
    {
        id: 'hardcoded-secret',
        category: 'security',
        severity: 'critical',
        title: 'Hardcoded secret/API key detected',
        description:
            'API keys, passwords, or tokens should never be hardcoded. Use environment variables instead.',
        pattern:
            /(?:api[_-]?key|secret|password|token|auth)\s*[:=]\s*['"`][A-Za-z0-9_\-]{16,}['"`]/i,
        suggestedFix: 'Move the secret to an environment variable: process.env.YOUR_SECRET',
    },
    {
        id: 'exposed-env-key',
        category: 'security',
        severity: 'critical',
        title: 'Potential secret in string interpolation / URL',
        description:
            'Embedding secrets directly in URLs or interpolated strings can expose them in logs and network traffic.',
        pattern: /['"`]https?:\/\/[^'"`]*(?:key|token|secret|password)=[^'"`]+['"`]/i,
        suggestedFix: 'Pass secrets via headers (Authorization) instead of query parameters.',
    },
    {
        id: 'eval-usage',
        category: 'security',
        severity: 'critical',
        title: 'Usage of eval() detected',
        description: 'eval() executes arbitrary code and is a major security risk. Avoid it.',
        pattern: /\beval\s*\(/,
        extensions: JS_TS_EXTENSIONS,
        suggestedFix: 'Use JSON.parse() for data, or a proper parser/interpreter for code.',
    },
    {
        id: 'innerhtml-usage',
        category: 'security',
        severity: 'warning',
        title: 'innerHTML / dangerouslySetInnerHTML usage',
        description: 'Direct HTML injection can lead to XSS vulnerabilities.',
        pattern: /(?:\.innerHTML\s*=|dangerouslySetInnerHTML)/,
        extensions: JS_TS_EXTENSIONS,
        suggestedFix: 'Sanitize HTML with DOMPurify or use textContent instead.',
    },

    // ── Bugs ──
    {
        id: 'console-log',
        category: 'style',
        severity: 'info',
        title: 'console.log left in code',
        description: 'Debug console.log statements should be removed before production.',
        pattern: /\bconsole\.log\s*\(/,
        extensions: JS_TS_EXTENSIONS,
        suggestedFix: 'Remove or replace with a proper logger.',
    },
    {
        id: 'todo-fixme',
        category: 'style',
        severity: 'info',
        title: 'TODO/FIXME/HACK comment found',
        description:
            'Unresolved TODO/FIXME/HACK comments indicate incomplete work. Resolve or track them.',
        pattern: /\/\/\s*(?:TODO|FIXME|HACK|XXX)\b/i,
        suggestedFix: 'Resolve the TODO or convert it to a tracked issue.',
    },
    {
        id: 'empty-catch',
        category: 'bug',
        severity: 'warning',
        title: 'Empty catch block',
        description:
            'Swallowing errors silently makes debugging extremely difficult. At minimum log the error.',
        pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
        extensions: JS_TS_EXTENSIONS,
        suggestedFix: 'Add error logging: catch (e) { console.error(e); }',
    },
    {
        id: 'triple-eq',
        category: 'bug',
        severity: 'warning',
        title: 'Loose equality (== or !=) used instead of strict',
        description:
            'Loose equality can cause unexpected type coercion. Use === and !== instead.',
        pattern: /[^=!<>]==[^=]|[^=!]!=[^=]/,
        extensions: JS_TS_EXTENSIONS,
        suggestedFix: 'Replace == with === and != with !==',
    },

    // ── Performance ──
    {
        id: 'sync-fs',
        category: 'performance',
        severity: 'warning',
        title: 'Synchronous file system operation',
        description:
            'Sync fs methods (readFileSync, writeFileSync, etc.) block the event loop. Use async versions.',
        pattern: /\b(?:readFileSync|writeFileSync|appendFileSync|mkdirSync|readdirSync|statSync|existsSync|unlinkSync|copyFileSync|renameSync)\b/,
        extensions: JS_TS_EXTENSIONS,
        suggestedFix: 'Use the async version: readFile, writeFile, etc.',
    },
    {
        id: 'no-await-in-loop',
        category: 'performance',
        severity: 'warning',
        title: 'Await inside loop (sequential execution)',
        description:
            'Using await inside a for/while loop executes promises sequentially. Consider Promise.all() for parallelism.',
        pattern: /(?:for|while)\s*\([\s\S]*\)\s*\{[^}]*await\b/,
        extensions: JS_TS_EXTENSIONS,
        suggestedFix: 'Collect promises and use Promise.all() or Promise.allSettled() for parallel execution.',
    },

    // ── Anti-patterns ──
    {
        id: 'any-type',
        category: 'antipattern',
        severity: 'info',
        title: 'Usage of "any" type',
        description:
            'Using "any" defeats the purpose of TypeScript. Use specific types or "unknown".',
        pattern: /:\s*any\b/,
        extensions: TS_LIKE_EXTENSIONS,
        suggestedFix: 'Replace "any" with a specific type or use "unknown" with type guards.',
    },
    {
        id: 'ts-ignore',
        category: 'antipattern',
        severity: 'warning',
        title: '@ts-ignore suppressing type errors',
        description:
            '@ts-ignore hides potential type errors. Fix the type issue or use @ts-expect-error with a comment.',
        pattern: /@ts-ignore/,
        extensions: TS_LIKE_EXTENSIONS,
        suggestedFix: 'Fix the type error, or use @ts-expect-error with a reason comment.',
    },

    // ── Python-specific ──
    {
        id: 'python-bare-except',
        category: 'bug',
        severity: 'warning',
        title: 'Bare except clause',
        description: 'Bare except catches all exceptions including SystemExit and KeyboardInterrupt.',
        pattern: /^\s*except\s*:/,
        extensions: ['.py'],
        suggestedFix: 'Use except Exception: or catch specific exception types.',
    },

];

/**
 * Run static analysis on a single file's content.
 * Returns issues found in milliseconds — no network call needed.
 */
export function analyzeFileStatic(filePath: string, content: string): ScanIssue[] {
    const lastDotIndex = filePath.lastIndexOf('.');
    const ext = lastDotIndex > 0 && lastDotIndex > filePath.lastIndexOf('/')
        ? filePath.slice(lastDotIndex)
        : '';
    const lines = content.split('\n');
    const issues: ScanIssue[] = [];
    const seenRules = new Set<string>(); // only report each rule once per file for noise-reduction

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const rule of STATIC_RULES) {
            // Skip if rule doesn't apply to this file extension
            if (rule.extensions && rule.extensions.length > 0 && !rule.extensions.includes(ext)) {
                continue;
            }

            // DO NOT process this file if it is the static analyzer reading its own rules
            if (filePath.endsWith('static-analysis.ts')) {
                continue;
            }

            // Skip if we already reported this rule for this file
            if (seenRules.has(rule.id)) continue;

            if (rule.pattern.test(line)) {
                seenRules.add(rule.id);

                // Collect context lines (2 before, 2 after)
                const contextStart = Math.max(0, i - 2);
                const contextEnd = Math.min(lines.length - 1, i + 2);
                const codeContext = lines.slice(contextStart, contextEnd + 1).join('\n');

                issues.push({
                    category: rule.category,
                    severity: rule.severity,
                    title: rule.title,
                    line: i + 1,
                    lineEnd: i + 1,
                    codeContext,
                    description: rule.description,
                    suggestedFix: rule.suggestedFix || '',
                    aiPrompt: `In file "${filePath}" at line ${i + 1}: ${rule.description}. The problematic code is: \`${line.trim()}\`. Please fix this issue.`,
                    file: filePath,
                });
            }
        }
    }

    // ── Structural checks (whole-file) ──

    if (ext === '.sh' && !content.includes('set -e')) {
        issues.push({
            category: 'bug',
            severity: 'warning',
            title: 'Shell script without set -e',
            line: 1,
            lineEnd: 1,
            codeContext: lines[0] || '',
            description: 'Without "set -e", shell scripts continue execution after errors.',
            suggestedFix: 'Add "set -euo pipefail" near the top of the script.',
            aiPrompt: `The shell script "${filePath}" is missing "set -e". Shell scripts should exit on error to prevent cascading failures.`,
            file: filePath,
        });
    }

    // Check for very long functions (>80 lines) — simple heuristic
    if (JS_TS_EXTENSIONS.includes(ext)) {
        let braceDepth = 0;
        let funcStartLine = -1;
        let funcName = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const funcMatch = line.match(
                /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{)/
            );
            if (funcMatch && braceDepth === 0) {
                funcName = funcMatch[1] || funcMatch[2] || funcMatch[3] || 'anonymous';
                funcStartLine = i;
            }

            for (const ch of line) {
                if (ch === '{') braceDepth++;
                if (ch === '}') {
                    braceDepth--;
                    if (braceDepth === 0 && funcStartLine >= 0) {
                        const funcLength = i - funcStartLine;
                        if (funcLength > 80) {
                            issues.push({
                                category: 'antipattern',
                                severity: 'warning',
                                title: `Long function: "${funcName}" (${funcLength} lines)`,
                                line: funcStartLine + 1,
                                lineEnd: i + 1,
                                codeContext: `function ${funcName} spans lines ${funcStartLine + 1}–${i + 1}`,
                                description: `The function "${funcName}" is ${funcLength} lines long. Functions over 50-80 lines are harder to test, debug and understand. Consider breaking it into smaller functions.`,
                                suggestedFix: `Break "${funcName}" into smaller, focused helper functions.`,
                                aiPrompt: `The function "${funcName}" in "${filePath}" is ${funcLength} lines long (lines ${funcStartLine + 1}–${i + 1}). Refactor it into smaller, single-responsibility functions.`,
                                file: filePath,
                            });
                        }
                        funcStartLine = -1;
                    }
                }
            }
        }
    }

    return issues;
}
