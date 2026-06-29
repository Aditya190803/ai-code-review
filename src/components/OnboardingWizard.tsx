import React, { useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { fetchModels, getProviderLabels, normalizeConfig } from '../config.js';
import { DEFAULT_REVIEW_LANGUAGE, DEFAULT_UI_LANGUAGE, SUPPORTED_LANGUAGES, getLanguageLabel } from '../locales.js';
import { getProviderDefinition, getProviderEnvKey, providerRequiresApiKey } from '../providers.js';
import { useSearch, useTerminalSize } from './TUIUtils.js';
import { SelectableList } from './SelectableList.js';
import type { AppConfig } from '../types.js';

const AUTH_MODES = [
    { label: 'Subscription / account plan', value: 'subscription' },
    { label: 'API key / pay as you go', value: 'api' },
];
const REVIEW_TONES = [
    { label: 'Strict Production Review', value: 'strict' },
    { label: 'Balanced Team-Friendly Review', value: 'balanced' },
];

export type OnboardingFlow = 'setup' | 'settings';

type WizardStep =
    | 'settings_home'
    | 'auth_mode'
    | 'provider'
    | 'provider_key_choice'
    | 'subscription_unavailable'
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
    flow = 'setup',
}: {
    initialConfig?: AppConfig;
    onComplete: (config: AppConfig) => void;
    onCancel?: () => void;
    flow?: OnboardingFlow;
}) => {
    const normalizedInitial = useMemo(() => normalizeConfig(initialConfig), [initialConfig]);
    const [step, setStep] = useState<WizardStep>(flow === 'settings' ? 'settings_home' : 'auth_mode');
    const [activeFlow, setActiveFlow] = useState<OnboardingFlow>(flow);
    const [authMode, setAuthMode] = useState<'api' | 'subscription'>(normalizedInitial.authMode || 'subscription');
    const [provider, setProvider] = useState(normalizedInitial.provider);
    const [apiKey, setApiKey] = useState(normalizedInitial.apiKey || '');
    const [models, setModels] = useState<{ label: string; value: string }[]>([]);
    const [selectedModel, setSelectedModel] = useState(normalizedInitial.model);
    const [reviewLanguage, setReviewLanguage] = useState(normalizedInitial.reviewLanguage || DEFAULT_REVIEW_LANGUAGE);
    const [uiLanguage, setUiLanguage] = useState(normalizedInitial.uiLanguage || DEFAULT_UI_LANGUAGE);
    const [reviewTone, setReviewTone] = useState(normalizedInitial.reviewTone || 'strict');
    const [isFetching, setIsFetching] = useState(false);
    const [fetchReturnStep, setFetchReturnStep] = useState<Exclude<WizardStep, 'fetching_models'>>('api_key');
    const [error, setError] = useState<string | null>(null);
    const fetchAbortControllerRef = useRef<AbortController | null>(null);
    const { rows } = useTerminalSize();
    const { isSearching, setIsSearching, searchQuery, setSearchQuery } = useSearch();

    const providerDefinition = getProviderDefinition(provider);
    const providers = getProviderLabels().filter((candidate) => {
        const definition = getProviderDefinition(candidate.value);
        if (authMode === 'subscription') {
            return definition?.authModes?.includes('subscription') && definition.subscriptionSupported !== false;
        }

        return definition?.authModes?.includes('api') ?? true;
    });
    const providerValues = providers.map((candidate) => candidate.value);

    const buildNextConfig = (overrides: Partial<AppConfig> = {}) => normalizeConfig({
            ...normalizedInitial,
            provider,
            apiKey: providerRequiresApiKey(provider) ? apiKey.trim() : null,
            model: selectedModel,
            authMode,
            reviewLanguage,
            uiLanguage,
            reviewTone,
            keys: {
                ...(normalizedInitial.keys || {}),
                ...(providerRequiresApiKey(provider) && apiKey.trim() ? { [provider]: apiKey.trim() } : {}),
            },
            ...overrides,
        });

    const persistConfig = (overrides: Partial<AppConfig> = {}) => {
        onComplete(buildNextConfig(overrides));
    };

    const saveModel = (model: string) => {
        setSelectedModel(model);
        persistConfig({ model });
    };

    const saveReviewLanguage = (language: string) => {
        setReviewLanguage(language);
        persistConfig({ reviewLanguage: language });
    };

    const saveUiLanguage = (language: string) => {
        setUiLanguage(language);
        persistConfig({ uiLanguage: language });
    };

    const saveReviewTone = (tone: 'balanced' | 'strict') => {
        setReviewTone(tone);
        persistConfig({ reviewTone: tone });
    };

    const getPreviousStep = (currentStep: WizardStep): WizardStep => {
        if (activeFlow === 'settings' && ['auth_mode', 'review_language', 'ui_language', 'review_tone'].includes(currentStep)) {
            return 'settings_home';
        }
        if (currentStep === 'provider') return 'auth_mode';
        if (currentStep === 'provider_key_choice') return 'provider';
        if (currentStep === 'subscription_unavailable') return 'provider';
        if (currentStep === 'api_key') return 'provider';
        if (currentStep === 'model') return 'provider';
        if (currentStep === 'review_language') return 'model';
        if (currentStep === 'ui_language') return 'review_language';
        if (currentStep === 'review_tone') return 'ui_language';
        if (currentStep === 'summary') return 'review_tone';
        return activeFlow === 'settings' ? 'settings_home' : 'auth_mode';
    };

    const openCurrentModelPicker = () => {
        const currentKey = providerRequiresApiKey(provider) ? getStoredKey(normalizedInitial, provider) || apiKey : '';
        if (providerRequiresApiKey(provider) && !currentKey) {
            setStep('api_key');
            return;
        }
        setApiKey(currentKey);
        void tryFetch(provider, currentKey, 'settings_home');
    };

    const handleProviderSelect = (providerId: string) => {
        const nextProvider = providerId;
        const definition = getProviderDefinition(nextProvider);
        const existingKey = getStoredKey(initialConfig, nextProvider);

        setProvider(nextProvider);
        setSelectedModel(definition?.defaultModel || 'default');

        if (!providerRequiresApiKey(nextProvider)) {
            setApiKey('');
            void tryFetch(nextProvider, '', 'provider');
            return;
        }

        if (authMode === 'subscription' && definition?.subscriptionSupported === false) {
            setApiKey(existingKey);
            setStep('subscription_unavailable');
            return;
        }

        if (existingKey) {
            setApiKey(existingKey);
            void tryFetch(nextProvider, existingKey, 'provider');
            return;
        }

        setApiKey('');
        setStep('api_key');
    };

    const tryFetch = async (nextProvider: string, key: string, returnStep: Exclude<WizardStep, 'fetching_models'>) => {
        setError(null);
        setIsFetching(true);
        setFetchReturnStep(returnStep);
        setStep('fetching_models');

        fetchAbortControllerRef.current?.abort();
        const abortController = new AbortController();
        fetchAbortControllerRef.current = abortController;

        const providerConfig = getProviderDefinition(nextProvider);
        const fallbackModel = providerConfig?.defaultModel || 'default';
        try {
            const list = await fetchModels(nextProvider, key, abortController.signal);
            if (abortController.signal.aborted) {
                return;
            }

            const nextModels = list.length > 0 ? list : [{ label: `Fallback model: ${fallbackModel}`, value: fallbackModel }];
            setModels(nextModels);

            const preferredModel = nextModels.find((model) => model.value === selectedModel)?.value
                || nextModels.find((model) => model.value === normalizedInitial.model)?.value
                || nextModels.find((model) => model.value === fallbackModel)?.value
                || nextModels[0]?.value
                || fallbackModel;

            setSelectedModel(preferredModel);
        } catch (e) {
            if (abortController.signal.aborted || (e instanceof Error && e.name === 'AbortError')) {
                return;
            }

            const message = e instanceof Error ? e.message : 'Failed to fetch model list.';
            setError(message);
            setModels([{ label: `Fallback model: ${fallbackModel}`, value: fallbackModel }]);
            setSelectedModel(fallbackModel);
        } finally {
            if (fetchAbortControllerRef.current === abortController) {
                fetchAbortControllerRef.current = null;
            }

            if (!abortController.signal.aborted) {
                setStep('model');
            }

            setIsFetching(false);
        }
    };

    useInput((input, key) => {
        if (input === 'c' && key.ctrl && onCancel) {
            fetchAbortControllerRef.current?.abort();
            onCancel();
            return;
        }

        if (key.escape && onCancel && (step === 'auth_mode' || step === 'settings_home')) {
            onCancel();
            return;
        }

        if (key.escape && step === 'model' && isSearching) {
            setIsSearching(false);
            setSearchQuery('');
        }

        if ((key.leftArrow || key.escape) && step !== 'auth_mode' && step !== 'settings_home') {
            if (step === 'fetching_models') {
                fetchAbortControllerRef.current?.abort();
                setIsFetching(false);
                setStep(fetchReturnStep);
                return;
            }

            setStep(getPreviousStep(step));
        }

        if (input === 'q' && onCancel && step !== 'api_key' && !(step === 'model' && isSearching)) {
            onCancel();
        }
    });

    if (step === 'settings_home') {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>Settings</Text>
                    <Text color="gray">
                        Change one thing and return. Current: {providerDefinition?.label || provider} / {selectedModel}
                    </Text>
                </Box>

                <Box marginTop={1} flexDirection="column">
                    <SelectableList
                        items={[
                            { label: 'Change model only', value: 'model' },
                            { label: 'Change provider or access type', value: 'provider' },
                            { label: 'Change review language', value: 'review_language' },
                            { label: 'Change UI language', value: 'ui_language' },
                            { label: 'Change review tone', value: 'review_tone' },
                            { label: 'Run full setup', value: 'full_setup' },
                        ]}
                        onSelect={(item) => {
                            if (item.value === 'model') {
                                openCurrentModelPicker();
                            } else if (item.value === 'provider') {
                                setStep('auth_mode');
                            } else if (item.value === 'review_language') {
                                setStep('review_language');
                            } else if (item.value === 'ui_language') {
                                setStep('ui_language');
                            } else if (item.value === 'review_tone') {
                                setStep('review_tone');
                            } else {
                                setActiveFlow('setup');
                                setStep('auth_mode');
                            }
                        }}
                    />
                </Box>
            </Box>
        );
    }

    if (step === 'auth_mode') {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>
                        AI Code Review Setup
                    </Text>
                    <Text color="gray">Choose how you want this CLI to authenticate model access.</Text>
                </Box>

                <Box marginTop={1} flexDirection="column">
                    <Text>Select access type:</Text>
                    <SelectableList
                        items={AUTH_MODES}
                        initialIndex={Math.max(AUTH_MODES.findIndex((mode) => mode.value === authMode), 0)}
                        onSelect={(item) => {
                            const nextAuthMode = item.value as 'api' | 'subscription';
                            setAuthMode(nextAuthMode);
                            setError(null);
                            setStep('provider');
                        }}
                    />
                </Box>
            </Box>
        );
    }

    if (step === 'provider') {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="white" bold>
                        {authMode === 'subscription' ? 'Choose Subscription Provider' : 'Choose API Provider'}
                    </Text>
                    <Text color="gray">
                        {authMode === 'subscription'
                            ? 'Subscription mode keeps OpenCode as the default and also offers Codex or Claude account-backed access.'
                            : 'API mode shows supported API providers only.'}
                    </Text>
                </Box>

                <Box marginTop={1} flexDirection="column">
                    <Text>Select your preferred AI Provider:</Text>
                    <SelectableList
                        items={providers}
                        initialIndex={Math.max(providerValues.indexOf(provider), 0)}
                        onSelect={(item) => handleProviderSelect(item.value)}
                    />
                </Box>
            </Box>
        );
    }

    if (step === 'subscription_unavailable') {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                    <Text color="yellow" bold>
                        Subscription Access Is Not Available Here
                    </Text>
                    <Text color="gray">
                        {providerDefinition?.subscriptionNote || 'This provider requires API access for third-party CLI usage.'}
                    </Text>
                </Box>
                <Box marginTop={1} flexDirection="column">
                    <SelectableList
                        items={[
                            { label: `Use ${providerDefinition?.label || provider} API key instead`, value: 'api' },
                            { label: 'Choose another subscription provider', value: 'provider' },
                        ]}
                        onSelect={(item) => {
                            if (item.value === 'api') {
                                setAuthMode('api');
                                if (apiKey) {
                                    void tryFetch(provider, apiKey, 'subscription_unavailable');
                                } else {
                                    setStep('api_key');
                                }
                            } else {
                                setStep('provider');
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
                                void tryFetch(provider, apiKey, 'provider_key_choice');
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
                    <Text color="gray">
                        {authMode === 'subscription' && provider === 'opencode'
                            ? 'Use the key from your OpenCode Zen account. Model selection falls back to big-pickle if the model list is unavailable.'
                            : 'Stored locally in your CLI config, never committed to the repository.'}
                    </Text>
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
                            void tryFetch(provider, trimmed, 'api_key');
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
                                if (activeFlow === 'settings') {
                                    saveModel(item.value);
                                } else {
                                    setStep('review_language');
                                }
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
                            if (activeFlow === 'settings') {
                                saveReviewLanguage(item.value);
                            } else {
                                setReviewLanguage(item.value);
                                setStep('ui_language');
                            }
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
                            if (activeFlow === 'settings') {
                                saveUiLanguage(item.value);
                            } else {
                                setUiLanguage(item.value);
                                setStep('review_tone');
                            }
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
                            const nextTone = item.value as 'balanced' | 'strict';
                            if (activeFlow === 'settings') {
                                saveReviewTone(nextTone);
                            } else {
                                setReviewTone(nextTone);
                                setStep('summary');
                            }
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
                <Text color="white">Access: {authMode === 'subscription' ? 'Subscription / account plan' : 'API key / pay as you go'}</Text>
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
