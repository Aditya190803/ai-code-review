export interface ProviderDefinition {
    id: string;
    label: string;
    envKeys: string[];
    defaultModel: string;
    authModes?: Array<'api' | 'subscription'>;
    runtime?: 'ai-sdk' | 'codex-cli' | 'claude-agent-sdk';
    requiresApiKey?: boolean;
    subscriptionSupported?: boolean;
    subscriptionNote?: string;
    staticModels?: { label: string; value: string }[];
    baseURL?: string;
    modelListURL?: string;
    authHeaders?: (apiKey: string) => Record<string, string>;
    modelResponsePath: 'data' | 'models';
    modelMapper: (model: Record<string, any>) => { label: string; value: string } | null;
}

const bearerAuth = (apiKey: string): Record<string, string> => ({
    Authorization: `Bearer ${apiKey}`,
});

export const PROVIDERS: ProviderDefinition[] = [
    {
        id: 'opencode',
        label: 'OpenCode',
        envKeys: ['OPENCODE_API_KEY', 'AI_CODE_REVIEW_API_KEY'],
        defaultModel: 'big-pickle',
        authModes: ['api', 'subscription'],
        runtime: 'ai-sdk',
        requiresApiKey: true,
        subscriptionSupported: true,
        subscriptionNote: 'Use your OpenCode Zen account key. OpenCode exposes subscription/gateway access through its OpenAI-compatible Zen API.',
        staticModels: [{ label: 'big-pickle', value: 'big-pickle' }],
        baseURL: 'https://opencode.ai/zen/v1',
        modelListURL: 'https://opencode.ai/zen/v1/models',
        authHeaders: bearerAuth,
        modelResponsePath: 'data',
        modelMapper: (model) => ({ label: model.id, value: model.id }),
    },
    {
        id: 'codex',
        label: 'OpenAI Codex (ChatGPT plan)',
        envKeys: [],
        defaultModel: 'codex-default',
        authModes: ['subscription'],
        runtime: 'codex-cli',
        requiresApiKey: false,
        subscriptionSupported: true,
        subscriptionNote: 'Uses your official Codex CLI ChatGPT login. Run `codex login` if this provider is not authenticated.',
        staticModels: [{ label: 'Codex CLI default model', value: 'codex-default' }],
        modelResponsePath: 'data',
        modelMapper: () => null,
    },
    {
        id: 'claude-code',
        label: 'Claude Code (Agent SDK)',
        envKeys: [],
        defaultModel: 'claude-default',
        authModes: ['subscription'],
        runtime: 'claude-agent-sdk',
        requiresApiKey: false,
        subscriptionSupported: true,
        subscriptionNote: 'Uses the official Claude Agent SDK and your Claude Code account authentication.',
        staticModels: [{ label: 'Claude Agent SDK default model', value: 'claude-default' }],
        modelResponsePath: 'data',
        modelMapper: () => null,
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        envKeys: ['ANTHROPIC_API_KEY'],
        defaultModel: 'claude-sonnet-4-5',
        authModes: ['api'],
        runtime: 'ai-sdk',
        requiresApiKey: true,
        subscriptionSupported: false,
        subscriptionNote: 'For Claude subscription/account access, choose Claude Code (Agent SDK). Anthropic here is the API key provider.',
        modelListURL: 'https://api.anthropic.com/v1/models',
        authHeaders: (apiKey: string) => ({
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        }),
        modelResponsePath: 'data',
        modelMapper: (model) => ({
            label: model.display_name || model.id,
            value: model.id,
        }),
    },
    {
        id: 'google',
        label: 'Google Gemini',
        envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
        defaultModel: 'gemini-2.5-flash',
        runtime: 'ai-sdk',
        requiresApiKey: true,
        modelListURL: 'https://generativelanguage.googleapis.com/v1beta/models',
        authHeaders: (apiKey: string) => ({ 'x-goog-api-key': apiKey }),
        modelResponsePath: 'models',
        modelMapper: (model) => {
            if (!String(model.name || '').includes('gemini')) return null;
            return {
                label: model.displayName || model.name,
                value: String(model.name || '').replace('models/', ''),
            };
        },
    },
    {
        id: 'openai',
        label: 'OpenAI',
        envKeys: ['OPENAI_API_KEY'],
        defaultModel: 'gpt-5-mini',
        authModes: ['api'],
        runtime: 'ai-sdk',
        requiresApiKey: true,
        subscriptionSupported: false,
        subscriptionNote: 'For ChatGPT Plus/Pro Codex access, choose OpenAI Codex (ChatGPT plan). OpenAI here is the API key provider.',
        baseURL: 'https://api.openai.com/v1',
        modelListURL: 'https://api.openai.com/v1/models',
        authHeaders: bearerAuth,
        modelResponsePath: 'data',
        modelMapper: (model) => (
            String(model.id || '').includes('gpt')
                ? { label: model.id, value: model.id }
                : null
        ),
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        envKeys: ['OPENROUTER_API_KEY'],
        defaultModel: 'openai/gpt-4.1-mini',
        runtime: 'ai-sdk',
        requiresApiKey: true,
        baseURL: 'https://openrouter.ai/api/v1',
        modelListURL: 'https://openrouter.ai/api/v1/models',
        authHeaders: () => ({}),
        modelResponsePath: 'data',
        modelMapper: (model) => ({ label: model.id, value: model.id }),
    },
    {
        id: 'cerebras',
        label: 'Cerebras',
        envKeys: ['CEREBRAS_API_KEY'],
        defaultModel: 'llama-4-scout-17b-16e-instruct',
        runtime: 'ai-sdk',
        requiresApiKey: true,
        baseURL: 'https://api.cerebras.ai/v1',
        modelListURL: 'https://api.cerebras.ai/v1/models',
        authHeaders: bearerAuth,
        modelResponsePath: 'data',
        modelMapper: (model) => ({ label: model.id, value: model.id }),
    },
];

export const PROVIDER_MAP = Object.fromEntries(
    PROVIDERS.map((provider) => [provider.id, provider])
) as Record<string, ProviderDefinition>;

export function getProviderDefinition(providerId: string): ProviderDefinition | undefined {
    return PROVIDER_MAP[providerId];
}

export function getProviderEnvKey(providerId: string): string {
    const provider = getProviderDefinition(providerId);
    if (!provider) return '';

    if (!provider || !provider.envKeys) return '';
    for (const envKey of provider.envKeys) {
        const value = process.env[envKey] as string | undefined;
        if (value) return value;
    }

    return '';
}

export function providerRequiresApiKey(providerId: string): boolean {
    return getProviderDefinition(providerId)?.requiresApiKey !== false;
}
