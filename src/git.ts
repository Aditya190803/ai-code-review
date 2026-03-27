import simpleGit from 'simple-git';

// ── Git Instance ──
export const git = simpleGit();

// ── Collect all project files (tracked + untracked) ──
export async function getAllProjectFiles(): Promise<string[]> {
    let tracked = '';
    let untracked = '';
    try {
        tracked = await git.raw(['ls-files']);
    } catch (e) {
        console.error('Failed to get tracked files:', e);
    }
    try {
        untracked = await git.raw(['ls-files', '--others', '--exclude-standard']);
    } catch (e) {
        console.error('Failed to get untracked files:', e);
    }

    const all = (tracked + '\n' + untracked).split('\n').filter((f) => f.trim() !== '');
    return [...new Set(all)];
}

// ── Collect scannable code files ──
const CODE_EXTENSIONS = [
    '.ts', '.tsx', '.mts', '.cts',
    '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.java',
    '.rb', '.php',
    '.c', '.cc', '.cpp', '.cxx',
    '.h', '.hh', '.hpp', '.hxx',
    '.sh',
];

const SKIP_PATTERNS = [
    /\.d\.ts$/,            // TypeScript declarations
    /\.min\.(js|css)$/,    // Minified files
    /\.lock$/,             // Lock files
    /\.map$/,              // Source maps
    /node_modules\//,      // Dependencies
    /dist\//,              // Build output
    /\.generated\./,       // Generated files
    /migrations?\//,       // DB migrations
    /vendor\//,            // Vendored code
    /\.test\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/, // Test files
    /\.spec\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/,
    /__snapshots__\//,      // Jest snapshots
    /\.stories\.(ts|tsx|js|jsx)$/, // Storybook stories
];

async function getIgnorePatterns(): Promise<RegExp[]> {
    const patterns = [...SKIP_PATTERNS];
    try {
        const fs = await import('fs/promises');
        if (await fs.stat('.ai-reviewignore').catch(() => null)) {
            const ignoreContent = await fs.readFile('.ai-reviewignore', 'utf-8');
            const lines = ignoreContent.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            for (const line of lines) {
                // Convert simple glob to regex naively for now
                let regexStr = line.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
                if (regexStr.endsWith('/')) regexStr += '.*';
                patterns.push(new RegExp(regexStr));
            }
        }
    } catch (e) {
        console.debug('Failed to get ignore patterns:', e);
    }
    return patterns;
}

export async function getCodeFiles(): Promise<string[]> {
    const all = await getAllProjectFiles();
    const ignorePatterns = await getIgnorePatterns();
    return all
        .filter((f) => CODE_EXTENSIONS.some((ext) => f.endsWith(ext)))
        .filter((f) => !ignorePatterns.some((pattern) => pattern.test(f)));
}

// ── Collect changed scannable code files ──
export async function getChangedCodeFiles(): Promise<string[]> {
    try {
        const { modified, staged, not_added, created, renamed } = await git.status();
        const changed = [
            ...modified,
            ...staged,
            ...not_added,
            ...created,
            ...renamed.map(r => r.to)
        ];

        const allUnique = [...new Set(changed)];
        const ignorePatterns = await getIgnorePatterns();
        return allUnique
            .filter((f) => CODE_EXTENSIONS.some((ext) => f.endsWith(ext)))
            .filter((f) => !ignorePatterns.some((pattern) => pattern.test(f)));
    } catch (e) {
        console.debug('Failed to get changed code files:', e);
        return [];
    }
}

// ── Get diff (staged or unstaged) ──
export async function getDiff(): Promise<string> {
    let diff = '';
    try {
        diff = await git.diff();
    } catch (e) {
        console.debug('Failed to get diff:', e);
    }
    if (!diff) {
        try {
            diff = await git.diff(['--staged']);
        } catch (e) {
            console.debug('Failed to get staged diff:', e);
        }
    }

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
