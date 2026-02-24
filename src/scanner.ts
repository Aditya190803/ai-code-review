import * as fs from 'fs-extra';
import { createHash } from 'crypto';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { getModel } from './config.js';
import { git, getCodeFiles } from './git.js';
import { analyzeFileStatic } from './static-analysis.js';
import { extractMeaningfulCode } from './ast.js';
import { SCAN_SYSTEM_PROMPT, TRIAGE_SYSTEM_PROMPT } from './prompts.js';
import type { ScanIssue, AppConfig } from './types.js';

const IssueSchema = z.object({
    issues: z.array(z.object({
        category: z.enum(['bug', 'runtime', 'security', 'performance', 'style', 'antipattern', 'crossfile', 'test']),
        severity: z.enum(['critical', 'warning', 'info']),
        title: z.string(),
        line: z.number(),
        lineEnd: z.number(),
        codeContext: z.string(),
        description: z.string(),
        suggestedFix: z.string(),
        aiPrompt: z.string(),
    })),
});

// ── Rate limit retry helper ──
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (e: any) {
            if (attempt === maxRetries) throw e;
            const msg = e?.message?.toLowerCase() || '';
            const status = e?.status || e?.statusCode;
            if (status === 429 || msg.includes('rate') || msg.includes('too many requests')) {
                const delay = baseDelay * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw e; // Don't retry non-rate-limit errors
            }
        }
    }
    throw new Error('Unreachable');
}

// ── Parse AI response into structured issues ──
export function parseScanIssues(parsed: any, fileName: string): ScanIssue[] {
    if (!parsed || !Array.isArray(parsed.issues)) return [];

    return parsed.issues.map((item: any) => ({
        category: item.category || 'bug',
        severity: item.severity || 'info',
        title: item.title || 'Untitled issue',
        line: item.line ?? 0,
        lineEnd: item.lineEnd ?? item.line ?? 0,
        codeContext: item.codeContext || '',
        description: item.description || '',
        suggestedFix: item.suggestedFix || '',
        aiPrompt: item.aiPrompt || '',
        file: fileName,
    }));
}

// ── Scan callbacks for reactive UI updates ──
export interface ScanCallbacks {
    onProgress: (msg: string) => void;
    onLog: (msg: string) => void;
    onIssuesUpdate: (issues: ScanIssue[]) => void;
    onReviewUpdate: (text: string) => void;
}

// ── Maximum number of concurrent LLM calls by provider ──
const PROVIDER_CONCURRENCY: Record<string, number> = {
    groq: 15,
    cerebras: 15,
    nvidia: 10,
    openai: 8,
    anthropic: 5,
    google: 10,
    openrouter: 10,
};

/**
 * Run a batch of promises with limited concurrency.
 * This is the key performance improvement — scanning files in parallel.
 */
async function runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number
): Promise<T[]> {
    const results: T[] = [];
    let index = 0;

    async function worker() {
        while (index < tasks.length) {
            const currentIndex = index++;
            results[currentIndex] = await tasks[currentIndex]();
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

/**
 * Scan a single file: static analysis first, then LLM for deeper issues.
 */
async function scanSingleFile(
    file: string,
    config: AppConfig,
    callbacks: ScanCallbacks
): Promise<{ issues: ScanIssue[]; scanned: boolean; error?: string }> {
    try {
        const content = await fs.readFile(file, 'utf-8');

        if (content.trim().length === 0) {
            return { issues: [], scanned: false };
        }

        if (content.length > 50000) {
            callbacks.onLog(`⏭️ Skipped \`${file}\` (too large: ${Math.round(content.length / 1024)}KB)`);
            return { issues: [], scanned: false };
        }

        // ── Phase 1: Instant static analysis (milliseconds) ──
        const staticIssues = analyzeFileStatic(file, content);
        if (staticIssues.length > 0) {
            callbacks.onLog(
                `⚡ ${staticIssues.length} static issue(s) in \`${file}\` (instant)`
            );
        }

        // ── Phase 2: LLM deep scan (seconds) ──
        let aiIssues: ScanIssue[] = [];
        try {
            const { object: parsed } = await generateObject({
                model: getModel(config),
                schema: IssueSchema,
                system: SCAN_SYSTEM_PROMPT,
                prompt: `File: ${file}\nFile size: ${content.length} characters\nLines: ${content.split('\n').length}\n\nFull contents:\n\`\`\`\n${content}\n\`\`\``,
            });

            aiIssues = parseScanIssues(parsed, file);

            if (aiIssues.length > 0) {
                callbacks.onLog(`${aiIssues.length} AI issue(s) in \`${file}\``);
            }
        } catch (e) {
            const errMsg = (e as Error).message.slice(0, 100);
            callbacks.onLog(`Warning: AI scan failed for \`${file}\`: ${errMsg} (static results still valid)`);
        }

        // Merge & deduplicate (prefer AI issues if titles overlap)
        const allIssues = deduplicateIssues([...staticIssues, ...aiIssues]);

        if (allIssues.length === 0) {
            callbacks.onLog(`\`${file}\` - clean`);
        }

        return { issues: allIssues, scanned: true };
    } catch (e) {
        const errMsg = (e as Error).message.slice(0, 100);
        callbacks.onLog(`Error scanning \`${file}\`: ${errMsg}`);
        return { issues: [], scanned: false, error: errMsg };
    }
}

/**
 * Remove duplicate issues (same file + similar line + similar title).
 */
function deduplicateIssues(issues: ScanIssue[]): ScanIssue[] {
    const seen = new Set<string>();
    return issues.filter((issue) => {
        const key = `${issue.file}:${issue.line}:${issue.category}:${issue.title.toLowerCase().slice(0, 30)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Full codebase scan with:
 * 1. Instant static analysis (Phase 1)
 * 2. Parallel LLM deep scan (Phase 2) with configurable concurrency
 */
export interface ScanResult {
    issues: ScanIssue[];
    durationSecs: number;
}

export async function scanCodebase(
    config: AppConfig,
    callbacks: ScanCallbacks,
    filesToScan?: string[],
    abortSignal?: AbortSignal
): Promise<ScanResult> {
    const scanStartTime = Date.now();

    callbacks.onProgress('Discovering files...');
    const codeFiles = filesToScan || await getCodeFiles();

    if (codeFiles.length === 0) {
        callbacks.onLog('No code files found in the project to scan.');
        callbacks.onReviewUpdate('No code files found to scan.');
        return { issues: [], durationSecs: 0 };
    }

    callbacks.onProgress(`Found ${codeFiles.length} code files. Running static analysis...`);

    // ── Phase 1: Instant static analysis on ALL files (parallel, no network) ──
    const phase1Start = Date.now();
    const staticResults: ScanIssue[] = [];

    const fileContents = await Promise.all(
        codeFiles.map(async (file) => {
            try {
                const content = await fs.readFile(file, 'utf-8');
                return { file, content };
            } catch {
                return { file, content: '' };
            }
        })
    );

    for (const { file, content } of fileContents) {
        if (content.trim().length === 0 || content.length > 50000) continue;
        const issues = analyzeFileStatic(file, content);
        staticResults.push(...issues);
    }

    if (staticResults.length > 0) {
        callbacks.onLog(
            `⚡ Fast static scan complete: ${staticResults.length} issues`
        );
        callbacks.onIssuesUpdate([...staticResults]);
    }

    const concurrency = Math.min(PROVIDER_CONCURRENCY[config.provider] || 5, 10);

    callbacks.onReviewUpdate(
        `## Live Codebase Scan\n\n` +
        `**Running AI Scan on ${codeFiles.length} files...**`
    );

    callbacks.onProgress(
        `Scanning ${codeFiles.length} files...`
    );

    // ── Load Cache ──
    const CACHE_FILE = '.ai-reviewer-cache.json';
    let cache: Record<string, { hash: string; issues: ScanIssue[]; timestamp: number }> = {};
    try {
        cache = await fs.readJson(CACHE_FILE);
    } catch (_) {
        cache = {};
    }

    const scannable = fileContents.filter(
        ({ content }) => content.trim().length > 0 && content.length <= 50000
    );

    const phase2Start = Date.now();
    let completedCount = 0;
    const allAiIssues: ScanIssue[] = [];
    let errorCount = 0;
    let cacheHits = 0;

    const renderProgress = (eta: number) => {
        const percentage = Math.floor((completedCount / scannable.length) * 100) || 0;
        const blocks = Math.floor(percentage / 5);
        const bar = '█'.repeat(blocks) + '░'.repeat(20 - blocks);
        return `Scanning: [${bar}] ${percentage}% (${completedCount}/${scannable.length}) ETA: ${Math.ceil(eta / 1000)}s`;
    };

    const tasks = scannable.map(({ file, content }) => async () => {
        if (abortSignal?.aborted) return [];
        try {
            const hash = createHash('sha256').update(content).digest('hex');
            const cached = cache[file];
            if (cached && cached.hash === hash) {
                completedCount++;
                cacheHits++;
                allAiIssues.push(...cached.issues);
                const elapsed = Date.now() - phase2Start;
                const avgTimePerFile = elapsed / completedCount;
                const remaining = (scannable.length - completedCount) * avgTimePerFile;
                callbacks.onProgress(renderProgress(remaining));
                callbacks.onLog(`♻️  Cache hit for \`${file}\``);
                const merged = deduplicateIssues([...staticResults, ...allAiIssues]);
                callbacks.onIssuesUpdate(merged);
                return cached.issues;
            }

            let contentToSend = extractMeaningfulCode(file, content);
            try {
                const fileDiff = await git.diff([file]);
                if (fileDiff && fileDiff.trim() !== '') {
                    contentToSend = fileDiff;
                }
            } catch (_) { }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 20_000); // 20s timeout
            if (abortSignal) {
                abortSignal.addEventListener('abort', () => controller.abort());
            }

            // ── Phase 1.5: Fast Triage ──
            try {
                const { object: triage } = await generateObject({
                    model: getModel(config),
                    schema: z.object({ score: z.number().min(1).max(10) }),
                    system: TRIAGE_SYSTEM_PROMPT,
                    prompt: `File: ${file}\n\n${contentToSend}`,
                    abortSignal: controller.signal,
                });
                const score = triage.score;
                if (score < 3) {
                    completedCount++;
                    callbacks.onLog(`✅ Triage: \`${file}\` looks clean (score ${score}) - skipping deep scan`);
                    const elapsed = Date.now() - phase2Start;
                    const avgTimePerFile = elapsed / completedCount;
                    const remaining = (scannable.length - completedCount) * avgTimePerFile;
                    callbacks.onProgress(renderProgress(remaining));

                    // Save "empty" result to cache so we don't triage again
                    cache[file] = { hash, issues: [], timestamp: Date.now() };
                    return [];
                }
            } catch (_) {
                // If triage fails, just continue to deep scan
            }

            const { object: parsed } = await withRetry(async () => {
                return await generateObject({
                    model: getModel(config),
                    schema: IssueSchema,
                    system: SCAN_SYSTEM_PROMPT,
                    prompt: `File: ${file}\nContext: ${contentToSend === content ? 'Full File' : 'Changed Lines Only (Diff)'}\n\nContents/Diff:\n\`\`\`\n${contentToSend}\n\`\`\``,
                    abortSignal: controller.signal,
                });
            });

            clearTimeout(timeout);
            const issues = parseScanIssues(parsed, file);

            // Save to cache
            cache[file] = {
                hash,
                issues,
                timestamp: Date.now()
            };

            completedCount++;
            const elapsed = Date.now() - phase2Start;
            const avgTimePerFile = elapsed / completedCount;
            const remaining = (scannable.length - completedCount) * avgTimePerFile;
            callbacks.onProgress(renderProgress(remaining));

            if (issues.length > 0) {
                allAiIssues.push(...issues);
                callbacks.onLog(`🚨 ${issues.length} AI issue(s) in \`${file}\``);
                // Live update issues count
                const merged = deduplicateIssues([...staticResults, ...allAiIssues]);
                callbacks.onIssuesUpdate(merged);
            } else {
                callbacks.onLog(`\`${file}\` - clean (AI)`);
            }

            return issues;
        } catch (e) {
            errorCount++;
            completedCount++;
            const errMsg = (e as Error).message.slice(0, 100);
            if ((e as Error).name === 'AbortError') {
                callbacks.onLog(`AI scan timeout for \`${file}\` (static results still valid)`);
            } else {
                callbacks.onLog(`AI error on \`${file}\`: ${errMsg}`);
            }

            const elapsed = Date.now() - phase2Start;
            const avgTimePerFile = elapsed / completedCount;
            const remaining = (scannable.length - completedCount) * avgTimePerFile;
            callbacks.onProgress(renderProgress(remaining));

            return [] as ScanIssue[];
        }
    });

    await runWithConcurrency(tasks, concurrency);

    // ── Save Cache ──
    try {
        await fs.writeJson(CACHE_FILE, cache, { spaces: 2 });
    } catch (_) { }

    // ── Final merge & dedup ──
    const finalIssues = deduplicateIssues([...staticResults, ...allAiIssues]);
    callbacks.onIssuesUpdate(finalIssues);
    callbacks.onProgress('');

    const totalDurationSecs = parseFloat(((Date.now() - scanStartTime) / 1000).toFixed(1));

    let finalHeader = `## Codebase Scan Report — Complete\n\n`;
    finalHeader += `- **Total files:** ${codeFiles.length} \n`;
    finalHeader += `- **Total time:** ${totalDurationSecs}s\n`;
    finalHeader += `---\n\n`;

    if (finalIssues.length > 0) {
        finalHeader += `Scan complete! **${finalIssues.length} issues** found.\n`;
    } else {
        finalHeader += `No major issues found across ${scannable.length} files.\n`;
    }

    callbacks.onReviewUpdate(finalHeader);
    return { issues: finalIssues, durationSecs: totalDurationSecs };
}
