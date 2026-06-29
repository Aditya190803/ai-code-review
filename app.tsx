import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, render, useApp } from 'ink';
import { loadConfig, saveConfig } from './src/config.js';
import { providerRequiresApiKey } from './src/providers.js';
import { ReviewDashboard } from './src/components/ReviewDashboard.js';
import { OnboardingWizard, type OnboardingFlow } from './src/components/OnboardingWizard.js';
import { FullScreenTerminal, GlobalMouseHandler } from './src/components/TUIUtils.js';
import type { AppConfig } from './src/types.js';
import { parseCliArgs, renderHelp, runAuthCommand, runDoctorCommand, runFeedbackCommand, runInitCommand, runMcpCommand, runReviewCommand } from './src/cli.js';

const args = process.argv.slice(2);
const isCI = args.includes('--mode=ci');
const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const parsedCli = parseCliArgs(isCI ? ['review', '--all'] : args);

// Flags that indicate the user wants non-interactive execution
const hasMeaningfulFlags = args.some(a =>
    a.startsWith('--') && !['--interactive', '--mode=tui', '--mode=ci'].includes(a.split('=')[0])
);

const shouldLaunchInteractive =
    isTTY &&
    !hasMeaningfulFlags &&
    ((!isCI && args.length === 0) ||
    parsedCli.command === 'interactive' ||
    parsedCli.interactive ||
    args.includes('--mode=tui'));

const Root = ({ forceConfigure = false }: { forceConfigure?: boolean }) => {
        const { exit } = useApp();
        const [config, setConfig] = useState<AppConfig | null>(null);
        const [isConfigLoaded, setIsConfigLoaded] = useState(false);
        const [isConfiguring, setIsConfiguring] = useState(forceConfigure);
        const [configFlow, setConfigFlow] = useState<OnboardingFlow>(forceConfigure ? 'setup' : 'settings');
        const isMountedRef = useRef(true);

        const refreshConfig = async () => {
            try {
                const nextConfig = await loadConfig();
                if (isMountedRef.current) {
                    setConfig(nextConfig);
                }
            } catch (error) {
                if (isMountedRef.current) {
                    console.error('❌ Failed to load configuration:', error);
                }
            } finally {
                if (isMountedRef.current) {
                    setIsConfigLoaded(true);
                }
            }
        };

        useEffect(() => {
            void refreshConfig();
            return () => {
                isMountedRef.current = false;
            };
        }, []);

        const handleCancel = () => {
            if (config && (!providerRequiresApiKey(config.provider) || config.apiKey)) {
                void (async () => {
                    await refreshConfig();
                    if (isMountedRef.current) {
                        setIsConfiguring(false);
                    }
                })();
                return;
            }

            exit();
            process.exit(0);
        };

        const handleComplete = (newConfig: AppConfig) => {
            void (async () => {
                await saveConfig(newConfig);
                if (!isMountedRef.current) {
                    return;
                }
                setConfig(newConfig);
                setIsConfiguring(false);
            })();
        };

        if (!isConfigLoaded) {
            return (
                <FullScreenTerminal>
                    <GlobalMouseHandler />
                    <Box flexDirection="column" padding={1}>
                        <Text color="blue" bold>
                            Loading AI Code Review configuration...
                        </Text>
                    </Box>
                </FullScreenTerminal>
            );
        }

        if (!config || (providerRequiresApiKey(config.provider) && !config.apiKey) || isConfiguring) {
            return (
                <FullScreenTerminal>
                    <GlobalMouseHandler />
                    <OnboardingWizard
                        initialConfig={config || undefined}
                        flow={!config || (providerRequiresApiKey(config.provider) && !config.apiKey) ? 'setup' : configFlow}
                        onCancel={handleCancel}
                        onComplete={handleComplete}
                    />
                </FullScreenTerminal>
            );
        }

        return (
            <FullScreenTerminal>
                <GlobalMouseHandler />
                <ReviewDashboard
                    config={config}
                    onResetConfig={() => {
                        setConfigFlow('settings');
                        setIsConfiguring(true);
                    }}
                />
            </FullScreenTerminal>
        );
};

async function main() {
    if (shouldLaunchInteractive) {
        render(<Root />, { exitOnCtrlC: false });
        return;
    }

    try {
        if (parsedCli.command === 'help' || args.includes('--help') || args.includes('-h')) {
            console.log(renderHelp());
            return;
        }

        if (parsedCli.command === 'doctor') {
            process.exit(await runDoctorCommand());
        }

        if (parsedCli.command === 'init') {
            process.exit(await runInitCommand());
        }

        if (parsedCli.command === 'auth') {
            process.exit(await runAuthCommand(parsedCli));
        }

        if (parsedCli.command === 'feedback') {
            process.exit(await runFeedbackCommand(parsedCli));
        }

        if (parsedCli.command === 'mcp') {
            process.exit(await runMcpCommand());
        }

        const exitCode = await runReviewCommand(parsedCli);
        process.exit(exitCode);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Raw mode') || msg.includes('stdin')) {
            console.error('This tool requires an interactive terminal for the setup wizard.');
            console.error('Run with flags (e.g., `ai-review review --type all`) for non-interactive mode,');
            console.error('or set the API key via environment variable (e.g., OPENCODE_API_KEY=...).');
        } else {
            console.error(msg);
        }
        process.exit(1);
    }
}

void main();
