import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { fetchModels } from '../config.js';
import { useSearch } from './TUIUtils.js';
import type { AppConfig } from '../types.js';

// Reactive terminal size hook
function useTerminalSize() {
    const [size, setSize] = React.useState({
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
    });

    React.useEffect(() => {
        const onResize = () => {
            setSize({
                cols: process.stdout.columns || 80,
                rows: process.stdout.rows || 24,
            });
        };
        process.stdout.on('resize', onResize);
        return () => {
            process.stdout.off('resize', onResize);
        };
    }, []);

    return size;
}

const PROVIDERS = [
    { label: 'NVIDIA NIM', value: 'nvidia' },
    { label: 'Anthropic', value: 'anthropic' },
    { label: 'Google Gemini', value: 'google' },
    { label: 'OpenAI', value: 'openai' },
    { label: 'OpenRouter', value: 'openrouter' },
    { label: 'Groq', value: 'groq' },
    { label: 'Cerebras', value: 'cerebras' },
];

const PROVIDER_VALUES = PROVIDERS.map((p) => p.value);

function getEnvKeyForProvider(provider: string): string {
    switch (provider) {
        case 'nvidia':
            return process.env.NIM_API_KEY || process.env.NVIDIA_API_KEY || '';
        case 'openai':
            return process.env.OPENAI_API_KEY || '';
        case 'anthropic':
            return process.env.ANTHROPIC_API_KEY || '';
        case 'google':
            return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
        case 'openrouter':
            return process.env.OPENROUTER_API_KEY || '';
        case 'groq':
            return process.env.GROQ_API_KEY || '';
        case 'cerebras':
            return process.env.CEREBRAS_API_KEY || '';
        default:
            return '';
    }
}

export const OnboardingWizard = ({
    initialConfig,
    onComplete,
    onCancel,
}: {
    initialConfig?: AppConfig;
    onComplete: (config: AppConfig) => void;
    onCancel?: () => void;
}) => {
    const [step, setStep] = useState(0);
    const [provider, setProvider] = useState(initialConfig?.provider || 'nvidia');
    const [apiKey, setApiKey] = useState(initialConfig?.apiKey || '');
    const [models, setModels] = useState<{ label: string; value: string }[]>([]);
    const [isFetching, setIsFetching] = useState(false);
    const { rows } = useTerminalSize();

    // Model search state
    const { isSearching, setIsSearching, searchQuery, setSearchQuery } = useSearch();

    const tryFetch = async (prov: string, key: string) => {
        setIsFetching(true);
        setStep(3);
        const list = await fetchModels(prov, key);
        setModels(
            list.length > 0
                ? list
                : [{ label: 'Fallback model: default', value: 'default' }]
        );
        setStep(4);
        setIsFetching(false);
    };

    useInput((input, key) => {
        if (key.escape && step === 0 && onCancel) {
            onCancel();
        }
    });

    // Step 0: Select Provider
    if (step === 0) {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>
                        Welcome to AI Code Reviewer Setup
                    </Text>
                </Box>
                <Box marginTop={1} flexDirection="column">
                    <Text>Select your preferred AI Provider:</Text>
                    <SelectInput
                        items={PROVIDERS}
                        initialIndex={
                            PROVIDER_VALUES.indexOf(provider) > -1
                                ? PROVIDER_VALUES.indexOf(provider)
                                : 0
                        }
                        onSelect={(item) => {
                            setProvider(item.value);

                            let existingKey = '';
                            if (
                                initialConfig?.provider === item.value &&
                                initialConfig?.apiKey
                            ) {
                                existingKey = initialConfig.apiKey;
                            } else if (initialConfig?.keys && initialConfig.keys[item.value]) {
                                existingKey = initialConfig.keys[item.value];
                            } else {
                                existingKey = getEnvKeyForProvider(item.value);
                            }

                            if (existingKey) {
                                setApiKey(existingKey);
                                setStep(1);
                            } else {
                                setApiKey('');
                                setStep(2);
                            }
                        }}
                    />
                </Box>
            </Box>
        );
    }

    // Step 1: Existing key detected
    if (step === 1) {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>
                        Existing API Key Detected
                    </Text>
                </Box>
                <Box marginTop={1} flexDirection="column">
                    <Text color="green">
                        An API Key for {provider.toUpperCase()} was found. Do you
                        want to edit or update it?
                    </Text>
                    <SelectInput
                        items={[
                            {
                                label: 'Keep existing API key and continue',
                                value: 'keep',
                            },
                            {
                                label: 'Edit / Update new API key',
                                value: 'update',
                            },
                        ]}
                        onSelect={(item) => {
                            if (item.value === 'keep') {
                                tryFetch(provider, apiKey);
                            } else {
                                setApiKey('');
                                setStep(2);
                            }
                        }}
                    />
                </Box>
            </Box>
        );
    }

    // Step 2: Enter API key
    if (step === 2) {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>
                        Enter your API Key for {provider.toUpperCase()}
                    </Text>
                </Box>
                <Box marginTop={1} flexDirection="row">
                    <Text color="green">API Key ❯ </Text>
                    <TextInput
                        value={apiKey}
                        onChange={setApiKey}
                        mask="*"
                        onSubmit={(val) => {
                            if (val.trim()) {
                                tryFetch(provider, val.trim());
                            }
                        }}
                    />
                </Box>
            </Box>
        );
    }

    // Step 3: Fetching models
    if (step === 3 || isFetching) {
        return (
            <Box flexDirection="column" padding={1}>
                <Text color="yellow">
                    Fetching available models for {provider.toUpperCase()}...
                </Text>
            </Box>
        );
    }

    // Step 4: Select model
    if (step === 4) {
        const filteredModels = models.filter((m) =>
            m.label.toLowerCase().includes(searchQuery.toLowerCase())
        );

        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="row" justifyContent="space-between">
                    <Text color="white" bold>
                        Select Model {isSearching && <Text color="yellow"> [SEARCHING...]</Text>}
                    </Text>
                    {!isSearching && (
                        <Text color="gray" dimColor>
                            (Ctrl+F to search)
                        </Text>
                    )}
                </Box>

                {isSearching && (
                    <Box marginTop={1} borderStyle="single" borderColor="yellow" paddingX={1}>
                        <Text color="yellow">Filter: </Text>
                        <TextInput
                            value={searchQuery}
                            onChange={setSearchQuery}
                            placeholder="Type to filter models..."
                        />
                    </Box>
                )}

                <Box marginTop={1} flexDirection="column">
                    <Text>Choose the AI Model you want to use:</Text>
                    {filteredModels.length > 0 ? (
                        <SelectInput
                            items={filteredModels}
                            limit={Math.max(rows - (isSearching ? 12 : 8), 5)}
                            onSelect={(item) => {
                                onComplete({
                                    provider,
                                    apiKey: apiKey.trim(),
                                    model: item.value,
                                    keys: {
                                        ...(initialConfig?.keys || {}),
                                        [provider]: apiKey.trim(),
                                    },
                                });
                            }}
                        />
                    ) : (
                        <Box paddingY={1}>
                            <Text color="red">No models matches "{searchQuery}"</Text>
                        </Box>
                    )}
                </Box>
            </Box>
        );
    }

    return null;
};
