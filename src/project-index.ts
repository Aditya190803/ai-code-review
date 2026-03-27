import path from 'node:path';
import { createHash } from 'crypto';
import * as fs from 'fs-extra';
import { Project as TsProject } from 'ts-morph';
import type { IndexedFileEntry, ProjectIndex } from './types.js';

const INDEX_FILE = '.ai-reviewer-project-index.json';
const PROJECT_INDEX_VERSION = '2026-03-27';
const JS_LIKE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const TS_LIKE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const JS_TS_EXTENSIONS = new Set([...JS_LIKE_EXTENSIONS, ...TS_LIKE_EXTENSIONS]);
const GO_EXTENSIONS = new Set(['.go']);
const JAVA_EXTENSIONS = new Set(['.java']);
const RUST_EXTENSIONS = new Set(['.rs']);
const C_FAMILY_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx']);

interface IndexCallbacks {
    onProgress?: (msg: string) => void;
    onLog?: (msg: string) => void;
}

interface ParsedStructure {
    imports: string[];
    exports: string[];
    symbols: string[];
    summary: string;
}

const activeIndexBuilds = new Map<string, Promise<ProjectIndex>>();

function getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
}

function unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

function hashText(input: string): string {
    return createHash('sha256').update(input).digest('hex');
}

function buildIndexRevision(files: Record<string, IndexedFileEntry>): string {
    const payload = Object.values(files)
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((file) => `${file.path}:${file.hash}:${file.localDependencies.join(',')}:${file.summary}`)
        .join('\n');

    return hashText(payload);
}

function extractMeaningfulLines(content: string, limit = 3): string[] {
    return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => !line.startsWith('//') && !line.startsWith('#') && !line.startsWith('*'))
        .slice(0, limit);
}

function buildFallbackSummary(content: string, symbols: string[], label: string): string {
    const preview = extractMeaningfulLines(content, 2).join(' ');
    if (symbols.length > 0) {
        return `${label}: ${symbols.slice(0, 6).join(', ')}${preview ? ` — ${preview.slice(0, 160)}` : ''}`;
    }
    return preview || `${label} source file`;
}

function regexMatches(content: string, regex: RegExp): string[] {
    const matches = Array.from(content.matchAll(regex), (match) => (match[1] || '').trim());
    return unique(matches.filter(Boolean));
}

function summarizeParts(parts: string[]): string {
    return parts.filter(Boolean).join(' | ');
}

function extractJsTsStructure(filePath: string, content: string): ParsedStructure {
    try {
        const project = new TsProject({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });

        const imports = sourceFile.getImportDeclarations().map((declaration) => declaration.getModuleSpecifierValue());
        const exports = Array.from(sourceFile.getExportedDeclarations().keys());
        const symbols = unique([
            ...sourceFile.getFunctions().map((node) => node.getName()).filter(Boolean) as string[],
            ...sourceFile.getClasses().map((node) => node.getName()).filter(Boolean) as string[],
            ...sourceFile.getInterfaces().map((node) => node.getName()).filter(Boolean) as string[],
            ...sourceFile.getEnums().map((node) => node.getName()).filter(Boolean) as string[],
            ...sourceFile.getTypeAliases().map((node) => node.getName()).filter(Boolean) as string[],
            ...sourceFile.getVariableStatements()
                .flatMap((statement) => statement.getDeclarations().map((declaration) => declaration.getName())),
        ]);

        const summary = summarizeParts([
            symbols.length > 0 ? `Symbols: ${symbols.slice(0, 6).join(', ')}` : '',
            imports.length > 0 ? `Imports ${imports.slice(0, 4).join(', ')}` : '',
            exports.length > 0 ? `Exports ${exports.slice(0, 4).join(', ')}` : '',
        ]) || buildFallbackSummary(content, symbols, 'JS/TS module');

        return { imports: unique(imports), exports: unique(exports), symbols, summary };
    } catch {
        const symbols = regexMatches(content, /(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_]\w*)/g);
        return {
            imports: regexMatches(content, /(?:import|export)\s+(?:[^'"]+from\s+)?['"]([^'"]+)['"]/g),
            exports: [],
            symbols,
            summary: buildFallbackSummary(content, symbols, 'JS/TS module'),
        };
    }
}

function extractGoStructure(content: string): ParsedStructure {
    const imports = unique([
        ...regexMatches(content, /^\s*import\s+"([^"]+)"/gm),
        ...regexMatches(content, /^\s*"([^"]+)"\s*$/gm),
    ]);
    const symbols = unique([
        ...regexMatches(content, /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/gm),
        ...regexMatches(content, /^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/gm),
        ...regexMatches(content, /^\s*var\s+([A-Za-z_]\w*)\b/gm),
        ...regexMatches(content, /^\s*const\s+([A-Za-z_]\w*)\b/gm),
    ]);

    return {
        imports,
        exports: symbols.filter((symbol) => /^[A-Z]/.test(symbol)),
        symbols,
        summary: buildFallbackSummary(content, symbols, 'Go package'),
    };
}

function extractJavaStructure(content: string): ParsedStructure {
    const imports = regexMatches(content, /^\s*import\s+([^;]+);/gm);
    const symbols = unique([
        ...regexMatches(content, /\b(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/g),
        ...regexMatches(content, /\b(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?[\w<>\[\], ?]+\s+([A-Za-z_]\w*)\s*\(/g),
    ]);

    return {
        imports,
        exports: regexMatches(content, /\bpublic\s+(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/g),
        symbols,
        summary: buildFallbackSummary(content, symbols, 'Java source'),
    };
}

function extractRustStructure(content: string): ParsedStructure {
    const imports = unique([
        ...regexMatches(content, /^\s*use\s+([^;]+);/gm),
        ...regexMatches(content, /^\s*mod\s+([A-Za-z_]\w*)\s*;/gm),
    ]);
    const symbols = unique([
        ...regexMatches(content, /\b(?:pub\s+)?fn\s+([A-Za-z_]\w*)\s*\(/g),
        ...regexMatches(content, /\b(?:pub\s+)?(?:struct|enum|trait|mod)\s+([A-Za-z_]\w*)/g),
        ...regexMatches(content, /\bimpl\s+([A-Za-z_]\w*)/g),
    ]);

    return {
        imports,
        exports: regexMatches(content, /\bpub\s+(?:fn|struct|enum|trait|mod)\s+([A-Za-z_]\w*)/g),
        symbols,
        summary: buildFallbackSummary(content, symbols, 'Rust module'),
    };
}

function extractCFamilyStructure(content: string): ParsedStructure {
    const imports = regexMatches(content, /^\s*#include\s+[<"]([^>"]+)[>"]/gm);
    const symbols = unique([
        ...regexMatches(content, /^\s*(?:typedef\s+)?(?:struct|class|enum)\s+([A-Za-z_]\w*)/gm),
        ...regexMatches(content, /^\s*(?:static\s+|inline\s+|constexpr\s+|virtual\s+|extern\s+)*[\w:<>~*&\s]+\s+([A-Za-z_]\w*)\s*\([^;{]*\)\s*\{/gm),
    ]);

    return {
        imports,
        exports: [],
        symbols,
        summary: buildFallbackSummary(content, symbols, 'C/C++ translation unit'),
    };
}

function extractGenericStructure(content: string): ParsedStructure {
    const symbols = regexMatches(content, /\b([A-Za-z_]\w*)\s*\(/g).slice(0, 10);
    return {
        imports: [],
        exports: [],
        symbols,
        summary: buildFallbackSummary(content, symbols, 'Source file'),
    };
}

function extractStructure(filePath: string, content: string): ParsedStructure {
    const ext = getFileExtension(filePath);

    if (JS_TS_EXTENSIONS.has(ext)) {
        return extractJsTsStructure(filePath, content);
    }
    if (GO_EXTENSIONS.has(ext)) {
        return extractGoStructure(content);
    }
    if (JAVA_EXTENSIONS.has(ext)) {
        return extractJavaStructure(content);
    }
    if (RUST_EXTENSIONS.has(ext)) {
        return extractRustStructure(content);
    }
    if (C_FAMILY_EXTENSIONS.has(ext)) {
        return extractCFamilyStructure(content);
    }

    return extractGenericStructure(content);
}

function resolveCandidatePaths(baseFile: string, specifier: string): string[] {
    const baseDir = path.posix.dirname(baseFile);
    const normalized = path.posix.normalize(path.posix.join(baseDir, specifier));
    const candidates = [normalized];
    const extensions = [
        '.ts', '.tsx', '.mts', '.cts',
        '.js', '.jsx', '.mjs', '.cjs',
        '.go', '.java', '.rs',
        '.c', '.cc', '.cpp', '.cxx',
        '.h', '.hh', '.hpp', '.hxx',
    ];

    if (!path.posix.extname(normalized)) {
        for (const ext of extensions) {
            candidates.push(`${normalized}${ext}`);
        }
        for (const ext of extensions) {
            candidates.push(path.posix.join(normalized, `index${ext}`));
        }
    }

    return unique(candidates);
}

function isLocalImport(specifier: string): boolean {
    return specifier.startsWith('./') || specifier.startsWith('../');
}

function deriveLocalDependencies(filePath: string, imports: string[], knownFiles: Set<string>): string[] {
    const resolved: string[] = [];

    for (const specifier of imports) {
        if (!isLocalImport(specifier)) continue;
        for (const candidate of resolveCandidatePaths(filePath, specifier)) {
            if (knownFiles.has(candidate)) {
                resolved.push(candidate);
                break;
            }
        }
    }

    return unique(resolved);
}

async function loadExistingIndex(): Promise<ProjectIndex | null> {
    try {
        const index = await fs.readJson(INDEX_FILE) as ProjectIndex;
        if (index.version !== PROJECT_INDEX_VERSION || !index.files) {
            return null;
        }
        return index;
    } catch {
        return null;
    }
}

async function buildOrRefreshIndex(files: string[], callbacks: IndexCallbacks = {}): Promise<ProjectIndex> {
    const normalizedFiles = [...new Set(files)].sort();
    const knownFiles = new Set(normalizedFiles);
    const existing = await loadExistingIndex();
    const nextFiles: Record<string, IndexedFileEntry> = {};
    const staleOrMissing: string[] = [];

    for (const file of normalizedFiles) {
        try {
            const content = await fs.readFile(file, 'utf-8');
            const hash = hashText(content);
            const existingEntry = existing?.files[file];

            if (existingEntry && existingEntry.hash === hash) {
                nextFiles[file] = {
                    ...existingEntry,
                    path: file,
                    ext: getFileExtension(file),
                    bytes: Buffer.byteLength(content, 'utf-8'),
                };
                continue;
            }

            staleOrMissing.push(file);
            const structure = extractStructure(file, content);
            nextFiles[file] = {
                path: file,
                ext: getFileExtension(file),
                hash,
                bytes: Buffer.byteLength(content, 'utf-8'),
                summary: structure.summary,
                imports: structure.imports,
                localDependencies: [],
                dependents: [],
                exports: structure.exports,
                symbols: structure.symbols,
                updatedAt: Date.now(),
            };
        } catch {
            // Skip unreadable files
        }
    }

    if (!existing) {
        callbacks.onLog?.(`Building project index for ${Object.keys(nextFiles).length} files...`);
    } else if (staleOrMissing.length > 0) {
        callbacks.onLog?.(`Refreshing project index for ${staleOrMissing.length} changed file(s)...`);
    }

    for (const entry of Object.values(nextFiles)) {
        entry.localDependencies = deriveLocalDependencies(entry.path, entry.imports, knownFiles);
        entry.dependents = [];
    }

    for (const entry of Object.values(nextFiles)) {
        for (const dependency of entry.localDependencies) {
            const target = nextFiles[dependency];
            if (target) {
                target.dependents = unique([...target.dependents, entry.path]);
            }
        }
    }

    const index: ProjectIndex = {
        version: PROJECT_INDEX_VERSION,
        root: process.cwd(),
        generatedAt: Date.now(),
        revision: buildIndexRevision(nextFiles),
        files: nextFiles,
    };

    await fs.writeJson(INDEX_FILE, index, { spaces: 2 });
    callbacks.onProgress?.('');
    return index;
}

export async function ensureProjectIndex(files: string[], callbacks: IndexCallbacks = {}): Promise<ProjectIndex> {
    const buildKey = [...new Set(files)].sort().join('\u0000');
    const activeBuild = activeIndexBuilds.get(buildKey);
    if (activeBuild) {
        return activeBuild;
    }

    callbacks.onProgress?.('Indexing project structure...');

    const build = buildOrRefreshIndex(files, callbacks).finally(() => {
        activeIndexBuilds.delete(buildKey);
    });

    activeIndexBuilds.set(buildKey, build);
    return build;
}

function formatIndexedFile(entry: IndexedFileEntry): string {
    const parts = [
        `file: ${entry.path}`,
        `summary: ${entry.summary}`,
        entry.symbols.length > 0 ? `symbols: ${entry.symbols.slice(0, 8).join(', ')}` : '',
        entry.exports.length > 0 ? `exports: ${entry.exports.slice(0, 6).join(', ')}` : '',
    ].filter(Boolean);

    return parts.join('\n');
}

export function getProjectContext(
    index: ProjectIndex,
    filePath: string,
    options?: { changedFiles?: string[]; limit?: number }
): string {
    const entry = index.files[filePath];
    if (!entry) return '';

    const limit = options?.limit ?? 6;
    const related = new Map<string, { score: number; reason: string }>();
    const changedFiles = new Set((options?.changedFiles || []).filter((file) => file !== filePath));

    for (const dependency of entry.localDependencies) {
        related.set(dependency, { score: 100, reason: 'direct dependency' });
    }

    for (const dependent of entry.dependents) {
        related.set(dependent, { score: 90, reason: 'depends on current file' });
    }

    for (const changedFile of changedFiles) {
        const existing = related.get(changedFile);
        related.set(changedFile, {
            score: Math.max(existing?.score || 0, 80),
            reason: existing ? `${existing.reason}, changed in current review` : 'changed in current review',
        });
    }

    const siblingFiles = Object.keys(index.files)
        .filter((candidate) => candidate !== filePath)
        .filter((candidate) => path.posix.dirname(candidate) === path.posix.dirname(filePath))
        .slice(0, 3);

    for (const sibling of siblingFiles) {
        if (!related.has(sibling)) {
            related.set(sibling, { score: 40, reason: 'same directory' });
        }
    }

    const selected = [...related.entries()]
        .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([relatedFile, meta]) => {
            const relatedEntry = index.files[relatedFile];
            if (!relatedEntry) return '';
            return `reason: ${meta.reason}\n${formatIndexedFile(relatedEntry)}`;
        })
        .filter(Boolean);

    if (selected.length === 0) {
        return `Current file context:\n${formatIndexedFile(entry)}`;
    }

    return [
        'Current file context:',
        formatIndexedFile(entry),
        '',
        'Relevant project context:',
        ...selected.map((block, indexEntry) => `--- related ${indexEntry + 1} ---\n${block}`),
    ].join('\n');
}
