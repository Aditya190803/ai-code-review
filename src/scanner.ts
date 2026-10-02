import * as fs from 'fs-extra';
import { createHash } from 'crypto';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from './config.js';
import { getProviderMaxOutputTokens, getProviderBaseURL } from './providers.js';
import { isExternalProvider, runExternalStructuredReview } from './provider-runtime.js';
import { getReviewContent, getReviewInput, getCodeFiles, type ReviewInput } from './git.js';
import { analyzeFileStatic } from './static-analysis.js';
import { ensureProjectIndex, getProjectContext } from './project-index.js';
import { getScanSystemPrompt, SCAN_PROMPT_VERSION } from './prompts.js';
import { formatReviewContextForPrompt, type ReviewContextBundle } from './review-context.js';
import type { ScanIssue, AppConfig, ProjectIndex, ReviewSelection, ReviewCompletion } from './types.js';

const IssueSchema = z.object({
    issues: z.array(
        z.object({
            category: z.enum([
                'bug',
                'runtime',
                'security',
                'performance',
                'style',
                'antipattern',
                'crossfile',
                'test',
            ]),
            severity: z.enum(['critical', 'warning', 'info']),
            confidence: z.enum(['high', 'medium']),
            title: z.string(),
            line: z.number().int().positive(),
            lineEnd: z.number().int().positive(),
            codeContext: z.string(),
            description: z.string(),
            suggestedFix: z.string(),
            aiPrompt: z.string(),
        }),
    ),
});

function toError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }

    if (typeof error === 'string') {
        return new Error(error);
    }

    try {
        return new Error(JSON.stringify(error));
    } catch {
        return new Error('Unknown error');
    }
}

// ── Rate limit retry helper ──
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000,
    abortSignal?: AbortSignal,
): Promise<T> {
    const createAbortError = () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        return error;
    };

    const wait = (delayMs: number) =>
        new Promise<void>((resolve, reject) => {
            if (abortSignal?.aborted) {
                reject(createAbortError());
                return;
            }

            const onAbort = () => {
                cleanup();
                reject(createAbortError());
            };

            const timeoutId = setTimeout(() => {
                cleanup();
                resolve();
            }, delayMs);

            const cleanup = () => {
                clearTimeout(timeoutId);
                abortSignal?.removeEventListener('abort', onAbort);
            };

            abortSignal?.addEventListener('abort', onAbort, { once: true });
        });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (e: unknown) {
            if (attempt === maxRetries) throw e;
            if (abortSignal?.aborted) throw createAbortError();
            const error = e as { message?: string; status?: number; statusCode?: number };
            const msg = error.message?.toLowerCase() || '';
            const status = error.status || error.statusCode;
            if (status === 429 || msg.includes('rate') || msg.includes('too many requests')) {
                const delay = baseDelay * Math.pow(2, attempt);
                await wait(delay);
            } else {
                throw e; // Don't retry non-rate-limit errors
            }
        }
    }
    throw new Error('Unreachable');
}

// ── Parse AI response into structured issues ──
export function parseScanIssues(parsed: Record<string, unknown>, fileName: string): ScanIssue[] {
    return IssueSchema.parse(parsed).issues.map((item) => ({ ...item, file: fileName }));
}

// ── Scan callbacks for reactive UI updates ──
export interface ScanCallbacks {
    onProgress: (msg: string) => void;
    onLog: (msg: string) => void;
    onIssuesUpdate: (issues: ScanIssue[]) => void;
    onReviewUpdate: (text: string) => void;
}

/**
 * Per-file budget covering the deep scan and bounded retries.
 *
 * This was 20s, which predates reasoning models. A reasoning model spends real
 * time on the reasoning trace before emitting any output, so a 20s ceiling
 * aborted essentially every file and surfaced as "AI scan timeout" with only
 * static-analysis results left behind.
 */
const API_TASK_TIMEOUT_MS = 180_000;
const EXTERNAL_TASK_TIMEOUT_MS = 180_000;

// ── Maximum number of concurrent LLM calls by provider ──
const PROVIDER_CONCURRENCY: Record<string, number> = {
    codex: 2,
    'claude-code': 2,
    opencode: 5,
    cerebras: 15,
    openai: 8,
    anthropic: 5,
    google: 10,
    openrouter: 10,
};

/**
 * Run a batch of promises with limited concurrency.
 * This is the key performance improvement — scanning files in parallel.
 */
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
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

export function changedLinesInDiff(diff: string): Set<number> {
    const changed = new Set<number>();
    let lineNumber = 0;
    let inHunk = false;
    for (const line of diff.split('\n')) {
        const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (hunk) {
            lineNumber = Number(hunk[1]);
            inHunk = true;
            // A pure deletion is anchored to the nearest surviving source line.
            if (hunk[2] === '0') changed.add(Math.max(1, lineNumber));
        } else if (line.startsWith('diff --git')) inHunk = false;
        else if (inHunk && line.startsWith('+')) changed.add(lineNumber++);
        else if (inHunk && line.startsWith(' ')) lineNumber++;
    }
    return changed;
}

/**
 * Full codebase scan with:
 * 1. Instant static analysis (Phase 1)
 * 2. Parallel LLM deep scan (Phase 2) with configurable concurrency
 */
export interface ScanResult extends ReviewCompletion {
    issues: ScanIssue[];
    durationSecs: number;
}

function computeScanCacheKey(
    config: AppConfig,
    reviewContext?: ReviewContextBundle,
    selection?: ReviewSelection,
): string {
    return createHash('sha256')
        .update(
            JSON.stringify({
                provider: config.provider,
                model: config.model,
                reviewLanguage: config.reviewLanguage || 'en',
                reviewTone: config.reviewTone || 'strict',
                promptVersion: SCAN_PROMPT_VERSION,
                pipelineVersion: 3,
                providerOptions: config.providerOptions,
                baseURL: getProviderBaseURL(config.provider),
                reviewContext,
                selection,
            }),
        )
        .digest('hex');
}

interface CachedScanEntry {
    hash: string;
    contextHash: string;
    issues: ScanIssue[];
    timestamp: number;
    scanCacheKey: string;
}

interface ScanRuntime {
    config: AppConfig;
    reviewContext?: ReviewContextBundle;
    callbacks: ScanCallbacks;
    filesToScan?: string[];
    abortSignal?: AbortSignal;
    scannable: ReviewInput[];
    staticResults: ScanIssue[];
    cache: Record<string, CachedScanEntry>;
    scanCacheKey: string;
    projectIndex: ProjectIndex;
    sourceContents: Map<string, string>;
    phase2Start: number;
    completedCount: number;
    allAiIssues: ScanIssue[];
    failedFiles: string[];
}

interface FileTaskContext {
    hash: string;
    projectContext: string;
    currentContextHash: string;
    cached?: CachedScanEntry;
}

function renderScanProgress(completedCount: number, totalCount: number, phase2Start: number): string {
    const percentage = Math.floor((completedCount / totalCount) * 100) || 0;
    const blocks = Math.floor(percentage / 5);
    const bar = '█'.repeat(blocks) + '░'.repeat(20 - blocks);
    const elapsed = Date.now() - phase2Start;
    const avgTimePerFile = completedCount > 0 ? elapsed / completedCount : 0;
    const remaining = (totalCount - completedCount) * avgTimePerFile;
    return `Scanning: [${bar}] ${percentage}% (${completedCount}/${totalCount}) ETA: ${Math.ceil(remaining / 1000)}s`;
}

function buildFileTaskContext(runtime: ScanRuntime, file: string, content: string, diff?: string): FileTaskContext {
    const hash = createHash('sha256').update(JSON.stringify({ content, diff })).digest('hex');
    const projectContext = getProjectContext(runtime.projectIndex, file, {
        changedFiles: runtime.filesToScan,
        sourceContents: runtime.sourceContents,
    });
    const currentContextHash = createHash('sha256')
        .update(projectContext + runtime.projectIndex.revision)
        .digest('hex');

    return {
        hash,
        projectContext,
        currentContextHash,
        cached: runtime.cache[file],
    };
}

function recordTaskProgress(runtime: ScanRuntime, file: string, issueCount: number, message: string): void {
    runtime.completedCount++;
    runtime.callbacks.onLog(message);
    runtime.callbacks.onProgress(
        renderScanProgress(runtime.completedCount, runtime.scannable.length, runtime.phase2Start),
    );

    if (issueCount > 0) {
        runtime.callbacks.onIssuesUpdate(deduplicateIssues(runtime.allAiIssues));
    }
}

function storeCacheEntry(runtime: ScanRuntime, file: string, context: FileTaskContext, issues: ScanIssue[]): void {
    if (runtime.abortSignal?.aborted) return;

    runtime.cache[file] = {
        hash: context.hash,
        contextHash: context.currentContextHash,
        issues,
        timestamp: Date.now(),
        scanCacheKey: runtime.scanCacheKey,
    };
}

function handleCacheHit(runtime: ScanRuntime, file: string, cached: CachedScanEntry): ScanIssue[] {
    runtime.allAiIssues.push(...cached.issues);
    recordTaskProgress(runtime, file, cached.issues.length, `♻️  Cache hit for \`${file}\``);
    return cached.issues;
}

function handleDetectedIssues(runtime: ScanRuntime, file: string, issues: ScanIssue[]): ScanIssue[] {
    if (issues.length > 0) {
        runtime.allAiIssues.push(...issues);
        recordTaskProgress(runtime, file, issues.length, `🚨 ${issues.length} AI issue(s) in \`${file}\``);
        return issues;
    }

    recordTaskProgress(runtime, file, 0, `\`${file}\` - clean (AI)`);
    return issues;
}

function handleTaskFailure(runtime: ScanRuntime, file: string, error: unknown): ScanIssue[] {
    runtime.failedFiles.push(file);
    const err = toError(error);
    const errMsg = err.message.slice(0, 100);

    if (err.name === 'AbortError') {
        runtime.callbacks.onLog(`AI scan interrupted for \`${file}\`; review is incomplete`);
    } else {
        runtime.callbacks.onLog(`AI error on \`${file}\`: ${errMsg}`);
    }

    runtime.completedCount++;
    runtime.callbacks.onProgress(
        renderScanProgress(runtime.completedCount, runtime.scannable.length, runtime.phase2Start),
    );
    return [] as ScanIssue[];
}

async function runDeepScan(
    runtime: ScanRuntime,
    file: string,
    contentToSend: string,
    projectContext: string,
    abortSignal: AbortSignal,
): Promise<ScanIssue[]> {
    const system = getScanSystemPrompt(runtime.config);
    const reviewModeInstruction = contentToSend.startsWith('diff --git ')
        ? 'Review mode: git diff. Focus findings on added, modified, or deleted code. For deleted files use original line numbers and prove the deletion breaks surviving callers. Only mention unchanged context when it directly proves a changed-line bug.'
        : 'Review mode: full file. Review the file contents for concrete issues.';
    const teamContext = runtime.reviewContext ? formatReviewContextForPrompt(file, runtime.reviewContext) : '';
    const candidates = runtime.staticResults
        .filter((issue) => issue.file === file)
        .map((issue) => ({ title: issue.title, line: issue.line, description: issue.description }));
    const prompt = `File: ${file}\n${reviewModeInstruction}\n\nProject context:\n${projectContext || 'No additional project context available.'}${teamContext ? `\n\nTeam and path context:\n${teamContext}` : ''}\n\nUnverified static hints (regex matches; report only if source proves a concrete failure, omit style preferences):\n${JSON.stringify(candidates)}\n\nContents/Diff:\n\`\`\`\n${contentToSend}\n\`\`\``;

    if (isExternalProvider(runtime.config)) {
        const parsed = await withRetry(
            async () => {
                return await runExternalStructuredReview(runtime.config, system, prompt, abortSignal);
            },
            3,
            1000,
            abortSignal,
        );

        return parseScanIssues(parsed, file);
    }

    const { object: parsed } = await withRetry(
        async () => {
            return await generateObject({
                model: getModel(runtime.config),
                schema: IssueSchema,
                instructions: system,
                prompt,
                // A full scan response is long, and on a reasoning model the
                // reasoning trace is charged against the same budget. Undersizing
                // this truncates the JSON mid-finding instead of failing loudly.
                maxOutputTokens: getProviderMaxOutputTokens(runtime.config.provider),
                abortSignal,
            });
        },
        3,
        1000,
        abortSignal,
    );

    return parseScanIssues(parsed, file);
}

function createTaskAbortSignal(runtimeAbortSignal: AbortSignal | undefined, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const abortHandler = () => controller.abort();

    if (runtimeAbortSignal) {
        if (runtimeAbortSignal.aborted) {
            controller.abort();
        } else {
            runtimeAbortSignal.addEventListener('abort', abortHandler, { once: true });
        }
    }

    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timeout);
            if (runtimeAbortSignal) {
                runtimeAbortSignal.removeEventListener('abort', abortHandler);
            }
        },
    };
}

function createFileTask(
    runtime: ScanRuntime,
    file: string,
    content: string,
    diff?: string,
    deleted?: boolean,
): () => Promise<ScanIssue[]> {
    return async () => {
        if (runtime.abortSignal?.aborted) {
            runtime.failedFiles.push(file);
            return [];
        }

        const { signal, cleanup } = createTaskAbortSignal(
            runtime.abortSignal,
            isExternalProvider(runtime.config) ? EXTERNAL_TASK_TIMEOUT_MS : API_TASK_TIMEOUT_MS,
        );

        try {
            const context = buildFileTaskContext(runtime, file, content, diff);

            if (
                context.cached &&
                context.cached.hash === context.hash &&
                context.cached.contextHash === context.currentContextHash &&
                context.cached.scanCacheKey === runtime.scanCacheKey
            ) {
                return handleCacheHit(runtime, file, context.cached);
            }

            const contentToSend = diff || content;
            let issues = await runDeepScan(runtime, file, contentToSend, context.projectContext, signal);
            signal.throwIfAborted();
            const lineCount = content.split('\n').length;
            if (
                issues.some(
                    (issue) => issue.line > lineCount || issue.lineEnd > lineCount || issue.lineEnd < issue.line,
                )
            ) {
                throw new Error('Provider returned a finding outside the source line range');
            }
            if (diff && !deleted) {
                const changedLines = changedLinesInDiff(diff);
                issues = issues.filter((issue) =>
                    [...changedLines].some((line) => line >= issue.line && line <= issue.lineEnd),
                );
            }
            storeCacheEntry(runtime, file, context, issues);
            return handleDetectedIssues(runtime, file, issues);
        } catch (e) {
            return handleTaskFailure(runtime, file, e);
        } finally {
            cleanup();
        }
    };
}

function buildFinalReviewHeader(
    totalFiles: number,
    totalDurationSecs: number,
    finalIssuesCount: number,
    scannedFilesCount: number,
): string {
    let finalHeader = `## Codebase Scan Report — Complete\n\n`;
    finalHeader += `- **Total files:** ${totalFiles} \n`;
    finalHeader += `- **Total time:** ${totalDurationSecs}s\n`;
    finalHeader += `---\n\n`;

    if (finalIssuesCount > 0) {
        finalHeader += `Scan complete! **${finalIssuesCount} issues** found.\n`;
    } else {
        finalHeader += `No major issues found across ${scannedFilesCount} files.\n`;
    }

    return finalHeader;
}

function runStaticScan(fileContents: Array<{ file: string; content: string }>): ScanIssue[] {
    const staticResults: ScanIssue[] = [];

    for (const { file, content } of fileContents) {
        if (content.trim().length === 0 || content.length > 50000) continue;
        staticResults.push(...analyzeFileStatic(file, content));
    }

    return staticResults;
}

async function loadScanCache(cacheFile: string): Promise<Record<string, CachedScanEntry>> {
    try {
        const cache: unknown = await fs.readJson(cacheFile);
        return cache && typeof cache === 'object' && !Array.isArray(cache)
            ? (cache as Record<string, CachedScanEntry>)
            : {};
    } catch (e: unknown) {
        if (e && (e as { code?: string }).code !== 'ENOENT') console.error('Cache read error', e);
        return {};
    }
}

async function saveScanCache(cacheFile: string, cache: Record<string, CachedScanEntry>): Promise<void> {
    try {
        await fs.writeJson(cacheFile, cache, { spaces: 2 });
    } catch (e) {
        console.error('Cache write error', e);
    }
}

function createScanRuntime(params: {
    config: AppConfig;
    reviewContext?: ReviewContextBundle;
    callbacks: ScanCallbacks;
    filesToScan?: string[];
    abortSignal?: AbortSignal;
    staticResults: ScanIssue[];
    cache: Record<string, CachedScanEntry>;
    scanCacheKey: string;
    projectIndex: ProjectIndex;
    sourceContents: Map<string, string>;
    scannable: ReviewInput[];
}): ScanRuntime {
    return {
        config: params.config,
        reviewContext: params.reviewContext,
        callbacks: params.callbacks,
        filesToScan: params.filesToScan,
        abortSignal: params.abortSignal,
        scannable: params.scannable,
        staticResults: params.staticResults,
        cache: params.cache,
        scanCacheKey: params.scanCacheKey,
        projectIndex: params.projectIndex,
        sourceContents: params.sourceContents,
        phase2Start: Date.now(),
        completedCount: 0,
        allAiIssues: [],
        failedFiles: [],
    };
}

export async function scanCodebase(
    config: AppConfig,
    callbacks: ScanCallbacks,
    filesToScan?: string[],
    abortSignal?: AbortSignal,
    reviewContext?: ReviewContextBundle,
    selection: ReviewSelection = { scope: filesToScan ? 'uncommitted' : 'all' },
): Promise<ScanResult> {
    const scanStartTime = Date.now();

    callbacks.onProgress('Discovering files...');
    const codeFiles = filesToScan || (await getCodeFiles());

    if (codeFiles.length === 0) {
        callbacks.onLog('No code files found in the project to scan.');
        callbacks.onReviewUpdate('No code files found to scan.');
        return {
            issues: [],
            durationSecs: 0,
            complete: !abortSignal?.aborted,
            failedFiles: [],
            skippedFiles: [],
        };
    }

    callbacks.onProgress(`Found ${codeFiles.length} code files. Running static analysis...`);

    const failedFiles: string[] = [];
    const fileContents: ReviewInput[] = [];
    for (const file of codeFiles) {
        try {
            fileContents.push(await getReviewInput(file, selection));
        } catch {
            failedFiles.push(file);
            callbacks.onLog(`Cannot read selected review snapshot for ${file}`);
        }
    }
    const staticResults = runStaticScan(fileContents);

    if (staticResults.length > 0) {
        callbacks.onLog(`⚡ Static analysis: ${staticResults.length} candidate(s) for AI verification`);
    }

    const concurrency = Math.min(PROVIDER_CONCURRENCY[config.provider] || 5, 10);

    callbacks.onReviewUpdate(`## Live Codebase Scan\n\n` + `**Running AI Scan on ${codeFiles.length} files...**`);

    callbacks.onProgress(`Scanning ${codeFiles.length} files...`);

    const CACHE_FILE = '.ai-reviewer-cache.json';
    const scanCacheKey = computeScanCacheKey(config, reviewContext, selection);
    const cache = await loadScanCache(CACHE_FILE);

    const scannable = fileContents.filter(
        ({ content, diff }) =>
            (diff === undefined ? content.trim().length > 0 : Boolean(diff.trim())) && content.length <= 50000,
    );
    const skippedFiles = fileContents.filter(({ content }) => content.length > 50000).map(({ file }) => file);
    const sourceContents = new Map<string, string>();
    const projectIndex = await ensureProjectIndex(
        [...new Set([...(await getCodeFiles(selection)), ...codeFiles])],
        {
            onProgress: callbacks.onProgress,
            onLog: callbacks.onLog,
        },
        async (file) => {
            const deletedInput = fileContents.find((input) => input.file === file && input.deleted);
            const source = deletedInput ? deletedInput.content : await getReviewContent(file, selection);
            sourceContents.set(file, source);
            return source;
        },
    );

    const runtime = createScanRuntime({
        config,
        reviewContext,
        callbacks,
        filesToScan,
        abortSignal,
        staticResults,
        cache,
        scanCacheKey,
        projectIndex,
        sourceContents,
        scannable,
    });

    const tasks = scannable.map(({ file, content, diff, deleted }) =>
        createFileTask(runtime, file, content, diff, deleted),
    );

    await runWithConcurrency(tasks, concurrency);

    await saveScanCache(CACHE_FILE, cache);

    const finalIssues = deduplicateIssues(runtime.allAiIssues);
    callbacks.onIssuesUpdate(finalIssues);
    callbacks.onProgress('');

    const totalDurationSecs = parseFloat(((Date.now() - scanStartTime) / 1000).toFixed(1));

    failedFiles.push(...runtime.failedFiles);
    const complete = !abortSignal?.aborted && failedFiles.length === 0 && skippedFiles.length === 0;
    callbacks.onReviewUpdate(
        complete
            ? buildFinalReviewHeader(codeFiles.length, totalDurationSecs, finalIssues.length, scannable.length)
            : `## Codebase Scan Report — Incomplete\n\n${failedFiles.length} failed file(s), ${skippedFiles.length} skipped file(s). Findings are partial; rerun the review.\n`,
    );
    return {
        issues: finalIssues,
        durationSecs: totalDurationSecs,
        complete,
        failedFiles,
        skippedFiles,
    };
}
