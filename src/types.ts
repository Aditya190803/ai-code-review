// ── Shared Types & Constants ──

export interface ScanIssue {
    category: string;
    severity: string;
    title: string;
    line: number;
    lineEnd: number;
    codeContext: string;
    description: string;
    suggestedFix: string;
    aiPrompt: string;
    file: string;
}

export interface AppConfig {
    provider: string;
    apiKey: string | null;
    model: string;
    keys?: Record<string, string>;
    reviewLanguage?: string;
    uiLanguage?: string;
    reviewTone?: 'balanced' | 'strict';
    providerOptions?: Record<string, {
        baseURL?: string;
        modelListURL?: string;
    }>;
}

export interface IndexedFileEntry {
    path: string;
    ext: string;
    hash: string;
    bytes: number;
    summary: string;
    imports: string[];
    localDependencies: string[];
    dependents: string[];
    exports: string[];
    symbols: string[];
    updatedAt: number;
}

export interface ProjectIndex {
    version: string;
    root: string;
    generatedAt: number;
    revision: string;
    files: Record<string, IndexedFileEntry>;
}

export const SEVERITY_COLORS: Record<string, string> = {
    critical: 'red',
    warning: 'yellow',
    info: 'blue',
};

export const SEVERITY_ICONS: Record<string, string> = {
    critical: '✕',
    warning: '⚠',
    info: 'ℹ',
};

export const CATEGORY_ICONS: Record<string, string> = {
    bug: 'Bug',
    runtime: 'Runtime',
    security: 'Security',
    performance: 'Perf',
    style: 'Style',
    antipattern: 'Antipattern',
    crossfile: 'Cross-file',
    test: 'Test',
};
