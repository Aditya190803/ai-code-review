import { spawnSync } from 'node:child_process';
import * as fs from 'fs-extra';
import { git, getBaseCodeFiles, getBaseCommitCodeFiles, getChangedCodeFiles, getCodeFiles, getCommittedCodeFiles, getStagedCodeFiles, getUnstagedCodeFiles } from './git.js';
import { getProviderDefinition, providerRequiresApiKey, PROVIDERS } from './providers.js';
import { loadConfig, normalizeConfig, validateApiKey } from './config.js';
import { initRepoConfig, loadRepoConfig } from './repo-config.js';
import { applyFixesFromSnapshot, applyFixForIssue } from './apply-fix.js';
import { runFinishingTouch, type FinishingAction } from './finishing-touches.js';
import { readLastReviewSnapshot, writeLastReviewSnapshot } from './mcp-server.js';
import { loadReviewMemory, recordReviewFeedback, saveReviewMemory } from './review-memory.js';
import { loadReviewMetrics, recordReviewRun, renderMetricsSummary } from './review-metrics.js';
import { finalizeIssues, prepareReviewContext } from './review-shared.js';
import { scanCodebase } from './scanner.js';
import { renderReview } from './reporters.js';
import type { AppConfig, RepoReviewConfig, ReviewOutput, ReviewScope, ScanIssue } from './types.js';

export interface ParsedCli {
    command: 'review' | 'auth' | 'doctor' | 'init' | 'help' | 'interactive' | 'feedback' | 'mcp' | 'fix' | 'metrics' | 'polish';
    subcommand?: string;
    interactive: boolean;
    agent: boolean;
    json: boolean;
    output?: ReviewOutput;
    outputFile?: string;
    failOn?: string;
    scope: ReviewScope;
    base?: string;
    baseCommit?: string;
    configPaths: string[];
    diffOutput: boolean;
    feedbackDown?: boolean;
    feedbackUp?: boolean;
    feedbackFile?: string;
    feedbackTitle?: string;
    fixDryRun?: boolean;
    fixMax?: number;
    fixFile?: string;
    fixTitle?: string;
    polishAction?: FinishingAction;
    polishFile?: string;
}

const severityRank: Record<string, number> = {
    info: 1,
    trivial: 1,
    minor: 2,
    warning: 3,
    major: 3,
    critical: 4,
};

function readFlagValue(args: string[], index: number): string | undefined {
    const current = args[index];
    const eqIndex = current.indexOf('=');
    if (eqIndex >= 0) return current.slice(eqIndex + 1);
    return args[index + 1];
}

export function parseCliArgs(args: string[]): ParsedCli {
    const first = args[0];
    const command = first && !first.startsWith('-') ? first : 'review';
    const options = command === first ? args.slice(1) : args;
    const parsed: ParsedCli = {
        command: command === 'ui' ? 'interactive' : command as ParsedCli['command'],
        subcommand: undefined,
        interactive: false,
        agent: false,
        json: false,
        scope: 'uncommitted',
        configPaths: [],
        diffOutput: false,
    };

    if (!['review', 'auth', 'doctor', 'init', 'help', 'interactive', 'feedback', 'mcp', 'fix', 'metrics', 'polish'].includes(parsed.command)) {
        parsed.command = 'review';
    }

    if (parsed.command === 'auth' && options[0] && !options[0].startsWith('-')) {
        parsed.subcommand = options[0];
    }

    for (let i = 0; i < options.length; i++) {
        const arg = options[i];
        if (arg === '--diff') {
            parsed.diffOutput = true;
            parsed.output = 'diff';
        }
        else if (arg === '--interactive') parsed.interactive = true;
        else if (arg === '--agent') parsed.agent = true;
        else if (arg === '--json') {
            parsed.json = true;
            parsed.output = 'json';
        }
        else if (arg === '--output') {
            const value = options[i + 1] as ReviewOutput | undefined;
            if (value) parsed.output = value;
            i++;
        }
        else if (arg.startsWith('--output=')) {
            parsed.output = readFlagValue(options, i) as ReviewOutput;
            if (parsed.output === 'json') parsed.json = true;
        }
        else if (arg === '--output-file') {
            parsed.outputFile = options[i + 1];
            i++;
        } else if (arg.startsWith('--output-file=')) {
            parsed.outputFile = readFlagValue(options, i);
        }
        else if (arg === '--fail-on') {
            parsed.failOn = options[i + 1];
            i++;
        } else if (arg.startsWith('--fail-on=')) {
            parsed.failOn = readFlagValue(options, i);
        }
        else if (arg === '--all') parsed.scope = 'all';
        else if (arg === '--staged') parsed.scope = 'staged';
        else if (arg === '--unstaged') parsed.scope = 'unstaged';
        else if (arg === '--uncommitted') parsed.scope = 'uncommitted';
        else if (arg === '--committed') parsed.scope = 'committed';
        else if (arg === '--type') {
            parsed.scope = (options[i + 1] || parsed.scope) as ReviewScope;
            i++;
        } else if (arg.startsWith('--type=')) {
            parsed.scope = readFlagValue(options, i) as ReviewScope;
        } else if (arg === '--base') {
            parsed.base = options[i + 1];
            i++;
        } else if (arg.startsWith('--base=')) {
            parsed.base = readFlagValue(options, i);
        } else if (arg === '--base-commit') {
            parsed.baseCommit = options[i + 1];
            i++;
        } else if (arg.startsWith('--base-commit=')) {
            parsed.baseCommit = readFlagValue(options, i);
        } else if (arg === '--config') {
            if (options[i + 1]) parsed.configPaths.push(options[i + 1]);
            i++;
        } else if (arg.startsWith('--config=')) {
            const value = readFlagValue(options, i);
            if (value) parsed.configPaths.push(value);
        }
        else if (arg === '--down') parsed.feedbackDown = true;
        else if (arg === '--up') parsed.feedbackUp = true;
        else if (arg === '--file') {
            parsed.feedbackFile = options[i + 1];
            i++;
        } else if (arg.startsWith('--file=')) {
            parsed.feedbackFile = readFlagValue(options, i);
        }
        else if (arg === '--title') {
            parsed.feedbackTitle = options[i + 1];
            i++;
        } else if (arg.startsWith('--title=')) {
            parsed.feedbackTitle = readFlagValue(options, i);
        }
        else if (arg === '--dry-run') parsed.fixDryRun = true;
        else if (arg === '--max') {
            parsed.fixMax = Number(options[i + 1]) || 3;
            i++;
        } else if (arg.startsWith('--max=')) {
            parsed.fixMax = Number(readFlagValue(options, i)) || 3;
        }
        else if (arg === '--action') {
            parsed.polishAction = options[i + 1] as FinishingAction;
            i++;
        } else if (arg.startsWith('--action=')) {
            parsed.polishAction = readFlagValue(options, i) as FinishingAction;
        }
    }

    if (parsed.command === 'fix') {
        for (let i = 0; i < options.length; i++) {
            const arg = options[i];
            if (arg === '--file') { parsed.fixFile = options[i + 1]; i++; }
            else if (arg.startsWith('--file=')) parsed.fixFile = readFlagValue(options, i);
            else if (arg === '--title') { parsed.fixTitle = options[i + 1]; i++; }
            else if (arg.startsWith('--title=')) parsed.fixTitle = readFlagValue(options, i);
        }
    }
    if (parsed.command === 'polish') {
        for (let i = 0; i < options.length; i++) {
            const arg = options[i];
            if (arg === '--file') { parsed.polishFile = options[i + 1]; i++; }
            else if (arg.startsWith('--file=')) parsed.polishFile = readFlagValue(options, i);
        }
    }

    return parsed;
}

export function renderHelp(): string {
    return [
        'AI Code Review CLI',
        '',
        'Usage:',
        '  ai-review review [--interactive] [--agent] [--type uncommitted|staged|unstaged|committed|all]',
        '  ai-review review --base main --output json',
        '  ai-review review --base-commit <sha> --output sarif --output-file review.sarif',
        '  ai-review review --output github --output-file review-comment.md',
        '  ai-review review --diff',
        '  ai-review review --fail-on critical|warning|info|none',
        '  ai-review feedback --down --file src/a.ts --title "issue title"',
        '  ai-review doctor',
        '  ai-review init',
        '  ai-review auth status|logout',
        '  ai-review mcp',
        '  ai-review fix [--dry-run] [--max 3] [--file path --title "issue"]',
        '  ai-review polish --action docstring|tests|simplify|merge-hints --file path',
        '  ai-review metrics',
        '',
        'Defaults:',
        '  provider: opencode',
        '  model: big-pickle',
    ].join('\n');
}

async function resolveFiles(parsed: ParsedCli): Promise<string[]> {
    if (parsed.baseCommit) return getBaseCommitCodeFiles(parsed.baseCommit);
    if (parsed.base) return getBaseCodeFiles(parsed.base);
    if (parsed.scope === 'all') return getCodeFiles();
    if (parsed.scope === 'staged') return getStagedCodeFiles();
    if (parsed.scope === 'unstaged') return getUnstagedCodeFiles();
    if (parsed.scope === 'committed') return getCommittedCodeFiles();
    return getChangedCodeFiles();
}

function issueRank(issue: ScanIssue): number {
    return severityRank[issue.severity] || 1;
}

function logAgentEvent(type: string, payload: Record<string, unknown>): void {
    console.log(JSON.stringify({ type, ...payload }));
}

function mergeRepoConfig(config: AppConfig, parsed: ParsedCli, repoConfigProvider?: string, repoConfigModel?: string): AppConfig {
    return normalizeConfig({
        ...config,
        provider: repoConfigProvider || config.provider,
        model: process.env.AI_MODEL || repoConfigModel || config.model,
    });
}

function globToRegExp(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '::DOUBLE_STAR::')
        .replace(/\*/g, '[^/]*')
        .replace(/::DOUBLE_STAR::/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
}

function filterIgnoredFiles(files: string[], repoConfig: RepoReviewConfig): string[] {
    const patterns = (repoConfig.ignoredPaths || []).map(globToRegExp);
    if (patterns.length === 0) return files;
    return files.filter((file) => !patterns.some((pattern) => pattern.test(file)));
}

function filterIssuesByThreshold(issues: ScanIssue[], threshold?: string): ScanIssue[] {
    if (!threshold) return issues;
    const thresholdRank = severityRank[threshold];
    if (!thresholdRank) return issues;
    return issues.filter((issue) => issueRank(issue) >= thresholdRank);
}

function resolveOutput(parsed: ParsedCli, repoConfig: RepoReviewConfig): ReviewOutput {
    if (parsed.diffOutput) return 'diff';
    const output = parsed.output || repoConfig.output || 'plain';
    const allowed: ReviewOutput[] = ['plain', 'json', 'sarif', 'diff', 'github'];
    return allowed.includes(output as ReviewOutput) ? output as ReviewOutput : 'plain';
}

async function writeOrPrintReport(parsed: ParsedCli, report: string): Promise<void> {
    if (parsed.outputFile) {
        await fs.outputFile(parsed.outputFile, report);
        if (!parsed.agent) console.error(`Wrote review report to ${parsed.outputFile}`);
        return;
    }

    console.log(report);
}

export async function runReviewCommand(parsed: ParsedCli): Promise<number> {
    const { repoConfig, reviewContext, memoryStore, useMemory } = await prepareReviewContext(parsed.configPaths);
    const config = mergeRepoConfig(await loadConfig(), parsed, repoConfig.provider, repoConfig.model);
    const files = filterIgnoredFiles(await resolveFiles(parsed), repoConfig);
    const output = resolveOutput(parsed, repoConfig);

    if (files.length === 0) {
        const scopeHint = parsed.scope === 'all'
            ? 'No code files found in the repository. Files may be excluded by .gitignore, .ai-reviewignore, or the file extension filter.'
            : `No matching code files found for scope "${parsed.scope}". Try --type all to scan all project files including untracked ones.`;
        if (parsed.agent) {
            logAgentEvent('complete', { files: 0, findings: 0, message: scopeHint });
        } else if (output === 'json' || output === 'sarif') {
            await writeOrPrintReport(parsed, await renderReview(output, [], 0, [], { baseRef: parsed.base }));
        } else {
            console.log(scopeHint);
        }
        return 0;
    }

    if (providerRequiresApiKey(config.provider) && !config.apiKey) {
        const provider = getProviderDefinition(config.provider);
        const envHint = provider?.envKeys?.length
            ? `Set ${provider.envKeys.join(' or ')} environment variable`
            : 'No API key configured';
        console.error(`Missing API key for ${provider?.label || config.provider}.`);
        console.error(`  ${envHint} or run \`ai-review init\` to set up interactively.`);
        return 2;
    }

    if (parsed.agent) {
        logAgentEvent('status', { message: 'validating_provider', provider: config.provider, model: config.model });
    } else if (!parsed.outputFile && output === 'plain') {
        console.log(`Using ${config.provider}/${config.model}`);
        console.log(`Reviewing ${files.length} file(s)...`);
    }

    const isValid = await validateApiKey(config);
    if (!isValid) {
        console.error('Invalid API key or model. Run `ai-review doctor` for diagnostics.');
        console.error('  Verify your API key and that the model name is correct for the provider.');
        return 2;
    }

    const result = await scanCodebase(config, {
        onProgress: (message) => {
            if (!message) return;
            if (parsed.agent) logAgentEvent('status', { message });
            else if (output === 'plain') console.log(message);
        },
        onLog: (message) => {
            if (parsed.agent) logAgentEvent('status', { message });
            else if (output === 'plain') console.log(message);
        },
        onIssuesUpdate: (issues) => {
            if (parsed.agent) {
                for (const issue of issues) logAgentEvent('finding', { finding: issue });
            }
        },
        onReviewUpdate: () => {},
    }, files, undefined, {
        reviewContext,
        enabledTools: repoConfig.enabledTools,
        webSearch: repoConfig.webSearch === true,
    });

    const issues = finalizeIssues(result.issues, repoConfig, memoryStore, useMemory);

    await writeLastReviewSnapshot(issues, files, result.durationSecs);
    await recordReviewRun(issues, files, result.durationSecs, parsed.scope);

    if (parsed.agent) {
        logAgentEvent('complete', {
            files: files.length,
            findings: issues.length,
            durationSecs: result.durationSecs,
        });
    } else {
        await writeOrPrintReport(parsed, await renderReview(output, issues, result.durationSecs, files, {
            baseRef: parsed.base,
            autoApproveMaxFindings: repoConfig.autoApproveMaxFindings,
        }));
    }

    const failOn = parsed.failOn || repoConfig.failOn || 'critical';
    if (failOn === 'none') return 0;
    const failRank = severityRank[failOn] || severityRank.critical;
    return issues.some((issue) => issueRank(issue) >= failRank) ? 1 : 0;
}

function checkCommand(command: string): boolean {
    const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
}

export async function runDoctorCommand(): Promise<number> {
    const config = await loadConfig();
    const provider = getProviderDefinition(config.provider);
    let ok = true;

    console.log('AI Code Review doctor');
    console.log(`Provider: ${provider?.label || config.provider}`);
    console.log(`Model: ${config.model}`);
    console.log(`API key: ${providerRequiresApiKey(config.provider) ? (config.apiKey ? 'configured' : 'missing') : 'not required'}`);

    if (providerRequiresApiKey(config.provider) && !config.apiKey) ok = false;

    try {
        const root = await git.revparse(['--show-toplevel']);
        console.log(`Git repo: ${root.trim()}`);
    } catch {
        console.log('Git repo: not detected');
        ok = false;
    }

    const tools = ['git', 'eslint', 'biome', 'tsc', 'ruff', 'gitleaks', 'semgrep'];
    for (const tool of tools) {
        console.log(`${tool}: ${checkCommand(tool) ? 'available' : 'not found'}`);
    }

    if (config.apiKey || !providerRequiresApiKey(config.provider)) {
        const valid = await validateApiKey(config);
        console.log(`Provider ping: ${valid ? 'ok' : 'failed'}`);
        ok = ok && valid;
    }

    return ok ? 0 : 1;
}

export async function runFeedbackCommand(parsed: ParsedCli): Promise<number> {
    if (!parsed.feedbackFile || !parsed.feedbackTitle) {
        console.error('Usage: ai-review feedback --down|--up --file <path> --title "finding title"');
        return 2;
    }
    const vote = parsed.feedbackDown ? 'down' : parsed.feedbackUp ? 'up' : null;
    if (!vote) {
        console.error('Specify --down or --up');
        return 2;
    }
    const store = await loadReviewMemory();
    const stub: ScanIssue = {
        category: 'style',
        severity: 'info',
        title: parsed.feedbackTitle,
        line: 1,
        lineEnd: 1,
        codeContext: '',
        description: '',
        suggestedFix: '',
        aiPrompt: '',
        file: parsed.feedbackFile,
    };
    const next = recordReviewFeedback(store, stub, vote);
    await saveReviewMemory(next);
    console.log(`Recorded ${vote}vote for "${parsed.feedbackTitle}" in ${parsed.feedbackFile}`);
    return 0;
}

export async function runMcpCommand(): Promise<number> {
    const { runMcpStdioServer } = await import('./mcp-server.js');
    await runMcpStdioServer();
    return 0;
}

export async function runFixCommand(parsed: ParsedCli): Promise<number> {
    const repoConfig = await loadRepoConfig(parsed.configPaths);
    const config = mergeRepoConfig(await loadConfig(), parsed, repoConfig.provider, repoConfig.model);
    if (providerRequiresApiKey(config.provider) && !config.apiKey) {
        console.error('Missing API key for fix command.');
        return 2;
    }
    const snap = await readLastReviewSnapshot();
    if (!snap?.issues.length && !(parsed.fixFile && parsed.fixTitle)) {
        console.error('No snapshot. Run `ai-review review` first, or pass --file and --title.');
        return 2;
    }
    if (parsed.fixFile && parsed.fixTitle) {
        const issue = snap?.issues.find((i) => i.file === parsed.fixFile && i.title === parsed.fixTitle)
            || {
                category: 'style',
                severity: 'warning',
                title: parsed.fixTitle,
                line: 1,
                lineEnd: 1,
                codeContext: '',
                description: '',
                suggestedFix: '',
                aiPrompt: parsed.fixTitle,
                file: parsed.fixFile,
            };
        const r = await applyFixForIssue(config, issue, { dryRun: parsed.fixDryRun });
        console.log(`${r.file}: ${r.message}`);
        return r.applied || parsed.fixDryRun ? 0 : 1;
    }
    const results = await applyFixesFromSnapshot(config, snap!.issues, {
        dryRun: parsed.fixDryRun,
        max: parsed.fixMax ?? 3,
    });
    for (const r of results) console.log(`${r.file}: ${r.message}`);
    return results.some((r) => r.applied) ? 0 : 1;
}

export async function runMetricsCommand(): Promise<number> {
    const store = await loadReviewMetrics();
    console.log(renderMetricsSummary(store));
    return 0;
}

export async function runPolishCommand(parsed: ParsedCli): Promise<number> {
    const repoConfig = await loadRepoConfig(parsed.configPaths);
    const config = mergeRepoConfig(await loadConfig(), parsed, repoConfig.provider, repoConfig.model);
    if (!parsed.polishFile || !parsed.polishAction) {
        console.error('Usage: ai-review polish --action docstring|tests|simplify|merge-hints --file <path>');
        return 2;
    }
    const r = await runFinishingTouch(config, parsed.polishAction, parsed.polishFile);
    console.log(r.message);
    return r.ok ? 0 : 1;
}

export async function runInitCommand(): Promise<number> {
    const created = await initRepoConfig();
    console.log(created ? 'Created .ai-review.yaml' : '.ai-review.yaml already exists');
    return 0;
}

export async function runAuthCommand(parsed: ParsedCli): Promise<number> {
    const config = await loadConfig();
    if (!parsed.subcommand || parsed.subcommand === 'status') {
        console.log(`Provider: ${config.provider}`);
        console.log(`Model: ${config.model}`);
        console.log(`API key: ${providerRequiresApiKey(config.provider) ? (config.apiKey ? 'configured' : 'missing') : 'not required'}`);
        return providerRequiresApiKey(config.provider) && !config.apiKey ? 1 : 0;
    }

    if (parsed.subcommand === 'logout') {
        const fs = await import('fs-extra');
        const os = await import('node:os');
        const path = await import('node:path');
        await fs.remove(path.join(os.homedir(), '.ai-reviewer.json'));
        console.log('Removed local AI Review credentials.');
        return 0;
    }

    if (parsed.subcommand === 'login') {
        console.log('Run `ai-review review --interactive` to configure provider credentials.');
        return 0;
    }

    console.error(`Unknown auth command: ${parsed.subcommand}`);
    return 1;
}

export { PROVIDERS };
