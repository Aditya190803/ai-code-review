import { describe, expect, test } from 'bun:test';
import { parseCliArgs } from './cli.js';

describe('parseCliArgs', () => {
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
