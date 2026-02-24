import os from 'node:os';
import path from 'node:path';
import * as fs from 'fs-extra';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import type { AppConfig } from './types.js';

// ── Config Path ──
const CONFIG_PATH = path.join(os.homedir(), '.ai-reviewer.json');

// ── Load / Save Config ──

export function loadConfig(): AppConfig {
    let conf: AppConfig = {
        provider: 'nvidia',
        apiKey: process.env.AI_CODE_REVIEW_API_KEY || process.env.NIM_API_KEY || process.env.NVIDIA_API_KEY || null,
        model: process.env.AI_MODEL || 'meta/llama3-70b-instruct',
        keys: {},
    };

    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const saved = fs.readJsonSync(CONFIG_PATH);
            if (saved.provider) conf.provider = saved.provider;
            if (saved.apiKey) conf.apiKey = saved.apiKey;
            if (saved.model) conf.model = saved.model;
            if (saved.keys) conf.keys = saved.keys;
        }
    } catch (_) { }

    if (!conf.apiKey && process.env.OPENAI_API_KEY) {
        conf.provider = 'openai';
        conf.apiKey = process.env.OPENAI_API_KEY;
        conf.model = 'gpt-4o';
    }

    return conf;
}

export function saveConfig(config: AppConfig) {
    fs.writeJsonSync(CONFIG_PATH, config, { spaces: 2 });
}

// ── Fetch Available Models ──

export async function fetchModels(
    provider: string,
    apiKey: string
): Promise<{ label: string; value: string }[]> {
    try {
        const fetchAndParse = async (url: string, headers: Record<string, string>) => {
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            return await res.json();
        };

        if (provider === 'nvidia') {
            const data = await fetchAndParse('https://integrate.api.nvidia.com/v1/models', {
                Authorization: `Bearer ${apiKey}`,
            });
            return (data.data || []).map((m: any) => ({ label: m.id, value: m.id }));
        } else if (provider === 'openai') {
            const data = await fetchAndParse('https://api.openai.com/v1/models', {
                Authorization: `Bearer ${apiKey}`,
            });
            return (data.data || [])
                .filter((m: any) => m.id.includes('gpt'))
                .map((m: any) => ({ label: m.id, value: m.id }));
        } else if (provider === 'groq') {
            const data = await fetchAndParse('https://api.groq.com/openai/v1/models', {
                Authorization: `Bearer ${apiKey}`,
            });
            return (data.data || []).map((m: any) => ({ label: m.id, value: m.id }));
        } else if (provider === 'cerebras') {
            const data = await fetchAndParse('https://api.cerebras.ai/v1/models', {
                Authorization: `Bearer ${apiKey}`,
            });
            return (data.data || []).map((m: any) => ({ label: m.id, value: m.id }));
        } else if (provider === 'openrouter') {
            const data = await fetchAndParse('https://openrouter.ai/api/v1/models', {});
            return (data.data || []).map((m: any) => ({ label: m.id, value: m.id }));
        } else if (provider === 'anthropic') {
            const res = await fetch('https://api.anthropic.com/v1/models', {
                headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const data = await res.json();
            return (data.data || [])
                .sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''))
                .map((m: any) => ({ label: m.display_name || m.id, value: m.id }));
        } else if (provider === 'google') {
            const data = await fetchAndParse(
                'https://generativelanguage.googleapis.com/v1beta/models',
                { 'x-goog-api-key': apiKey }
            );
            return (data.models || [])
                .filter((m: any) => m.name.includes('gemini'))
                .map((m: any) => ({ label: m.displayName, value: m.name.replace('models/', '') }));
        }
    } catch (e) {
        console.error('Failed to fetch models', e);
    }

    return [{ label: 'Default Model Fallback', value: 'default' }];
}

// ── Get AI Model Instance ──

export function getModel(config: AppConfig) {
    if (!config.apiKey) {
        throw new Error('API key is required. Set an API key via environment variable or configuration.');
    }

    if (config.provider === 'anthropic') {
        const anthropic = createAnthropic({ apiKey: config.apiKey });
        return anthropic(config.model || 'claude-4.5-sonnet');
    }
    if (config.provider === 'google') {
        const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
        return google(config.model || 'gemini-2.5-flash');
    }
    if (config.provider === 'openai') {
        const openai = createOpenAICompatible({
            name: 'openai',
            baseURL: 'https://api.openai.com/v1',
            headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        return openai(config.model || 'gpt-5-mini-2025-08-07');
    }

    let baseURL = '';
    if (config.provider === 'nvidia') baseURL = 'https://integrate.api.nvidia.com/v1';
    else if (config.provider === 'openrouter') baseURL = 'https://openrouter.ai/api/v1';
    else if (config.provider === 'groq') baseURL = 'https://api.groq.com/openai/v1';
    else if (config.provider === 'cerebras') baseURL = 'https://api.cerebras.ai/v1';
    else baseURL = 'https://api.openai.com/v1';

    const openaiCompat = createOpenAICompatible({
        name: config.provider,
        baseURL,
        headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    return openaiCompat(config.model || 'default');
}

/**
 * Perform a lightweight "ping" to validate the API key and model selection.
 */
export async function validateApiKey(config: AppConfig): Promise<boolean> {
    try {
        const model = getModel(config);
        await generateText({
            model,
            system: "Reply OK",
            prompt: "ping",
        });
        return true;
    } catch (e) {
        return false;
    }
}
