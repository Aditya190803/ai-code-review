import * as fs from 'fs-extra';
import { createHash } from 'crypto';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from './config.js';
import { git, getCodeFiles } from './git.js';
import { analyzeFileStatic } from './static-analysis.js';
import { extractMeaningfulCode } from './ast.js';
import { ensureProjectIndex, getProjectContext } from './project-index.js';
import { getScanSystemPrompt, SCAN_PROMPT_VERSION, TRIAGE_SYSTEM_PROMPT } from './prompts.js';
import type { ScanIssue, AppConfig, ProjectIndex } from './types.js';

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
        } catch (e: unknown) {
            if (attempt === maxRetries) throw e;
            const error = e as { message?: string; status?: number; statusCode?: number };
            const msg = error.message?.toLowerCase() || '';
            const status = error.status || error.statusCode;
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
export function parseScanIssues(parsed: Record<string, unknown>, fileName: string): ScanIssue[] {
    if (!parsed || !Array.isArray(parsed.issues)) return [];

    return parsed.issues.map((item: Record<string, unknown>) => ({
        category: typeof item.category === 'string' ? item.category : 'bug',
        severity: typeof item.severity === 'string' ? item.severity : 'info',
        title: typeof item.title === 'string' ? item.title : 'Untitled issue',
        line: typeof item.line === 'number' ? item.line : 0,
        lineEnd: typeof item.lineEnd === 'number' ? item.lineEnd : (typeof item.line === 'number' ? item.line : 0),
        codeContext: typeof item.codeContext === 'string' ? item.codeContext : '',
        description: typeof item.description === 'string' ? item.description : '',
        suggestedFix: typeof item.suggestedFix === 'string' ? item.suggestedFix : '',
        aiPrompt: typeof item.aiPrompt === 'string' ? item.aiPrompt : '',
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

function computeScanCacheKey(config: AppConfig): string {
    return createHash('sha256')
        .update(JSON.stringify({
            provider: config.provider,
            model: config.model,
            reviewLanguage: config.reviewLanguage || 'en',
            reviewTone: config.reviewTone || 'strict',
            promptVersion: SCAN_PROMPT_VERSION,
        }))
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
    callbacks: ScanCallbacks;
    filesToScan?: string[];
    abortSignal?: AbortSignal;
    scannable: Array<{ file: string; content: string }>;
    staticResults: ScanIssue[];
    cache: Record<string, CachedScanEntry>;
    scanCacheKey: string;
    projectIndex: ProjectIndex;
    phase2Start: number;
    completedCount: number;
    allAiIssues: ScanIssue[];
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

function buildFileTaskContext(runtime: ScanRuntime, file: string, content: string): FileTaskContext {
    const hash = createHash('sha256').update(content).digest('hex');
    const projectContext = getProjectContext(runtime.projectIndex, file, {
        changedFiles: runtime.filesToScan,
    });
    const currentContextHash = createHash('sha256').update(projectContext).digest('hex');

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
    runtime.callbacks.onProgress(renderScanProgress(runtime.completedCount, runtime.scannable.length, runtime.phase2Start));

    if (issueCount > 0) {
        runtime.callbacks.onIssuesUpdate(deduplicateIssues([...runtime.staticResults, ...runtime.allAiIssues]));
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

function handleTriagedSkip(runtime: ScanRuntime, file: string, context: FileTaskContext, score: number): ScanIssue[] {
    recordTaskProgress(runtime, file, 0, `✅ Triage: \`${file}\` looks clean (score ${score}) - skipping deep scan`);
    storeCacheEntry(runtime, file, context, []);
    return [];
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
    const err = error as Error;
    const errMsg = err.message.slice(0, 100);

    if (err.name === 'AbortError') {
        runtime.callbacks.onLog(`AI scan timeout for \`${file}\` (static results still valid)`);
    } else {
        runtime.callbacks.onLog(`AI error on \`${file}\`: ${errMsg}`);
    }

    runtime.completedCount++;
    runtime.callbacks.onProgress(renderScanProgress(runtime.completedCount, runtime.scannable.length, runtime.phase2Start));
    return [] as ScanIssue[];
}

async function triageFile(runtime: ScanRuntime, file: string, contentToSend: string): Promise<number | null> {
    try {
        const { object: triage } = await generateObject({
            model: getModel(runtime.config),
            schema: z.object({ score: z.number().min(1).max(10) }),
            system: TRIAGE_SYSTEM_PROMPT,
            prompt: `File: ${file}\n\n${contentToSend}`,
            abortSignal: runtime.abortSignal,
        });

        return triage.score;
    } catch {
        return null;
    }
}

async function runDeepScan(runtime: ScanRuntime, file: string, contentToSend: string, projectContext: string): Promise<ScanIssue[]> {
    const { object: parsed } = await withRetry(async () => {
        return await generateObject({
            model: getModel(runtime.config),
            schema: IssueSchema,
            system: getScanSystemPrompt(runtime.config),
            prompt: `File: ${file}\nContext: ${contentToSend}\n\nProject context:\n${projectContext || 'No additional project context available.'}\n\nContents/Diff:\n\`\`\`\n${contentToSend}\n\`\`\``,
            abortSignal: runtime.abortSignal,
        });
    });

    return parseScanIssues(parsed, file);
}

function createFileTask(runtime: ScanRuntime, file: string, content: string): () => Promise<ScanIssue[]> {
    return async () => {
        if (runtime.abortSignal?.aborted) return [];

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20_000);
        const abortHandler = () => controller.abort();

        try {
            const context = buildFileTaskContext(runtime, file, content);

            if (
                context.cached &&
                context.cached.hash === context.hash &&
                context.cached.contextHash === context.currentContextHash &&
                context.cached.scanCacheKey === runtime.scanCacheKey
            ) {
                return handleCacheHit(runtime, file, context.cached);
            }

            let contentToSend = extractMeaningfulCode(file, content);
            try {
                const fileDiff = await git.diff([file]);
                if (fileDiff && fileDiff.trim() !== '') {
                    contentToSend = fileDiff;
                }
            } catch {
                // Ignore diff errors and fall back to extracted code.
            }

            if (runtime.abortSignal) {
                runtime.abortSignal.addEventListener('abort', abortHandler, { once: true });
            }

            const score = await triageFile(runtime, file, contentToSend);
            if (typeof score === 'number' && score < 3) {
                return handleTriagedSkip(runtime, file, context, score);
            }

            const issues = await runDeepScan(runtime, file, contentToSend, context.projectContext);
            storeCacheEntry(runtime, file, context, issues);
            return handleDetectedIssues(runtime, file, issues);
        } catch (e) {
            return handleTaskFailure(runtime, file, e);
        } finally {
            clearTimeout(timeout);
            if (runtime.abortSignal) {
                runtime.abortSignal.removeEventListener('abort', abortHandler);
            }
        }
    };
}

function buildFinalReviewHeader(totalFiles: number, totalDurationSecs: number, finalIssuesCount: number, scannedFilesCount: number): string {
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

async function loadCodeFileContents(codeFiles: string[]): Promise<Array<{ file: string; content: string }>> {
    return Promise.all(
        codeFiles.map(async (file) => {
            try {
                const content = await fs.readFile(file, 'utf-8');
                return { file, content };
            } catch (e) {
                if ((e as any).code !== 'ENOENT') console.error('Error reading', file, e);
                return { file, content: '' };
            }
        })
    );
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
        return await fs.readJson(cacheFile);
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
    callbacks: ScanCallbacks;
    filesToScan?: string[];
    abortSignal?: AbortSignal;
    staticResults: ScanIssue[];
    cache: Record<string, CachedScanEntry>;
    scanCacheKey: string;
    projectIndex: ProjectIndex;
    scannable: Array<{ file: string; content: string }>;
}): ScanRuntime {
    return {
        config: params.config,
        callbacks: params.callbacks,
        filesToScan: params.filesToScan,
        abortSignal: params.abortSignal,
        scannable: params.scannable,
        staticResults: params.staticResults,
        cache: params.cache,
        scanCacheKey: params.scanCacheKey,
        projectIndex: params.projectIndex,
        phase2Start: Date.now(),
        completedCount: 0,
        allAiIssues: [],
    };
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

    const fileContents = await loadCodeFileContents(codeFiles);
    const staticResults = runStaticScan(fileContents);

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

    const CACHE_FILE = '.ai-reviewer-cache.json';
    const scanCacheKey = computeScanCacheKey(config);
    const cache = await loadScanCache(CACHE_FILE);

    const scannable = fileContents.filter(
        ({ content }) => content.trim().length > 0 && content.length <= 50000
    );
    const projectIndex = await ensureProjectIndex(codeFiles, {
        onProgress: callbacks.onProgress,
        onLog: callbacks.onLog,
    });

    const runtime = createScanRuntime({
        config,
        callbacks,
        filesToScan,
        abortSignal,
        staticResults,
        cache,
        scanCacheKey,
        projectIndex,
        scannable,
    });

    const tasks = scannable.map(({ file, content }) => createFileTask(runtime, file, content));

    await runWithConcurrency(tasks, concurrency);

    await saveScanCache(CACHE_FILE, cache);

    const finalIssues = deduplicateIssues([...staticResults, ...runtime.allAiIssues]);
    callbacks.onIssuesUpdate(finalIssues);
    callbacks.onProgress('');

    const totalDurationSecs = parseFloat(((Date.now() - scanStartTime) / 1000).toFixed(1));

    callbacks.onReviewUpdate(buildFinalReviewHeader(codeFiles.length, totalDurationSecs, finalIssues.length, scannable.length));
    return { issues: finalIssues, durationSecs: totalDurationSecs };
}
