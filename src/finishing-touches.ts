import { generateText } from 'ai';
import * as fs from 'fs-extra';
import { getModel } from './config.js';
import type { AppConfig } from './types.js';

export type FinishingAction = 'docstring' | 'tests' | 'simplify' | 'merge-hints';

export async function runFinishingTouch(
    config: AppConfig,
    action: FinishingAction,
    filePath: string,
): Promise<{ ok: boolean; message: string }> {
    if (!(await fs.pathExists(filePath))) {
        return { ok: false, message: 'File not found.' };
    }
    const content = await fs.readFile(filePath, 'utf-8');
    const instructions: Record<FinishingAction, string> = {
        docstring: 'Add concise docstrings/JSDoc to exported symbols missing documentation. Keep behavior identical.',
        tests: 'Suggest a minimal test file (new file path + full content) covering the main exports. Output test file in a fenced block labeled tests.',
        simplify: 'Refactor for clarity without behavior change. Return full updated file in one fenced block.',
        'merge-hints': 'If this file has conflict markers, resolve them conservatively favoring incoming changes where safe. Return full file.',
    };
    const model = getModel(config);
    const { text } = await generateText({
        model,
        prompt: `${instructions[action]}\n\nFile: ${filePath}\n\n\`\`\`\n${content}\n\`\`\``,
        maxOutputTokens: 12_000,
    });

    if (action === 'tests') {
        return { ok: true, message: text.slice(0, 8000) };
    }

    const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (!match) return { ok: false, message: 'No code block in model response.' };
    if (action !== 'merge-hints' && content.includes('<<<<<<<')) {
        await fs.writeFile(filePath, match[1].trimEnd() + '\n', 'utf-8');
        return { ok: true, message: 'Wrote resolved file.' };
    }
    if (action === 'docstring' || action === 'simplify') {
        await fs.writeFile(filePath, match[1].trimEnd() + '\n', 'utf-8');
        return { ok: true, message: `Updated ${filePath}.` };
    }
    return { ok: true, message: text.slice(0, 4000) };
}