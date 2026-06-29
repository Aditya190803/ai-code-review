import type { ProjectIndex } from './types.js';

/** Lightweight call-graph hints from project index (symbol + import edges). */
export function buildCallGraphContext(
    index: ProjectIndex,
    filePath: string,
    maxLines = 40,
): string {
    const entry = index.files[filePath];
    if (!entry) return '';

    const lines: string[] = [
        `Call-graph hints for ${filePath}:`,
        `Symbols: ${entry.symbols.slice(0, 12).join(', ') || '(none)'}`,
    ];

    if (entry.localDependencies.length) {
        lines.push(`Depends on: ${entry.localDependencies.slice(0, 8).join(', ')}`);
    }
    if (entry.dependents.length) {
        lines.push(`Used by: ${entry.dependents.slice(0, 8).join(', ')}`);
    }

    for (const dep of entry.localDependencies.slice(0, 5)) {
        const other = index.files[dep];
        if (other?.symbols.length) {
            lines.push(`  ${dep} exports: ${other.symbols.slice(0, 6).join(', ')}`);
        }
    }

    return lines.slice(0, maxLines).join('\n');
}