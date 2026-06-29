import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import type { ScanIssue } from './types.js';

const TOOL_TIMEOUT_MS = 120_000;

function run(cmd: string, args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
    const r = spawnSync(cmd, args, {
        cwd,
        encoding: 'utf-8',
        timeout: TOOL_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
    });
    return {
        ok: r.status === 0,
        stdout: r.stdout || '',
        stderr: r.stderr || '',
    };
}

function has(cmd: string): boolean {
    return spawnSync(cmd, ['--version'], { stdio: 'ignore', timeout: 5000 }).status === 0;
}

function eslintIssues(stdout: string, files: string[]): ScanIssue[] {
    const issues: ScanIssue[] = [];
    for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
            const row = JSON.parse(line) as {
                filePath?: string;
                messages?: Array<{ line?: number; endLine?: number; message?: string; ruleId?: string; severity?: number }>;
            };
            const file = row.filePath ? path.relative(process.cwd(), row.filePath) : '';
            if (!file || (files.length && !files.some((f) => f === file || file.endsWith(f)))) continue;
            for (const m of row.messages || []) {
                const sev = m.severity === 2 ? 'critical' : 'warning';
                issues.push({
                    category: 'style',
                    severity: sev,
                    title: m.ruleId ? `eslint: ${m.ruleId}` : 'eslint finding',
                    line: m.line || 1,
                    lineEnd: m.endLine || m.line || 1,
                    codeContext: '',
                    description: m.message || '',
                    suggestedFix: '',
                    aiPrompt: `Fix eslint ${m.ruleId || 'issue'} in ${file}:${m.line}`,
                    file,
                });
            }
        } catch {
            /* skip non-json lines */
        }
    }
    return issues;
}

function ruffIssues(stdout: string, files: string[]): ScanIssue[] {
    const issues: ScanIssue[] = [];
    for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
            const row = JSON.parse(line) as {
                filename?: string;
                location?: { row?: number; end_row?: number };
                message?: string;
                code?: string;
            };
            const file = row.filename ? path.relative(process.cwd(), row.filename) : '';
            if (!file) continue;
            if (files.length && !files.some((f) => f === file)) continue;
            issues.push({
                category: 'style',
                severity: 'warning',
                title: row.code ? `ruff: ${row.code}` : 'ruff finding',
                line: row.location?.row || 1,
                lineEnd: row.location?.end_row || row.location?.row || 1,
                codeContext: '',
                description: row.message || '',
                suggestedFix: '',
                aiPrompt: `Fix ruff ${row.code || ''} in ${file}`,
                file,
            });
        } catch {
            /* skip */
        }
    }
    return issues;
}

function semgrepIssues(stdout: string, files: string[]): ScanIssue[] {
    const issues: ScanIssue[] = [];
    try {
        const data = JSON.parse(stdout) as {
            results?: Array<{
                path?: string;
                start?: { line?: number; col?: number };
                end?: { line?: number };
                extra?: { message?: string; severity?: string; metadata?: { category?: string } };
                check_id?: string;
            }>;
        };
        for (const r of data.results || []) {
            const file = r.path ? path.relative(process.cwd(), r.path) : '';
            if (!file) continue;
            if (files.length && !files.some((f) => f === file)) continue;
            const sev = r.extra?.severity === 'ERROR' ? 'critical' : 'warning';
            issues.push({
                category: r.extra?.metadata?.category || 'security',
                severity: sev,
                title: r.check_id || 'semgrep finding',
                line: r.start?.line || 1,
                lineEnd: r.end?.line || r.start?.line || 1,
                codeContext: '',
                description: r.extra?.message || '',
                suggestedFix: '',
                aiPrompt: `Address semgrep rule ${r.check_id} in ${file}`,
                file,
            });
        }
    } catch {
        /* ignore */
    }
    return issues;
}

function gitleaksIssues(stdout: string): ScanIssue[] {
    const issues: ScanIssue[] = [];
    for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
            const row = JSON.parse(line) as {
                File?: string;
                StartLine?: number;
                EndLine?: number;
                Description?: string;
                RuleID?: string;
            };
            const file = row.File || '';
            issues.push({
                category: 'security',
                severity: 'critical',
                title: row.RuleID ? `gitleaks: ${row.RuleID}` : 'Secret detected',
                line: row.StartLine || 1,
                lineEnd: row.EndLine || row.StartLine || 1,
                codeContext: '',
                description: row.Description || 'Potential secret in repository',
                suggestedFix: 'Rotate the credential and move it to a secret manager / env var.',
                aiPrompt: `Remove leaked secret in ${file} and rotate credentials.`,
                file,
            });
        } catch {
            /* skip */
        }
    }
    return issues;
}

function tscIssues(stderr: string, files: string[]): ScanIssue[] {
    const issues: ScanIssue[] = [];
    const re = /^(.+)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stderr)) !== null) {
        const file = path.relative(process.cwd(), m[1]);
        if (files.length && !files.some((f) => f === file)) continue;
        const line = Number(m[2]) || 1;
        issues.push({
            category: 'bug',
            severity: 'critical',
            title: 'TypeScript error',
            line,
            lineEnd: line,
            codeContext: '',
            description: m[4],
            suggestedFix: '',
            aiPrompt: `Fix TypeScript error in ${file}:${line}: ${m[4]}`,
            file,
        });
    }
    return issues;
}

/** Run configured linters and return normalized findings. */
export async function runExternalTools(
    enabled: string[] | undefined,
    files: string[],
): Promise<ScanIssue[]> {
    if (!enabled?.length) return [];
    const cwd = process.cwd();
    const out: ScanIssue[] = [];
    const fileArgs = files.length > 0 && files.length < 200 ? files : [];

    for (const tool of enabled) {
        const id = tool.toLowerCase();
        if (id === 'eslint' && has('eslint')) {
            const args = ['--format', 'json', '--no-error-on-unmatched-pattern', ...fileArgs];
            const r = run('eslint', args.length > 3 ? args : ['--format', 'json', '.'], cwd);
            out.push(...eslintIssues(r.stdout, files));
        } else if (id === 'ruff' && has('ruff')) {
            const args = ['check', '--output-format', 'json', ...(fileArgs.length ? fileArgs : ['.'])];
            const r = run('ruff', args, cwd);
            out.push(...ruffIssues(r.stdout, files));
        } else if (id === 'semgrep' && has('semgrep')) {
            const args = ['scan', '--json', '--quiet', ...(fileArgs.length ? fileArgs : ['.'])];
            const r = run('semgrep', args, cwd);
            out.push(...semgrepIssues(r.stdout, files));
        } else if (id === 'gitleaks' && has('gitleaks')) {
            const r = run('gitleaks', ['detect', '--no-banner', '--report-format', 'json', '--report-path', '-', '--source', '.'], cwd);
            const text = r.stdout || r.stderr;
            out.push(...gitleaksIssues(text));
        } else if ((id === 'typescript' || id === 'tsc') && has('tsc')) {
            const r = run('tsc', ['--noEmit', '--pretty', 'false'], cwd);
            if (!r.ok) out.push(...tscIssues(r.stderr + r.stdout, files));
        } else if (id === 'biome' && has('biome')) {
            const args = ['check', '--reporter', 'json', ...(fileArgs.length ? fileArgs : ['.'])];
            const r = run('biome', args, cwd);
            try {
                const data = JSON.parse(r.stdout) as { diagnostics?: Array<{ location?: { path?: { file?: string }; span?: number[] }; message?: string; severity?: string }> };
                for (const d of data.diagnostics || []) {
                    const fp = d.location?.path?.file;
                    if (!fp) continue;
                    const file = path.relative(cwd, fp);
                    issuesPushBiome(out, file, d);
                }
            } catch {
                /* biome json optional */
            }
        }
    }
    return out;
}

function issuesPushBiome(
    out: ScanIssue[],
    file: string,
    d: { location?: { span?: number[] }; message?: string; severity?: string },
): void {
    const line = (d.location?.span?.[0] ?? 0) + 1;
    out.push({
        category: 'style',
        severity: d.severity === 'error' ? 'critical' : 'warning',
        title: 'biome finding',
        line,
        lineEnd: line,
        codeContext: '',
        description: d.message || '',
        suggestedFix: '',
        aiPrompt: `Fix biome issue in ${file}:${line}`,
        file,
    });
}