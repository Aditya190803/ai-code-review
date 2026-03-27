import path from 'node:path';
import { Project as TsProject } from 'ts-morph';
import * as fs from 'fs-extra';

const CODE_EXT_REGEX = /\.(ts|tsx|js|jsx)$/;

export async function getASTContext(files: string[]): Promise<string> {
    const deepContextStr: string[] = [];
    const tsProject = new TsProject();

    for (const file of files) {
        if (!(await fs.pathExists(file))) continue;

        if (CODE_EXT_REGEX.test(file)) {
            try {
                const sourceFile = tsProject.addSourceFileAtPath(file);
                if (!sourceFile) continue;
                const classes = sourceFile.getClasses().map((c): string | undefined => c.getName()).filter(Boolean).join(', ');
                const interfaces = sourceFile.getInterfaces().map((i): string | undefined => i.getName()).filter(Boolean).join(', ');
                const functions = sourceFile.getFunctions().map((f): string | undefined => f.getName()).filter(Boolean).map((n): string => n + '()').join(', ');
                const imports = sourceFile.getImportDeclarations().map((i): string => i.getModuleSpecifierValue()).join(', ');
                const exports = sourceFile.getExportDeclarations().map((e): string | undefined => e.getModuleSpecifierValue()).filter(Boolean).join(', ');

                deepContextStr.push(`\n--- file: ${file} (AST Analysis) ---`);
                if (imports) deepContextStr.push(`Imports: ${imports}`);
                if (exports) deepContextStr.push(`Exports: ${exports}`);
                if (classes) deepContextStr.push(`Classes: ${classes}`);
                if (interfaces) deepContextStr.push(`Interfaces: ${interfaces}`);
                if (functions) deepContextStr.push(`Functions: ${functions}\n`);

                tsProject.removeSourceFile(sourceFile);
            } catch (error) {
                console.error(`AST parser error for ${file}:`, error);
            }
        } else {
            try {
                // Prevent arbitrary file exposure by requiring workspace locality
                const absFile = fs.realpathSync(file);
                const workspaceRoot = path.resolve(process.cwd());
                const relativePath = path.relative(workspaceRoot, absFile);
                if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                    continue;
                }

                const content = (await fs.readFile(file, 'utf-8')).slice(0, 1000);
                deepContextStr.push(`\n--- file: ${file} ---\n${content}\n`);
            } catch (error) {
                console.error(`IO error for ${file}:`, error);
            }
        }
    }

    return deepContextStr.join('\n');
}

// ── Extract only meaningful structural code (functions, classes) to save LLM tokens ──
export function extractMeaningfulCode(file: string, content: string): string {
    if (!CODE_EXT_REGEX.test(file)) return content;

    // For small files, it's not worth the overhead, just return full content
    if (content.length < 1000) return content;

    try {
        const project = new TsProject({ useInMemoryFileSystem: true });
        const sourceFile = project.createSourceFile('temp.ts', content);

        const functions = sourceFile.getFunctions();
        const classes = sourceFile.getClasses();
        const interfaces = sourceFile.getInterfaces();

        const meaningful = [...functions, ...classes, ...interfaces]
            .map((node): string => node.getFullText())
            .join('\n\n');

        return meaningful.trim() || content; // Fallback to full content if empty
    } catch (error) {
        console.error(`AST meaningful code extraction error for ${file}:`, error);
        return content;
    }
}
