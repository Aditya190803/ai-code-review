import React, { useState } from 'react';
import { render } from 'ink';
import { loadConfig, saveConfig } from './src/config.js';
import { ReviewDashboard } from './src/components/ReviewDashboard.js';
import { OnboardingWizard } from './src/components/OnboardingWizard.js';
import { GlobalMouseHandler } from './src/components/TUIUtils.js';
import { scanCodebase } from './src/scanner.js';

// ── Headless CI Mode ──
const args = process.argv.slice(2);
const isCI = args.includes('--mode=ci');

if (isCI) {
    console.log('🚀 Starting AI Code Review in CI mode...');
    const config = loadConfig();

    if (!config.apiKey) {
        console.error('❌ Error: No API key found. Please run interactively first or set environment variables.');
        process.exit(1);
    }

    (async () => {
        try {
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
        const [config, setConfig] = useState(() => loadConfig());

        if (!config.apiKey) {
            return (
                <>
                    <GlobalMouseHandler />
                    <OnboardingWizard
                        initialConfig={config}
                        onCancel={() => {
                            setConfig(loadConfig());
                        }}
                        onComplete={(newConfig) => {
                            saveConfig(newConfig);
                            setConfig(newConfig);
                        }}
                    />
                </>
            );
        }

        return (
            <>
                <GlobalMouseHandler />
                <ReviewDashboard
                    config={config}
                    onResetConfig={() => {
                        setConfig({ ...config, apiKey: null });
                    }}
                />
            </>
        );
    };

    render(<Root />, { exitOnCtrlC: false });
}
