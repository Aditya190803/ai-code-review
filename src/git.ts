import simpleGit from 'simple-git';

// ── Git Instance ──
export const git = simpleGit();

// ── Collect all project files (tracked + untracked) ──
export async function getAllProjectFiles(): Promise<string[]> {
    let tracked = '';
    let untracked = '';
    try {
        tracked = await git.raw(['ls-files']);
    } catch (_) { }
    try {
        untracked = await git.raw(['ls-files', '--others', '--exclude-standard']);
    } catch (_) { }

    const all = (tracked + '\n' + untracked).split('\n').filter((f) => f.trim() !== '');
    return [...new Set(all)];
}

// ── Collect scannable code files ──
const CODE_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs',
    '.java', '.rb', '.php', '.c', '.cpp', '.h', '.sh',
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
    /\.test\.(ts|js|tsx)$/, // Test files
    /\.spec\.(ts|js|tsx)$/,
    /__snapshots__\//,     // Jest snapshots
    /\.stories\.(ts|tsx)$/, // Storybook stories
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
    } catch (_) { }
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
    } catch (_) {
        return [];
    }
}

// ── Get diff (staged or unstaged) ──
export async function getDiff(): Promise<string> {
    let diff = '';
    try {
        diff = await git.diff();
    } catch (_) { }
    if (!diff) {
        try {
            diff = await git.diff(['--staged']);
        } catch (_) { }
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
                } catch (_) { }
            }
        }
    } catch (_) { }

    return diff || '';
}
