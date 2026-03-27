import os from 'node:os';
import path from 'node:path';
import * as fs from 'fs-extra';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import type { AppConfig } from './types.js';
import { DEFAULT_REVIEW_LANGUAGE, DEFAULT_UI_LANGUAGE } from './locales.js';
import { getProviderDefinition, getProviderEnvKey, PROVIDERS } from './providers.js';

// ── Config Path ──
const CONFIG_PATH = path.join(os.homedir(), '.ai-reviewer.json');

function getDefaultConfig(): AppConfig {
    const defaultProvider = 'nvidia';
    const provider = getProviderDefinition(defaultProvider);

    return {
        provider: defaultProvider,
        apiKey: getProviderEnvKey(defaultProvider) || null,
        model: provider?.defaultModel || 'default',
        keys: {},
        reviewLanguage: DEFAULT_REVIEW_LANGUAGE,
        uiLanguage: DEFAULT_UI_LANGUAGE,
        reviewTone: 'strict',
        providerOptions: {},
    };
}

export function normalizeConfig(config?: Partial<AppConfig> | null): AppConfig {
    const fallback = getDefaultConfig();
    const provider = config?.provider || fallback.provider;
    const providerDefinition = getProviderDefinition(provider);

    return {
        provider,
        apiKey: config?.apiKey ?? config?.keys?.[provider] ?? getProviderEnvKey(provider) ?? fallback.apiKey,
        model: config?.model || providerDefinition?.defaultModel || fallback.model,
        keys: config?.keys || {},
        reviewLanguage: config?.reviewLanguage || fallback.reviewLanguage,
        uiLanguage: config?.uiLanguage || fallback.uiLanguage,
        reviewTone: config?.reviewTone || fallback.reviewTone,
        providerOptions: config?.providerOptions || {},
    };
}

// ── Load / Save Config ──

export async function loadConfig(): Promise<AppConfig> {
    let conf: AppConfig = normalizeConfig({
        provider: 'nvidia',
        apiKey: process.env.AI_CODE_REVIEW_API_KEY || getProviderEnvKey('nvidia') || null,
        model: process.env.AI_MODEL || getProviderDefinition('nvidia')?.defaultModel || 'default',
    });

    try {
        if (await fs.pathExists(CONFIG_PATH)) {
            const saved = await fs.readJson(CONFIG_PATH);
            conf = normalizeConfig(saved as Partial<AppConfig>);
        }
    } catch (e) {
        console.debug('Failed to load local config', e);
    }

    if (!conf.apiKey && process.env.OPENAI_API_KEY) {
        conf = normalizeConfig({
            ...conf,
            provider: 'openai',
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.AI_MODEL || getProviderDefinition('openai')?.defaultModel,
        });
    }

    return conf;
}

export async function saveConfig(config: AppConfig) {
    await fs.writeJson(CONFIG_PATH, normalizeConfig(config), { spaces: 2 });
}

// ── Fetch Available Models ──

export async function fetchModels(
    provider: string,
    apiKey: string,
    signal?: AbortSignal
): Promise<{ label: string; value: string }[]> {
    try {
        const definition = getProviderDefinition(provider);
        if (!definition?.modelListURL) {
            throw new Error(`Provider "${provider}" does not support remote model discovery.`);
        }

        const fetchAndParse = async (url: string, headers: Record<string, string>) => {
            const res = await fetch(url, { headers, signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            return await res.json();
        };

        const data = await fetchAndParse(
            definition.modelListURL,
            definition.authHeaders?.(apiKey) || {}
        );
        const response = data as Record<string, unknown>;
        const source = Array.isArray(response[definition.modelResponsePath])
            ? response[definition.modelResponsePath] as Record<string, unknown>[]
            : [];

        const models = source
            .map((model: unknown) => definition.modelMapper(model as Record<string, unknown>))
            .filter(Boolean) as { label: string; value: string }[];

        if (provider === 'anthropic') {
            return models.sort((a, b) => a.label.localeCompare(b.label));
        }

        return models;
    } catch (e) {
        console.error('Failed to fetch models', e);
        throw e;
    }
}

// ── Get AI Model Instance ──

export function getModel(config: AppConfig) {
    const normalized = normalizeConfig(config);

    if (!normalized.apiKey) {
        throw new Error('API key is required. Set an API key via environment variable or configuration.');
    }

    if (normalized.provider === 'anthropic') {
        const anthropic = createAnthropic({ apiKey: normalized.apiKey });
        return anthropic(normalized.model || getProviderDefinition('anthropic')?.defaultModel || 'claude-sonnet-4-5');
    }
    if (normalized.provider === 'google') {
        const google = createGoogleGenerativeAI({ apiKey: normalized.apiKey });
        return google(normalized.model || getProviderDefinition('google')?.defaultModel || 'gemini-2.5-flash');
    }
    if (normalized.provider === 'openai') {
        const openai = createOpenAICompatible({
            name: 'openai',
            baseURL: normalized.providerOptions?.openai?.baseURL || getProviderDefinition('openai')?.baseURL || 'https://api.openai.com/v1',
            headers: { Authorization: `Bearer ${normalized.apiKey}` },
        });
        return openai(normalized.model || getProviderDefinition('openai')?.defaultModel || 'gpt-5-mini');
    }

    const providerDefinition = getProviderDefinition(normalized.provider);
    const baseURL =
        normalized.providerOptions?.[normalized.provider]?.baseURL ||
        providerDefinition?.baseURL;

    if (!baseURL) {
        throw new Error(`Provider "${normalized.provider}" does not have a base URL configured.`);
    }

    const openaiCompat = createOpenAICompatible({
        name: normalized.provider,
        baseURL,
        headers: { Authorization: `Bearer ${normalized.apiKey}` },
    });
    return openaiCompat(normalized.model || providerDefinition?.defaultModel || 'default');
}

/**
 * Perform a lightweight "ping" to validate the API key and model selection.
 */
export async function validateApiKey(config: AppConfig): Promise<boolean> {
    try {
        const model = getModel(config);
        await generateText({
            model,
            system: 'Reply OK',
            prompt: 'ping',
        });
        return true;
    } catch (e) {
        return false;
    }
}

export function getProviderLabels(): { label: string; value: string }[] {
    return PROVIDERS.map((provider) => ({
        label: provider.label,
        value: provider.id,
    }));
}
