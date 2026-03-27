import { describe, expect, test } from 'bun:test';
import { getProjectContext } from './project-index.js';
import type { ProjectIndex } from './types.js';

describe('getProjectContext', () => {
    test('prioritizes direct dependencies, dependents, and changed files', () => {
        const index: ProjectIndex = {
            version: 'test',
            root: '/tmp/repo',
            generatedAt: Date.now(),
            revision: 'abc',
            files: {
                'src/main.ts': {
                    path: 'src/main.ts',
                    ext: '.ts',
                    hash: '1',
                    bytes: 100,
                    summary: 'main entrypoint',
                    imports: ['./utils', './feature'],
                    localDependencies: ['src/utils.ts', 'src/feature.ts'],
                    dependents: [],
                    exports: ['main'],
                    symbols: ['main'],
                    updatedAt: Date.now(),
                },
                'src/utils.ts': {
                    path: 'src/utils.ts',
                    ext: '.ts',
                    hash: '2',
                    bytes: 100,
                    summary: 'shared utilities',
                    imports: [],
                    localDependencies: [],
                    dependents: ['src/main.ts'],
                    exports: ['formatName'],
                    symbols: ['formatName'],
                    updatedAt: Date.now(),
                },
                'src/feature.ts': {
                    path: 'src/feature.ts',
                    ext: '.ts',
                    hash: '3',
                    bytes: 100,
                    summary: 'feature module',
                    imports: [],
                    localDependencies: [],
                    dependents: ['src/main.ts'],
                    exports: ['runFeature'],
                    symbols: ['runFeature'],
                    updatedAt: Date.now(),
                },
                'src/other.ts': {
                    path: 'src/other.ts',
                    ext: '.ts',
                    hash: '4',
                    bytes: 100,
                    summary: 'other changed file',
                    imports: [],
                    localDependencies: [],
                    dependents: [],
                    exports: ['other'],
                    symbols: ['other'],
                    updatedAt: Date.now(),
                },
            },
        };

        const context = getProjectContext(index, 'src/main.ts', {
            changedFiles: ['src/main.ts', 'src/other.ts'],
        });

        expect(context).toContain('Current file context:');
        expect(context).toContain('reason: direct dependency');
        expect(context).toContain('src/utils.ts');
        expect(context).toContain('src/feature.ts');
        expect(context).toContain('reason: changed in current review');
        expect(context).toContain('src/other.ts');
    });
});
