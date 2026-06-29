import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import * as fs from 'fs-extra';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AppConfig, ScanIssue } from './types.js';
import { getProviderDefinition } from './providers.js';

const ISSUE_JSON_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        issues: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    category: { enum: ['bug', 'runtime', 'security', 'performance', 'style', 'antipattern', 'crossfile', 'test'] },
                    severity: { enum: ['critical', 'warning', 'info'] },
                    title: { type: 'string' },
                    line: { type: 'number' },
                    lineEnd: { type: 'number' },
                    codeContext: { type: 'string' },
                    description: { type: 'string' },
                    suggestedFix: { type: 'string' },
                    aiPrompt: { type: 'string' },
                },
                required: ['category', 'severity', 'title', 'line', 'lineEnd', 'codeContext', 'description', 'suggestedFix', 'aiPrompt'],
            },
        },
    },
    required: ['issues'],
};

function extractJsonObject(text: string): Record<string, unknown> {
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return { issues: [] };
        return JSON.parse(match[0]) as Record<string, unknown>;
    }
}

function createAbortError(): Error {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
}

function runProcess(
    command: string,
    args: string[],
    input: string,
    abortSignal?: AbortSignal,
    timeoutMs = 120_000
): Promise<string> {
    return new Promise((resolve, reject) => {
        if (abortSignal?.aborted) {
            reject(createAbortError());
            return;
        }

        const child = spawn(command, args, {
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';

        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error(`${command} timed out after ${timeoutMs / 1000}s`));
        }, timeoutMs);

        const abortHandler = () => {
            child.kill('SIGTERM');
            reject(createAbortError());
        };

        abortSignal?.addEventListener('abort', abortHandler, { once: true });
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', (error) => {
            clearTimeout(timeout);
            abortSignal?.removeEventListener('abort', abortHandler);
            reject(error);
        });
        child.on('close', (code) => {
            clearTimeout(timeout);
            abortSignal?.removeEventListener('abort', abortHandler);
            if (code === 0) resolve(stdout);
            else reject(new Error(stderr.trim() || `${command} exited with status ${code}`));
        });

        child.stdin.end(input);
    });
}

async function runCodexStructuredReview(
    config: AppConfig,
    system: string,
    prompt: string,
    abortSignal?: AbortSignal
): Promise<Record<string, unknown>> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-review-codex-'));
    const schemaPath = path.join(tempDir, 'schema.json');
    const outputPath = path.join(tempDir, 'output.json');

    try {
        await fs.writeJson(schemaPath, ISSUE_JSON_SCHEMA);
        const args = [
            'exec',
            '--skip-git-repo-check',
            '--sandbox',
            'read-only',
            '--ask-for-approval',
            'never',
            '--output-schema',
            schemaPath,
            '--output-last-message',
            outputPath,
        ];

        if (config.model && config.model !== 'codex-default') {
            args.push('--model', config.model);
        }

        args.push('-');
        const instructions = [
            system,
            '',
            'Return only JSON matching the provided schema. Do not edit files, run commands, or include markdown.',
            '',
            prompt,
        ].join('\n');

        const stdout = await runProcess('codex', args, instructions, abortSignal);
        const output = await fs.pathExists(outputPath) ? await fs.readFile(outputPath, 'utf8') : stdout;
        return extractJsonObject(output);
    } finally {
        await fs.remove(tempDir);
    }
}

async function runClaudeAgentStructuredReview(
    config: AppConfig,
    system: string,
    prompt: string,
    abortSignal?: AbortSignal
): Promise<Record<string, unknown>> {
    const abortController = new AbortController();
    const abortHandler = () => abortController.abort();
    abortSignal?.addEventListener('abort', abortHandler, { once: true });

    try {
        const model = config.model && config.model !== 'claude-default' ? config.model : undefined;
        let resultText = '';
        let structuredOutput: unknown;

        for await (const message of query({
            prompt: [
                system,
                '',
                'Return only structured JSON matching the requested schema. Do not edit files or run commands.',
                '',
                prompt,
            ].join('\n'),
            options: {
                abortController,
                cwd: process.cwd(),
                maxTurns: 1,
                model,
                outputFormat: {
                    type: 'json_schema',
                    schema: ISSUE_JSON_SCHEMA,
                },
                permissionMode: 'dontAsk',
                persistSession: false,
                tools: [],
            },
        })) {
            if (message.type === 'result' && message.subtype === 'success') {
                structuredOutput = message.structured_output;
                resultText = message.result || '';
            }
        }

        if (structuredOutput && typeof structuredOutput === 'object') {
            return structuredOutput as Record<string, unknown>;
        }

        return extractJsonObject(resultText);
    } finally {
        abortSignal?.removeEventListener('abort', abortHandler);
    }
}

export function isExternalProvider(config: AppConfig): boolean {
    const runtime = getProviderDefinition(config.provider)?.runtime;
    return runtime === 'codex-cli' || runtime === 'claude-agent-sdk';
}

export async function runExternalStructuredReview(
    config: AppConfig,
    system: string,
    prompt: string,
    abortSignal?: AbortSignal
): Promise<Record<string, unknown>> {
    const runtime = getProviderDefinition(config.provider)?.runtime;
    if (runtime === 'codex-cli') {
        return runCodexStructuredReview(config, system, prompt, abortSignal);
    }

    if (runtime === 'claude-agent-sdk') {
        return runClaudeAgentStructuredReview(config, system, prompt, abortSignal);
    }

    return { issues: [] satisfies ScanIssue[] };
}

export async function validateExternalProvider(config: AppConfig): Promise<boolean> {
    const runtime = getProviderDefinition(config.provider)?.runtime;
    if (runtime === 'codex-cli') {
        const result = spawnSync('codex', ['login', 'status'], { encoding: 'utf8' });
        return result.status === 0 && /Logged in/i.test(`${result.stdout}\n${result.stderr}`);
    }

    if (runtime === 'claude-agent-sdk') {
        try {
            for await (const message of query({
                prompt: 'Reply with OK.',
                options: {
                    maxTurns: 1,
                    model: config.model && config.model !== 'claude-default' ? config.model : undefined,
                    permissionMode: 'dontAsk',
                    persistSession: false,
                    tools: [],
                },
            })) {
                if (message.type === 'result') return message.subtype === 'success' && !message.is_error;
            }
        } catch {
            return false;
        }
    }

    return false;
}
