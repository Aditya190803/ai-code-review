import { globToRegExp } from './glob.js';
import simpleGit from 'simple-git';
import { readFile } from 'node:fs/promises';
import type { ReviewSelection } from './types.js';

// ── Git Instance ──
export const git = simpleGit();

// ── Collect all project files (tracked + untracked) ──
export async function getAllProjectFiles(): Promise<string[]> {
    const tracked = await git.raw(['ls-files', '-z']);
    const untracked = await git.raw(['ls-files', '-z', '--others', '--exclude-standard']);

    const all = (tracked + '\0' + untracked).split('\0').filter(Boolean);
    return [...new Set(all)];
}

// ── Collect scannable code files ──
const CODE_EXTENSIONS = [
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.py',
    '.go',
    '.rs',
    '.java',
    '.rb',
    '.php',
    '.c',
    '.cc',
    '.cpp',
    '.cxx',
    '.h',
    '.hh',
    '.hpp',
    '.hxx',
    '.sh',
];

const SKIP_PATTERNS = [
    /\.d\.ts$/, // TypeScript declarations
    /\.min\.(js|css)$/, // Minified files
    /\.lock$/, // Lock files
    /\.map$/, // Source maps
    /node_modules\//, // Dependencies
    /dist\//, // Build output
    /\.generated\./, // Generated files
    /vendor\//, // Vendored code
    /__snapshots__\//, // Jest snapshots
    /\.stories\.(ts|tsx|js|jsx)$/, // Storybook stories
];

async function getIgnorePatterns(): Promise<RegExp[]> {
    const patterns = [...SKIP_PATTERNS];
    try {
        const fs = await import('fs/promises');
        if (await fs.stat('.ai-reviewignore').catch(() => null)) {
            const ignoreContent = await fs.readFile('.ai-reviewignore', 'utf-8');
            const lines = ignoreContent
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('#'));
            for (const line of lines) {
                const glob = line.endsWith('/') ? line + '**' : line;
                patterns.push(globToRegExp(glob.includes('/') ? glob : '**/' + glob));
            }
        }
    } catch (e) {
        console.debug('Failed to get ignore patterns:', e);
    }
    return patterns;
}

export async function getCodeFiles(selection?: ReviewSelection): Promise<string[]> {
    const committed = selection?.base || selection?.baseCommit || selection?.scope === 'committed';
    const all = committed
        ? (await git.raw(['ls-tree', '-r', '--name-only', '-z', 'HEAD'])).split('\0').filter(Boolean)
        : selection?.scope === 'staged'
          ? (await git.raw(['ls-files', '-z'])).split('\0').filter(Boolean)
          : await getAllProjectFiles();
    const ignorePatterns = await getIgnorePatterns();
    return all
        .filter((f) => CODE_EXTENSIONS.some((ext) => f.endsWith(ext)))
        .filter((f) => !ignorePatterns.some((pattern) => pattern.test(f)));
}

// ── Collect changed scannable code files ──
export async function getChangedCodeFiles(): Promise<string[]> {
    const { modified, staged, not_added, created, renamed, deleted } = await git.status();
    const changed = [...modified, ...staged, ...not_added, ...created, ...deleted, ...renamed.map((r) => r.to)];

    const allUnique = [...new Set(changed)];
    const ignorePatterns = await getIgnorePatterns();
    return allUnique
        .filter((f) => CODE_EXTENSIONS.some((ext) => f.endsWith(ext)))
        .filter((f) => !ignorePatterns.some((pattern) => pattern.test(f)));
}

async function filterReviewableFiles(files: string[]): Promise<string[]> {
    const ignorePatterns = await getIgnorePatterns();
    return [...new Set(files)]
        .filter((f) => CODE_EXTENSIONS.some((ext) => f.endsWith(ext)))
        .filter((f) => !ignorePatterns.some((pattern) => pattern.test(f)));
}

async function getDiffNameOnly(args: string[]): Promise<string[]> {
    const output = await git.raw(['diff', '--name-only', '-z', '--diff-filter=ACDMR', ...args]);
    return output.split('\0').filter(Boolean);
}

export async function getStagedCodeFiles(): Promise<string[]> {
    return filterReviewableFiles(await getDiffNameOnly(['--staged']));
}

export async function getUnstagedCodeFiles(): Promise<string[]> {
    const unstaged = await getDiffNameOnly([]);
    let untracked: string[] = [];
    try {
        const status = await git.status();
        untracked = status.not_added || [];
    } catch (e) {
        console.debug('Failed to get untracked files:', e);
    }

    return filterReviewableFiles([...unstaged, ...untracked]);
}

async function getCommittedBase(): Promise<string> {
    await git.raw(['rev-parse', '--verify', 'HEAD']);
    return git.raw(['rev-parse', '--verify', 'HEAD^']).then(
        (ref) => ref.trim(),
        () => '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    );
}

export async function getCommittedCodeFiles(base?: string): Promise<string[]> {
    return filterReviewableFiles(await getDiffNameOnly([`${base || (await getCommittedBase())}..HEAD`]));
}

export interface ReviewInput {
    file: string;
    content: string;
    diff?: string;
    deleted?: boolean;
}

export async function getReviewContent(file: string, selection: ReviewSelection): Promise<string> {
    const committed = selection.base || selection.baseCommit || selection.scope === 'committed';
    if (committed) return git.raw(['show', `HEAD:${file}`]);
    if (selection.scope === 'staged') return git.raw(['show', `:${file}`]);
    return readFile(file, 'utf8');
}

/** Read both the patch and source from the selected Git snapshot. */
export async function getReviewInput(file: string, selection: ReviewSelection): Promise<ReviewInput> {
    let args: string[] = [];
    let revision: string | undefined;
    if (selection.baseCommit) {
        args = [`${selection.baseCommit}..HEAD`];
        revision = 'HEAD';
    } else if (selection.base) {
        args = [`${selection.base}...HEAD`];
        revision = 'HEAD';
    } else if (selection.scope === 'committed') {
        args = [`${await getCommittedBase()}..HEAD`];
        revision = 'HEAD';
    } else if (selection.scope === 'staged') {
        args = ['--staged'];
        revision = '';
    } else if (selection.scope === 'uncommitted') {
        // An unborn branch has no HEAD; the empty tree represents its base.
        const head = await git.raw(['rev-parse', '--verify', 'HEAD']).then(
            () => 'HEAD',
            () => '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
        );
        args = [head];
    }

    if (selection.scope === 'all' && !selection.base && !selection.baseCommit) {
        return { file, content: await getReviewContent(file, selection) };
    }

    let diff = await git.raw(['diff', '--no-ext-diff', '--no-textconv', '--no-color', ...args, '--', file]);
    const deleted = diff.includes('\n+++ /dev/null\n');
    let content: string;
    if (deleted) {
        const before =
            selection.baseCommit ||
            (selection.base
                ? (await git.raw(['merge-base', selection.base, 'HEAD'])).trim()
                : selection.scope === 'committed'
                  ? 'HEAD~1'
                  : selection.scope === 'unstaged'
                    ? ''
                    : 'HEAD');
        content = await git.raw(['show', `${before}:${file}`]);
    } else content = await getReviewContent(file, selection);
    if (!diff && revision === undefined && content) {
        const tracked = await git.raw(['ls-files', '-z', '--', file]);
        if (!tracked) {
            const lines = content.replace(/\n$/, '').split('\n');
            diff = `diff --git a/${file} b/${file}\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => '+' + line).join('\n')}\n`;
        }
    }
    return { file, content, diff, deleted };
}

export async function getBaseCodeFiles(base: string): Promise<string[]> {
    return filterReviewableFiles(await getDiffNameOnly([`${base}...HEAD`]));
}

export async function getBaseCommitCodeFiles(baseCommit: string): Promise<string[]> {
    return filterReviewableFiles(await getDiffNameOnly([`${baseCommit}..HEAD`]));
}

// ── Get diff (staged or unstaged) ──
export async function getDiff(): Promise<string> {
    const head = await git.raw(['rev-parse', '--verify', 'HEAD']).then(
        () => 'HEAD',
        () => '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    );
    let diff = await git.raw(['diff', '--no-ext-diff', '--no-textconv', head]);

    // Auto-include untracked files as additions
    try {
        const { not_added } = await git.status();
        if (not_added && not_added.length > 0) {
            const fs = await import('fs/promises');
            for (const file of not_added) {
                if (!CODE_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
                const ignorePatterns = await getIgnorePatterns();
                if (ignorePatterns.some((pattern) => pattern.test(file))) continue;
                try {
                    const content = await fs.readFile(file, 'utf-8');
                    const lines = content.split('\n');
                    // Remove trailing empty line from final newline
                    if (lines.length > 0 && lines[lines.length - 1] === '') {
                        lines.pop();
                    }
                    const addedLines = lines.map((l: string) => '+' + l).join('\n');
                    diff += `\ndiff --git a/${file} b/${file}\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${addedLines}\n`;
                } catch (e) {
                    console.debug('Failed to get untracked diff:', e);
                }
            }
        }
    } catch (e) {
        console.debug('Failed to check untracked diff files:', e);
    }

    return diff || '';
}
