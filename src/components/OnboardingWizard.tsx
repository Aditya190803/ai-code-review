import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { fetchModels, getProviderLabels, normalizeConfig } from '../config.js';
import { DEFAULT_REVIEW_LANGUAGE, DEFAULT_UI_LANGUAGE, SUPPORTED_LANGUAGES, getLanguageLabel } from '../locales.js';
import { getProviderDefinition, getProviderEnvKey } from '../providers.js';
import { useSearch, useTerminalSize } from './TUIUtils.js';
import { SelectableList } from './SelectableList.js';
import type { AppConfig } from '../types.js';

const PROVIDERS = getProviderLabels();
const PROVIDER_VALUES = PROVIDERS.map((provider) => provider.value);
const REVIEW_TONES = [
    { label: 'Strict Production Review', value: 'strict' },
    { label: 'Balanced Team-Friendly Review', value: 'balanced' },
];

type WizardStep =
    | 'provider'
    | 'provider_key_choice'
    | 'api_key'
    | 'fetching_models'
    | 'model'
    | 'review_language'
    | 'ui_language'
    | 'review_tone'
    | 'summary';

function getStoredKey(initialConfig: AppConfig | undefined, provider: string): string {
    if (initialConfig?.provider === provider && initialConfig.apiKey) {
        return initialConfig.apiKey;
    }

    if (initialConfig?.keys?.[provider]) {
        return initialConfig.keys[provider];
    }

    return getProviderEnvKey(provider);
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
    const normalizedInitial = useMemo(() => normalizeConfig(initialConfig), [initialConfig]);
    const [step, setStep] = useState<WizardStep>('provider');
    const [provider, setProvider] = useState(normalizedInitial.provider);
    const [apiKey, setApiKey] = useState(normalizedInitial.apiKey || '');
    const [models, setModels] = useState<{ label: string; value: string }[]>([]);
    const [selectedModel, setSelectedModel] = useState(normalizedInitial.model);
    const [reviewLanguage, setReviewLanguage] = useState(normalizedInitial.reviewLanguage || DEFAULT_REVIEW_LANGUAGE);
    const [uiLanguage, setUiLanguage] = useState(normalizedInitial.uiLanguage || DEFAULT_UI_LANGUAGE);
    const [reviewTone, setReviewTone] = useState(normalizedInitial.reviewTone || 'strict');
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { rows } = useTerminalSize();
    const { isSearching, setIsSearching, searchQuery, setSearchQuery } = useSearch();

    const providerDefinition = getProviderDefinition(provider);

    const persistConfig = () => {
        onComplete(normalizeConfig({
            ...normalizedInitial,
            provider,
            apiKey: apiKey.trim(),
            model: selectedModel,
            reviewLanguage,
            uiLanguage,
            reviewTone,
            keys: {
                ...(normalizedInitial.keys || {}),
                [provider]: apiKey.trim(),
            },
        }));
    };

    const tryFetch = async (nextProvider: string, key: string) => {
        setError(null);
        setIsFetching(true);
        setStep('fetching_models');

        const providerConfig = getProviderDefinition(nextProvider);
        const fallbackModel = providerConfig?.defaultModel || 'default';
        try {
            const list = await fetchModels(nextProvider, key);
            const nextModels = list.length > 0 ? list : [{ label: `Fallback model: ${fallbackModel}`, value: fallbackModel }];
            setModels(nextModels);

            const preferredModel = nextModels.find((model) => model.value === selectedModel)?.value
                || nextModels.find((model) => model.value === normalizedInitial.model)?.value
                || nextModels[0]?.value
                || fallbackModel;

            setSelectedModel(preferredModel);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to fetch model list.';
            setError(message);
            setModels([{ label: `Fallback model: ${fallbackModel}`, value: fallbackModel }]);
            setSelectedModel(fallbackModel);
        } finally {
            setStep('model');
            setIsFetching(false);
        }
    };

    useInput((input, key) => {
        if (key.escape && onCancel && step === 'provider') {
            onCancel();
            return;
        }

        if (key.escape && step === 'model' && isSearching) {
            setIsSearching(false);
            setSearchQuery('');
        }

        if (key.leftArrow && step !== 'provider') {
            if (step === 'provider_key_choice') setStep('provider');
            else if (step === 'api_key') setStep('provider');
            else if (step === 'model') setStep('provider');
            else if (step === 'review_language') setStep('model');
            else if (step === 'ui_language') setStep('review_language');
            else if (step === 'review_tone') setStep('ui_language');
            else if (step === 'summary') setStep('review_tone');
        }

        if (input === 'q' && onCancel && step !== 'api_key' && !(step === 'model' && isSearching)) {
            onCancel();
        }
    });

    if (step === 'provider') {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>
                        AI Code Review Setup
                    </Text>
                    <Text color="gray">Choose your provider to configure models, languages, and review behavior.</Text>
                </Box>

                <Box marginTop={1} flexDirection="column">
                    <Text>Select your preferred AI Provider:</Text>
                    <SelectableList
                        items={PROVIDERS}
                        initialIndex={Math.max(PROVIDER_VALUES.indexOf(provider), 0)}
                        onSelect={(item) => {
                            const existingKey = getStoredKey(initialConfig, item.value);
                            const nextProvider = item.value;

                            setProvider(nextProvider);
                            setSelectedModel(getProviderDefinition(nextProvider)?.defaultModel || 'default');
                            if (existingKey) {
                                setApiKey(existingKey);
                                setStep('provider_key_choice');
                            } else {
                                setApiKey('');
                                setStep('api_key');
                            }
                        }}
                    />
                </Box>
            </Box>
        );
    }

    if (step === 'provider_key_choice') {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>
                        Existing API Key Detected
                    </Text>
                </Box>
                <Box marginTop={1} flexDirection="column">
                    <Text color="green">
                        A saved or environment API key for {providerDefinition?.label || provider.toUpperCase()} is available.
                    </Text>
                    <SelectableList
                        items={[
                            { label: 'Keep existing key and continue', value: 'keep' },
                            { label: 'Enter a different API key', value: 'update' },
                        ]}
                        onSelect={(item) => {
                            if (item.value === 'keep') {
                                void tryFetch(provider, apiKey);
                            } else {
                                setApiKey('');
                                setStep('api_key');
                            }
                        }}
                    />
                </Box>
            </Box>
        );
    }

    if (step === 'api_key') {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>
                        Enter API Key for {providerDefinition?.label || provider.toUpperCase()}
                    </Text>
                    <Text color="gray">Stored locally in your CLI config, never committed to the repository.</Text>
                </Box>
                <Box marginTop={1} flexDirection="row">
                    <Text color="green">API Key ❯ </Text>
                    <TextInput
                        value={apiKey}
                        onChange={setApiKey}
                        mask="*"
                        onSubmit={(value) => {
                            const trimmed = value.trim();
                            if (!trimmed) {
                                setError('API key is required.');
                                return;
                            }
                            setApiKey(trimmed);
                            void tryFetch(provider, trimmed);
                        }}
                    />
                </Box>
                {error && (
                    <Box marginTop={1}>
                        <Text color="red">{error}</Text>
                    </Box>
                )}
            </Box>
        );
    }

    if (step === 'fetching_models' || isFetching) {
        return (
            <Box flexDirection="column" padding={1}>
                <Text color="yellow">
                    Fetching available models for {providerDefinition?.label || provider.toUpperCase()}...
                </Text>
            </Box>
        );
    }

    if (step === 'model') {
        const filteredModels = models.filter((model) =>
            model.label.toLowerCase().includes(searchQuery.toLowerCase())
                || model.value.toLowerCase().includes(searchQuery.toLowerCase())
        );

        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="row" justifyContent="space-between">
                    <Text color="white" bold>
                        Select Model {isSearching && <Text color="yellow">[SEARCHING]</Text>}
                    </Text>
                    {!isSearching && (
                        <Text color="gray" dimColor>(Ctrl+F to search, mouse wheel supported)</Text>
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
                    <Text>Choose the AI model you want to use:</Text>

                {error && !isSearching && (
                    <Box marginTop={1}>
                        <Text color="red">{error}</Text>
                    </Box>
                )}
                    {filteredModels.length > 0 ? (
                        <SelectableList
                            items={filteredModels}
                            initialIndex={Math.max(filteredModels.findIndex((model) => model.value === selectedModel), 0)}
                            limit={Math.max(rows - (isSearching ? 12 : 8), 5)}
                            onSelect={(item) => {
                                setSelectedModel(item.value);
                                setStep('review_language');
                            }}
                        />
                    ) : (
                        <Box paddingY={1}>
                            <Text color="red">No models match "{searchQuery}"</Text>
                        </Box>
                    )}
                </Box>
            </Box>
        );
    }

    if (step === 'review_language') {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="magenta" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>Review Language</Text>
                    <Text color="gray">The AI findings, fixes, and summaries will default to this language.</Text>
                </Box>
                <Box marginTop={1}>
                    <SelectableList
                        items={SUPPORTED_LANGUAGES.map((language) => ({ label: language.label, value: language.value }))}
                        initialIndex={Math.max(SUPPORTED_LANGUAGES.findIndex((language) => language.value === reviewLanguage), 0)}
                        onSelect={(item) => {
                            setReviewLanguage(item.value);
                            setStep('ui_language');
                        }}
                    />
                </Box>
            </Box>
        );
    }

    if (step === 'ui_language') {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>UI Language Preference</Text>
                    <Text color="gray">This is stored now so the product can localize the interface as it expands.</Text>
                </Box>
                <Box marginTop={1}>
                    <SelectableList
                        items={SUPPORTED_LANGUAGES.map((language) => ({ label: language.label, value: language.value }))}
                        initialIndex={Math.max(SUPPORTED_LANGUAGES.findIndex((language) => language.value === uiLanguage), 0)}
                        onSelect={(item) => {
                            setUiLanguage(item.value);
                            setStep('review_tone');
                        }}
                    />
                </Box>
            </Box>
        );
    }

    if (step === 'review_tone') {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>Review Style</Text>
                    <Text color="gray">Choose how strict the AI should sound and prioritize issues.</Text>
                </Box>
                <Box marginTop={1}>
                    <SelectableList
                        items={REVIEW_TONES}
                        initialIndex={Math.max(REVIEW_TONES.findIndex((tone) => tone.value === reviewTone), 0)}
                        onSelect={(item) => {
                            setReviewTone(item.value as 'balanced' | 'strict');
                            setStep('summary');
                        }}
                    />
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" padding={1}>
            <Box borderStyle="double" borderColor="green" paddingX={2} paddingY={1} flexDirection="column">
                <Text color="greenBright" bold>Ready to Save Configuration</Text>
                <Text color="white">Provider: {providerDefinition?.label || provider}</Text>
                <Text color="white">Model: {selectedModel}</Text>
                <Text color="white">Review language: {getLanguageLabel(reviewLanguage)}</Text>
                <Text color="white">UI language: {getLanguageLabel(uiLanguage)}</Text>
                <Text color="white">Review tone: {reviewTone === 'strict' ? 'Strict production review' : 'Balanced team-friendly review'}</Text>
            </Box>
            <Box marginTop={1}>
                <SelectableList
                    items={[
                        { label: 'Save and continue', value: 'save' },
                        { label: 'Back and edit options', value: 'back' },
                    ]}
                    onSelect={(item) => {
                        if (item.value === 'save') {
                            persistConfig();
                        } else {
                            setStep('review_tone');
                        }
                    }}
                />
            </Box>
        </Box>
    );
};
