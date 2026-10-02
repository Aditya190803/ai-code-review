import { describe, expect, test } from 'vite-plus/test';
import { parseCliArgs, mergeRepoConfig } from './cli.js';

describe('parseCliArgs', () => {
    test('switching providers does not carry the repository model or another provider key', () => {
        const parsed = parseCliArgs(['review', '--provider', 'anthropic']);
        const config = mergeRepoConfig(
            {
                provider: 'openai',
                model: 'saved-openai-model',
                apiKey: 'saved-openai-key',
                keys: { anthropic: 'saved-anthropic-key' },
            },
            parsed,
            'codex',
            'codex-default',
        );
        expect(config.provider).toBe('anthropic');
        expect(config.model).not.toBe('codex-default');
        expect(config.model).not.toBe('saved-openai-model');
        expect(config.apiKey).toBe('saved-anthropic-key');
    });
    test('rejects invalid scope, provider and missing flag values', () => {
        expect(() => parseCliArgs(['review', '--type', 'typo'])).toThrow('Unknown review scope');
        expect(() => parseCliArgs(['review', '--provider', 'typo'])).toThrow('Unknown provider');
        expect(() => parseCliArgs(['review', '--base'])).toThrow('requires a value');
        expect(() => parseCliArgs(['review', '--model', '--all'])).toThrow('requires a value');
    });
    test('provider and model overrides accept spaced and equals forms', () => {
        expect(parseCliArgs(['review', '--provider', 'codex', '--model=codex-default'])).toMatchObject({
            provider: 'codex',
            model: 'codex-default',
        });
    });
    test('defaults to non-interactive uncommitted review', () => {
        const args = parseCliArgs([]);

        expect(args.command).toBe('review');
        expect(args.scope).toBe('uncommitted');
        expect(args.interactive).toBe(false);
    });

    test('explicit review command remains non-interactive', () => {
        const args = parseCliArgs(['review']);

        expect(args.command).toBe('review');
        expect(args.interactive).toBe(false);
    });

    test('parses agent base review options', () => {
        const args = parseCliArgs(['review', '--agent', '--base', 'main', '--config', 'team.yaml']);

        expect(args.command).toBe('review');
        expect(args.agent).toBe(true);
        expect(args.base).toBe('main');
        expect(args.configPaths).toEqual(['team.yaml']);
    });

    test('parses auth subcommands', () => {
        const args = parseCliArgs(['auth', 'status']);

        expect(args.command).toBe('auth');
        expect(args.subcommand).toBe('status');
    });

    test('parses report output and fail threshold options', () => {
        const args = parseCliArgs([
            'review',
            '--base=main',
            '--output',
            'sarif',
            '--output-file=review.sarif',
            '--fail-on',
            'warning',
        ]);

        expect(args.output).toBe('sarif');
        expect(args.outputFile).toBe('review.sarif');
        expect(args.failOn).toBe('warning');
    });
});
