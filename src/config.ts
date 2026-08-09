import os from 'node:os';
import path from 'node:path';
import * as fs from 'fs-extra';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import type { AppConfig } from './types.js';
import { DEFAULT_REVIEW_LANGUAGE, DEFAULT_UI_LANGUAGE } from './locales.js';
import {
    getProviderBaseURL,
    getProviderDefinition,
    getProviderEnvKey,
    getProviderModelListURL,
    providerRequiresApiKey,
    PROVIDERS,
    SHORT_REPLY_MAX_OUTPUT_TOKENS,
} from './providers.js';
import { validateExternalProvider } from './provider-runtime.js';

// ── Config Path ──
const CONFIG_PATH = path.join(os.homedir(), '.ai-reviewer.json');

function getDefaultConfig(): AppConfig {
    let defaultProvider = 'opencode';
    let apiKey: string | null = null;

    for (const def of PROVIDERS) {
        if (!def.requiresApiKey || !def.envKeys.length) continue;
        for (const key of def.envKeys) {
            const value = process.env[key];
            if (value) {
                defaultProvider = def.id;
                apiKey = value;
                break;
            }
        }
        if (apiKey) break;
    }

    const provider = getProviderDefinition(defaultProvider);

    return {
        provider: defaultProvider,
        apiKey: apiKey ?? (getProviderEnvKey(defaultProvider) || null),
        model: process.env.AI_MODEL || provider?.defaultModel || 'default',
        keys: {},
        authMode: 'subscription',
        reviewLanguage: DEFAULT_REVIEW_LANGUAGE,
        uiLanguage: DEFAULT_UI_LANGUAGE,
        reviewTone: 'strict',
        providerOptions: {},
    };
}

export function normalizeConfig(config?: Partial<AppConfig> | null): AppConfig {
    const fallback = getDefaultConfig();
    const requestedProvider = config?.provider || fallback.provider;
    const provider = getProviderDefinition(requestedProvider) ? requestedProvider : fallback.provider;
    const useSavedProviderValues = provider === requestedProvider;
    const providerDefinition = getProviderDefinition(provider);
    const fallbackApiKey = provider === fallback.provider ? fallback.apiKey : null;
    const apiKey = providerRequiresApiKey(provider)
        ? (useSavedProviderValues ? config?.apiKey : undefined) ?? config?.keys?.[provider] ?? getProviderEnvKey(provider) ?? fallbackApiKey
        : null;

    return {
        provider,
        apiKey,
        model: (useSavedProviderValues ? config?.model : undefined) || providerDefinition?.defaultModel || fallback.model,
        keys: config?.keys || {},
        authMode: config?.authMode || fallback.authMode,
        reviewLanguage: config?.reviewLanguage || fallback.reviewLanguage,
        uiLanguage: config?.uiLanguage || fallback.uiLanguage,
        reviewTone: config?.reviewTone || fallback.reviewTone,
        providerOptions: config?.providerOptions || {},
    };
}

// ── Load / Save Config ──

export async function loadConfig(): Promise<AppConfig> {
    let conf: AppConfig = normalizeConfig(getDefaultConfig());

    try {
        if (await fs.pathExists(CONFIG_PATH)) {
            const saved = await fs.readJson(CONFIG_PATH);
            conf = normalizeConfig(saved as Partial<AppConfig>);
        }
    } catch (e) {
        console.debug('Failed to load local config', e);
    }

    if (!conf.apiKey) {
        for (const def of PROVIDERS) {
            if (!def.requiresApiKey || !def.envKeys.length) continue;
            for (const key of def.envKeys) {
                const value = process.env[key];
                if (value) {
                    conf = normalizeConfig({
                        ...conf,
                        provider: def.id,
                        apiKey: value,
                        model: process.env.AI_MODEL || def.defaultModel,
                    });
                    break;
                }
            }
            if (conf.apiKey) break;
        }
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
        const modelListURL = getProviderModelListURL(provider);
        if (!definition || !modelListURL) {
            if (definition?.staticModels?.length) {
                return definition.staticModels;
            }
            return [{ label: definition?.defaultModel || 'default', value: definition?.defaultModel || 'default' }];
        }

        const fetchAndParse = async (url: string, headers: Record<string, string>) => {
            const timeoutController = new AbortController();
            const timeout = setTimeout(() => timeoutController.abort(), 8_000);
            const abortHandler = () => timeoutController.abort();

            signal?.addEventListener('abort', abortHandler, { once: true });

            try {
                const res = await fetch(url, { headers, signal: timeoutController.signal });
                if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                return await res.json();
            } finally {
                clearTimeout(timeout);
                signal?.removeEventListener('abort', abortHandler);
            }
        };

        const data = await fetchAndParse(
            modelListURL,
            definition.authHeaders?.(apiKey) || {}
        );
        const response = data as Record<string, unknown>;
        const source = Array.isArray(response[definition.modelResponsePath])
            ? response[definition.modelResponsePath] as Record<string, unknown>[]
            : [];

        const models = source
            .map((model: unknown) => definition.modelMapper(model as Record<string, unknown>))
            .filter(Boolean) as { label: string; value: string }[];

        if (models.length === 0 && definition.staticModels?.length) {
            return definition.staticModels;
        }

        if (provider === 'anthropic') {
            return models.sort((a, b) => a.label.localeCompare(b.label));
        }

        return models;
    } catch (e) {
        const definition = getProviderDefinition(provider);
        if (definition?.staticModels?.length) {
            return definition.staticModels;
        }

        console.error('Failed to fetch models', e);
        throw e;
    }
}

// ── Get AI Model Instance ──

export function getModel(config: AppConfig) {
    const normalized = normalizeConfig(config);

    const definition = getProviderDefinition(normalized.provider);
    if (definition?.runtime && definition.runtime !== 'ai-sdk') {
        throw new Error(`${definition.label} uses ${definition.runtime} and is not available as a Vercel AI SDK model.`);
    }

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
            baseURL: getProviderBaseURL('openai', normalized.providerOptions?.openai?.baseURL) || 'https://api.openai.com/v1',
            headers: { Authorization: `Bearer ${normalized.apiKey}` },
        });
        return openai(normalized.model || getProviderDefinition('openai')?.defaultModel || 'gpt-5-mini');
    }

    const providerDefinition = getProviderDefinition(normalized.provider);
    const baseURL = getProviderBaseURL(
        normalized.provider,
        normalized.providerOptions?.[normalized.provider]?.baseURL,
    );

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
        const definition = getProviderDefinition(config.provider);
        if (definition?.runtime && definition.runtime !== 'ai-sdk') {
            return await validateExternalProvider(config);
        }

        const model = getModel(config);
        await generateText({
            model,
            system: 'Reply OK',
            prompt: 'ping',
            // Reasoning models spend this budget on reasoning before emitting
            // any visible text; too small a value makes a valid key look dead.
            maxOutputTokens: SHORT_REPLY_MAX_OUTPUT_TOKENS,
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
