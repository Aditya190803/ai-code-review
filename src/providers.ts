export interface ProviderDefinition {
    id: string;
    label: string;
    envKeys: string[];
    defaultModel: string;
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
        id: 'nvidia',
        label: 'NVIDIA NIM',
        envKeys: ['AI_CODE_REVIEW_API_KEY', 'NIM_API_KEY', 'NVIDIA_API_KEY'],
        defaultModel: 'meta/llama-3.1-70b-instruct',
        baseURL: 'https://integrate.api.nvidia.com/v1',
        modelListURL: 'https://integrate.api.nvidia.com/v1/models',
        authHeaders: bearerAuth,
        modelResponsePath: 'data',
        modelMapper: (model) => ({ label: model.id, value: model.id }),
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        envKeys: ['ANTHROPIC_API_KEY'],
        defaultModel: 'claude-sonnet-4-5',
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
        baseURL: 'https://openrouter.ai/api/v1',
        modelListURL: 'https://openrouter.ai/api/v1/models',
        authHeaders: () => ({}),
        modelResponsePath: 'data',
        modelMapper: (model) => ({ label: model.id, value: model.id }),
    },
    {
        id: 'groq',
        label: 'Groq',
        envKeys: ['GROQ_API_KEY'],
        defaultModel: 'llama-3.3-70b-versatile',
        baseURL: 'https://api.groq.com/openai/v1',
        modelListURL: 'https://api.groq.com/openai/v1/models',
        authHeaders: bearerAuth,
        modelResponsePath: 'data',
        modelMapper: (model) => ({ label: model.id, value: model.id }),
    },
    {
        id: 'cerebras',
        label: 'Cerebras',
        envKeys: ['CEREBRAS_API_KEY'],
        defaultModel: 'llama-4-scout-17b-16e-instruct',
        baseURL: 'https://api.cerebras.ai/v1',
        modelListURL: 'https://api.cerebras.ai/v1/models',
        authHeaders: bearerAuth,
        modelResponsePath: 'data',
        modelMapper: (model) => ({ label: model.id, value: model.id }),
    },
    {
        id: 'mistral',
        label: 'Mistral',
        envKeys: ['MISTRAL_API_KEY'],
        defaultModel: 'mistral-small-latest',
        baseURL: 'https://api.mistral.ai/v1',
        modelListURL: 'https://api.mistral.ai/v1/models',
        authHeaders: bearerAuth,
        modelResponsePath: 'data',
        modelMapper: (model) => ({ label: model.id, value: model.id }),
    },
    {
        id: 'together',
        label: 'Together',
        envKeys: ['TOGETHER_API_KEY'],
        defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        baseURL: 'https://api.together.xyz/v1',
        modelListURL: 'https://api.together.xyz/v1/models',
        authHeaders: bearerAuth,
        modelResponsePath: 'data',
        modelMapper: (model) => ({ label: model.id, value: model.id }),
    },
    {
        id: 'xai',
        label: 'xAI',
        envKeys: ['XAI_API_KEY'],
        defaultModel: 'grok-3-mini',
        baseURL: 'https://api.x.ai/v1',
        modelListURL: 'https://api.x.ai/v1/models',
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
