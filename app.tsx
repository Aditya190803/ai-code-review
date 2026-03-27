import React, { useEffect, useRef, useState } from 'react';
import { render } from 'ink';
import { loadConfig, normalizeConfig, saveConfig } from './src/config.js';
import { ReviewDashboard } from './src/components/ReviewDashboard.js';
import { OnboardingWizard } from './src/components/OnboardingWizard.js';
import { FullScreenTerminal, GlobalMouseHandler } from './src/components/TUIUtils.js';
import { scanCodebase } from './src/scanner.js';
import type { AppConfig } from './src/types.js';

// ── Headless CI Mode ──
const args = process.argv.slice(2);
const isCI = args.includes('--mode=ci');

if (isCI) {
    console.log('🚀 Starting AI Code Review in CI mode...');
    (async () => {
        try {
            const config = await loadConfig();

            if (!config.apiKey) {
                console.error('❌ Error: No API key found. Please run interactively first or set environment variables.');
                process.exit(1);
            }

            const { issues, durationSecs } = await scanCodebase(config, {
                onProgress: (msg) => { if (msg) console.log(msg); },
                onLog: (msg) => console.log(msg),
                onIssuesUpdate: () => { },
                onReviewUpdate: () => { },
            });

            console.log(`\n✅ Scan complete in ${durationSecs}s. Found ${issues.length} issues.`);

            const criticals = issues.filter(i => i.severity === 'critical');
            if (criticals.length > 0) {
                console.error(`\n❌ Found ${criticals.length} CRITICAL issues! Failing CI build.`);
                criticals.forEach((issue, idx) => {
                    console.error(`[CRITICAL ${idx + 1}] ${issue.file}:${issue.line} - ${issue.title}`);
                });
                process.exit(1);
            }

            process.exit(0);
        } catch (e) {
            console.error('❌ CI Scan failed:', e);
            process.exit(1);
        }
    })();
} else {
    // ── Interactive TUI Mode ──
    const Root = () => {
        const [config, setConfig] = useState(() => normalizeConfig());
        const [isConfiguring, setIsConfiguring] = useState(false);
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
            }
        };

        useEffect(() => {
            void refreshConfig();
            return () => {
                isMountedRef.current = false;
            };
        }, []);

        const handleCancel = () => {
            void (async () => {
                await refreshConfig();
                if (isMountedRef.current) {
                    setIsConfiguring(false);
                }
            })();
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

        if (!config.apiKey || isConfiguring) {
            return (
                <FullScreenTerminal>
                    <GlobalMouseHandler />
                    <OnboardingWizard
                        initialConfig={config}
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
                        setIsConfiguring(true);
                    }}
                />
            </FullScreenTerminal>
        );
    };

    render(<Root />, { exitOnCtrlC: false });
}
