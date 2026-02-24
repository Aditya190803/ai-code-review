import { Project as TsProject } from 'ts-morph';
import * as fs from 'fs-extra';

export async function getASTContext(files: string[]): Promise<string> {
    let deepContext = '';
    const tsProject = new TsProject();

    for (const file of files) {
        if (!(await fs.pathExists(file))) continue;

        if (/\.(ts|tsx|js|jsx)$/.test(file)) {
            try {
                const sourceFile = tsProject.addSourceFileAtPath(file);
                if (!sourceFile) continue;
                const classes = sourceFile.getClasses().map((c) => c.getName()).filter(Boolean).join(', ');
                const interfaces = sourceFile.getInterfaces().map((i) => i.getName()).filter(Boolean).join(', ');
                const functions = sourceFile.getFunctions().map((f) => f.getName()).filter(Boolean).map(n => n + '()').join(', ');
                const imports = sourceFile.getImportDeclarations().map((i) => i.getModuleSpecifierValue()).join(', ');
                const exports = sourceFile.getExportDeclarations().map((e) => e.getModuleSpecifierValue()).filter(Boolean).join(', ');

                deepContext += `\n--- file: ${file} (AST Analysis) ---`;
                if (imports) deepContext += `\nImports: ${imports}`;
                if (exports) deepContext += `\nExports: ${exports}`;
                if (classes) deepContext += `\nClasses: ${classes}`;
                if (interfaces) deepContext += `\nInterfaces: ${interfaces}`;
                if (functions) deepContext += `\nFunctions: ${functions}\n`;

                tsProject.removeSourceFile(sourceFile);
            } catch (_) {
                /* ignore parser errors */
            }
        } else {
            try {
                const content = (await fs.readFile(file, 'utf-8')).slice(0, 1000);
                deepContext += `\n--- file: ${file} ---\n${content}\n`;
            } catch (_) {
                /* skip unreadable files */
            }
        }
    }

    return deepContext;
}

// ── Extract only meaningful structural code (functions, classes) to save LLM tokens ──
export function extractMeaningfulCode(file: string, content: string): string {
    if (!/\.(ts|tsx|js|jsx)$/.test(file)) return content;

    // For small files, it's not worth the overhead, just return full content
    if (content.length < 1000) return content;

    try {
        const project = new TsProject({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile('temp.ts', content);

        const functions = sourceFile.getFunctions();
        const classes = sourceFile.getClasses();
        const interfaces = sourceFile.getInterfaces();

        const meaningful = [...functions, ...classes, ...interfaces]
            .map(node => node.getFullText())
            .join('\n\n');

        return meaningful.trim() || content; // Fallback to full content if empty
    } catch {
        return content;
    }
}
