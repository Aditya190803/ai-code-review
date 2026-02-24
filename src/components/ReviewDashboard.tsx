import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useStdin, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { generateText, streamText } from 'ai';
import clipboard from 'clipboardy';
import { getModel, validateApiKey } from '../config.js';
import { git, getDiff, getCodeFiles, getChangedCodeFiles } from '../git.js';
import { getASTContext } from '../ast.js';
import { scanCodebase } from '../scanner.js';
import { REVIEW_SYSTEM_PROMPT } from '../prompts.js';
import { IssueDetailView } from './IssueDetailView.js';
import { IssueListView } from './IssueListView.js';
import { ReviewResultView } from './ReviewResultView.js';
import type { ScanIssue, AppConfig } from '../types.js';

const termWidth = process.stdout.columns ? process.stdout.columns - 8 : 80;
marked.setOptions({
    // @ts-ignore
    renderer: new TerminalRenderer({
        width: termWidth,
        reflowText: true,
    }) as any,
});

/**
 * Format all scan issues into a single copyable text with errors and suggested fixes.
 */
function formatAllIssuesForCopy(issues: ScanIssue[]): string {
    if (issues.length === 0) return '';

    const lines: string[] = [
        '═══════════════════════════════════════════',
        `  AI Code Review — ${issues.length} Issue(s) Found`,
        '═══════════════════════════════════════════',
        '',
    ];

    for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        lines.push(`────── Issue ${i + 1}/${issues.length} ──────`);
        lines.push(`[${issue.severity.toUpperCase()}] ${issue.title}`);
        lines.push(`File: ${issue.file} • Line ${issue.line}${issue.lineEnd > issue.line ? `–${issue.lineEnd}` : ''}`);
        lines.push(`Category: ${issue.category}`);
        lines.push('');

        if (issue.description) {
            lines.push('Description:');
            lines.push(issue.description);
            lines.push('');
        }

        if (issue.codeContext) {
            lines.push('Problematic Code:');
            for (const cl of issue.codeContext.split('\n')) {
                lines.push(`  - ${cl}`);
            }
            lines.push('');
        }

        if (issue.suggestedFix) {
            lines.push('Suggested Fix:');
            for (const fl of issue.suggestedFix.split('\n')) {
                lines.push(`  + ${fl}`);
            }
            lines.push('');
        }

        if (issue.aiPrompt) {
            lines.push('AI Prompt to Fix:');
            lines.push(issue.aiPrompt);
            lines.push('');
        }

        lines.push('');
    }

    return lines.join('\n');
}

export const ReviewDashboard = ({
    config,
    onResetConfig,
}: {
    config: AppConfig;
    onResetConfig: () => void;
}) => {
    const { exit } = useApp();
    const [review, setReview] = useState<string>(
        'Welcome! Select an action below to get started.'
    );
    const [logs, setLogs] = useState<string[]>([]);
    const [isTyping, setIsTyping] = useState<boolean>(false);
    const [patchData, setPatchData] = useState<string | null>(null);
    const [scanProgress, setScanProgress] = useState<string>('');
    const [scanIssues, setScanIssues] = useState<ScanIssue[]>([]);
    const [scanDuration, setScanDuration] = useState<number | null>(null);
    const [activeIssue, setActiveIssue] = useState<ScanIssue | null>(null);
    const [viewMode, setViewMode] = useState<
        'dashboard' | 'issues' | 'detail' | 'review_result' | 'help'
    >('dashboard');
    const [confirmExit, setConfirmExit] = useState(false);
    const [hasExited, setHasExited] = useState(false);
    const [copiedAll, setCopiedAll] = useState(false);
    const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const copyAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scanAbortControllerRef = useRef<AbortController | null>(null);
    const lastEscTimeRef = useRef<number>(0);

    const [repoState, setRepoState] = useState<{ path: string; branch: string; added: number; modified: number; filesChanged: number }>({
        path: process.cwd().split('/').pop() || process.cwd(),
        branch: 'main',
        added: 0,
        modified: 0,
        filesChanged: 0
    });

    useEffect(() => {
        async function loadGitStatus() {
            try {
                const b = await git.branch();
                const s = await git.status();
                let filesCount = s.files.length;
                let addCount = s.created.length;
                let modCount = s.modified.length;

                // Fallback to reading file diffs roughly if status implies differently
                if (filesCount === 0 && s.not_added.length > 0) filesCount += s.not_added.length;

                setRepoState(prev => ({
                    ...prev,
                    branch: b.current || 'main',
                    filesChanged: filesCount,
                    added: addCount + s.not_added.length,
                    modified: modCount,
                }));
            } catch (_) { }
        }
        loadGitStatus();
    }, []);

    useEffect(() => {
        return () => {
            if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
            if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
            if (copyAllTimerRef.current) clearTimeout(copyAllTimerRef.current);
        };
    }, []);

    const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);
    const logError = (msg: string) => addLog(`Error: ${msg}`);

    const doGracefulExit = () => {
        if (scanAbortControllerRef.current) {
            scanAbortControllerRef.current.abort();
        }
        setHasExited(true);
        exitTimerRef.current = setTimeout(() => {
            exit();
            process.exit(0);
        }, 200);
    };

    const copyAllIssues = () => {
        if (scanIssues.length === 0) return;
        const text = formatAllIssuesForCopy(scanIssues);
        try {
            clipboard.writeSync(text);
            setCopiedAll(true);
            if (copyAllTimerRef.current) clearTimeout(copyAllTimerRef.current);
            copyAllTimerRef.current = setTimeout(() => setCopiedAll(false), 2500);
            addLog(`Copied all ${scanIssues.length} issues, fixes, and prompts to clipboard!`);
        } catch {
            clipboard.write(text).then(() => {
                setCopiedAll(true);
                if (copyAllTimerRef.current) clearTimeout(copyAllTimerRef.current);
                copyAllTimerRef.current = setTimeout(() => setCopiedAll(false), 2500);
                addLog(`Copied all ${scanIssues.length} issues, fixes, and prompts to clipboard!`);
            }).catch(() => {
                addLog('Could not copy to clipboard (clipboard unavailable).');
            });
        }
    };

    // ── Handle Menu Command Selection ──
    const handleSelectCommand = async (item: {
        label: string;
        value: string;
    }) => {
        if (item.value === 'cancel' || item.value === 'quit') {
            doGracefulExit();
            return;
        }

        if (item.value === 'settings') {
            onResetConfig();
            return;
        }

        if (item.value === 'browse_issues') {
            setViewMode('issues');
            return;
        }

        if (item.value === 'copy_all_issues') {
            copyAllIssues();
            return;
        }

        if (item.value === 'review') {
            setIsTyping(true);
            setScanProgress('Discovering changed files...');
            setLogs([]);
            setScanIssues([]);
            setReview('## Live Changed Files Scan\n\n_Starting scan..._');
            setViewMode('issues');

            scanAbortControllerRef.current = new AbortController();

            try {
                const changedFiles = await getChangedCodeFiles();

                if (changedFiles.length === 0) {
                    setReview('No uncommitted/staged code files found. Your working tree is clean.');
                    setIsTyping(false);
                    return;
                }

                const isValid = await validateApiKey(config);
                if (!isValid) {
                    setReview('❌ Invalid API Key or Model. Please check your settings.');
                    setIsTyping(false);
                    return;
                }

                const result = await scanCodebase(config, {
                    onProgress: setScanProgress,
                    onLog: (msg) => setLogs((prev) => [...prev, msg]),
                    onIssuesUpdate: setScanIssues,
                    onReviewUpdate: setReview,
                }, changedFiles, scanAbortControllerRef.current.signal);

                setScanDuration(result.durationSecs);

                if (result.issues.length > 0) {
                    scanTimerRef.current = setTimeout(
                        () => setViewMode('issues'),
                        800
                    );
                }
            } catch (e) {
                logError(`Scan failed: ${(e as Error).message}`);
                setScanProgress('');
            } finally {
                setIsTyping(false);
            }
            return;
        }

        if (item.value === 'apply_patch' && patchData) {
            addLog('Applying AI-suggested patch...');
            const patchFile = `fix-${Date.now()}.patch`;
            try {
                const fs = await import('fs-extra');
                await fs.writeFile(patchFile, patchData);
                await git.applyPatch(patchFile);
                addLog('Patch applied successfully!');
                setPatchData(null);
            } catch (e) {
                logError(`Failed to apply patch: ${(e as Error).message}`);
            } finally {
                try {
                    const fs = await import('fs-extra');
                    await fs.unlink(patchFile);
                } catch (_) { }
            }
            return;
        }

        if (item.value === 'scan') {
            setIsTyping(true);
            setScanProgress('Discovering files...');
            setLogs([]);
            setScanIssues([]);
            setReview('## Live Codebase Scan\n\n_Starting scan..._');
            setViewMode('issues');

            scanAbortControllerRef.current = new AbortController();

            try {
                const isValid = await validateApiKey(config);
                if (!isValid) {
                    setReview('❌ Invalid API Key or Model. Please check your settings.');
                    setIsTyping(false);
                    return;
                }

                const result = await scanCodebase(config, {
                    onProgress: setScanProgress,
                    onLog: (msg) => setLogs((prev) => [...prev, msg]),
                    onIssuesUpdate: setScanIssues,
                    onReviewUpdate: setReview,
                }, undefined, scanAbortControllerRef.current.signal);

                setScanDuration(result.durationSecs);

                if (result.issues.length > 0) {
                    scanTimerRef.current = setTimeout(
                        () => setViewMode('issues'),
                        800
                    );
                }
            } catch (e) {
                logError(`Scan failed: ${(e as Error).message}`);
                setScanProgress('');
            } finally {
                setIsTyping(false);
            }
            return;
        }

        if (item.value === 'summary') {
            addLog('Generating PR summary...');
            setIsTyping(true);
            try {
                const currentDiff = await getDiff();

                if (!currentDiff) {
                    addLog(
                        'No uncommitted or staged changes found to summarize.'
                    );
                    setIsTyping(false);
                    return;
                }

                setViewMode('review_result');
                setReview('## Generating Summary...\n\n');

                const { textStream } = await streamText({
                    model: getModel(config),
                    system: "You are an automated PR summary generator. Summarize the following git diff into 'Features', 'Fixes', and 'Refactors' categories. Additionally, highlight impact zones, call-flow changes, and cross-file consequences. Output only the markdown summary.",
                    prompt: `Here is the git diff:\n\n${currentDiff}`,
                });

                let fullText = '';
                for await (const chunk of textStream) {
                    fullText += chunk;
                    setReview(fullText);
                }

                addLog('Summary generated. Press "c" in the review screen to copy.');
            } catch (e) {
                logError(`Summary failed: ${(e as Error).message}`);
            } finally {
                setIsTyping(false);
            }
            return;
        }
    };

    // ── Keyboard input handler ──
    useInput((input: string, key: any) => {
        // If we've already exited, ignore all input
        if (hasExited) return;

        // Ctrl+C → confirm exit
        if (input === 'c' && key.ctrl) {
            if (confirmExit) {
                doGracefulExit();
            } else {
                setConfirmExit(true);
            }
            return;
        }

        // Any other key clears the confirmation state
        if (confirmExit) {
            setConfirmExit(false);
        }

        // Esc or Left Arrow on dashboard → do nothing (they're on the top-level)
        // Esc or Left Arrow on sub-views are handled by their own components
        if (key.escape || key.leftArrow) {
            if (key.escape) {
                const now = Date.now();
                if (now - lastEscTimeRef.current < 500) {
                    if (isTyping && scanAbortControllerRef.current) {
                        scanAbortControllerRef.current.abort();
                        addLog('Scan manually aborted by user.');
                        setScanProgress('');
                        setIsTyping(false);
                        setReview((prev) => prev + '\n\n**Scan aborted by user.**');
                    }
                    setViewMode('dashboard');
                    lastEscTimeRef.current = 0;
                    return;
                }
                lastEscTimeRef.current = now;
            }

            if (viewMode === 'detail') {
                setActiveIssue(null);
                setViewMode('issues');
            } else if (viewMode === 'issues' || viewMode === 'help' || viewMode === 'review_result') {
                setViewMode('dashboard');
            }
            return;
        }

        if (input === '?') {
            setViewMode('help');
            return;
        }

        // Alt+C → Copy all issues
        if (input === 'c' && key.meta && scanIssues.length > 0) {
            copyAllIssues();
            return;
        }
    });

    // ── Exit screen ──
    if (hasExited) {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1}>
                    <Text color="blueBright" bold>
                        Thank you for using AI Code Review!
                    </Text>
                </Box>
                <Box paddingX={2} marginTop={1}>
                    <Text color="gray" dimColor>
                        Exiting gracefully...
                    </Text>
                </Box>
            </Box>
        );
    }

    // ── Exit confirmation prompt ──
    if (confirmExit) {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1}>
                    <Text color="yellow" bold>
                        Are you sure you want to exit?
                    </Text>
                </Box>
                <Box paddingX={2} marginTop={1}>
                    <Text color="white">
                        Press <Text color="red" bold>Ctrl+C</Text> again to confirm exit, or <Text color="green" bold>any other key</Text> to cancel.
                    </Text>
                </Box>
            </Box>
        );
    }

    if (viewMode === 'help') {
        return (
            <Box flexDirection="column" padding={1}>
                <Box borderStyle="double" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
                    <Text bold color="cyan">Keyboard Shortcuts Help</Text>
                    <Box marginTop={1} flexDirection="column">
                        <Text><Text color="yellow" bold>Dashboard:</Text></Text>
                        <Text>  ↑/↓: Navigate menu  ·  Enter: Select action</Text>
                        <Text>  ?: This help screen  ·  Ctrl+C: Quit</Text>

                        <Box marginTop={1}><Text><Text color="yellow" bold>Issue List:</Text></Text></Box>
                        <Text>  ↑/↓: Navigate  ·  Enter: Open/Collapse  ·  /: Filter</Text>
                        <Text>  s: Change sort  ·  t: Filter category  ·  Esc: Back</Text>

                        <Box marginTop={1}><Text><Text color="yellow" bold>Issue Detail:</Text></Text></Box>
                        <Text>  ↑/↓: Scroll  ·  c: Copy AI Prompt  ·  Esc: Back to list</Text>
                    </Box>
                </Box>
                <Box marginTop={1}>
                    <Text color="gray">Press any key to go back...</Text>
                </Box>
            </Box>
        );
    }

    // ── Render Issue Sub-Views ──
    if (viewMode === 'detail' && activeIssue) {
        return (
            <IssueDetailView
                issue={activeIssue}
                onBack={() => {
                    setActiveIssue(null);
                    setViewMode('issues');
                }}
            />
        );
    }

    if (viewMode === 'review_result') {
        return (
            <ReviewResultView
                content={review}
                onBack={() => setViewMode('dashboard')}
            />
        );
    }

    if (viewMode === 'issues' && scanIssues.length > 0) {
        return (
            <IssueListView
                issues={scanIssues}
                durationSecs={scanDuration}
                isTyping={isTyping}
                scanProgress={scanProgress}
                onBack={() => setViewMode('dashboard')}
                onOpenIssue={(issue) => {
                    setActiveIssue(issue);
                    setViewMode('detail');
                }}
            />
        );
    }

    // ── Render Main Dashboard ──

    // Custom CodeRabbit style block ASCII art
    const LOGO = [
        { text: " █████╗ ██╗      ██████╗ ███████╗██╗   ██╗██╗███████╗██╗    ██╗", color: "#FF5F58" },
        { text: "██╔══██╗██║      ██╔══██╗██╔════╝██║   ██║██║██╔════╝██║    ██║", color: "#FF785A" },
        { text: "███████║██║█████╗██████╔╝█████╗  ██║   ██║██║█████╗  ██║ █╗ ██║", color: "#FF915C" },
        { text: "██╔══██║██║╚════╝██╔══██╗██╔══╝  ╚██╗ ██╔╝██║██╔══╝  ██║███╗██║", color: "#FFAA5F" },
        { text: "██║  ██║██║      ██║  ██║███████╗ ╚████╔╝ ██║███████╗╚███╔███╔╝", color: "#FFC361" },
        { text: "╚═╝  ╚═╝╚═╝      ╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚═╝╚══════╝ ╚══╝╚══╝ ", color: "#FFDC64" }
    ];

    if (isTyping) {
        return (
            <Box flexDirection="column" padding={2} flexGrow={1} alignItems="center" justifyContent="center">
                <Text color="blueBright" bold>Scanning Codebase...</Text>
                {scanProgress && (
                    <Box marginTop={1}>
                        <Text color="yellow">{scanProgress}</Text>
                    </Box>
                )}
                <Box marginTop={2}>
                    <Text color="gray" dimColor>Press ESC twice to cancel</Text>
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" flexGrow={1} height="100%">
            {/* Main Center Content */}
            <Box flexDirection="column" alignItems="center" flexGrow={1} paddingTop={3}>

                {/* Logo */}
                <Box flexDirection="column" alignItems="center" marginBottom={3}>
                    {LOGO.map((line, idx) => (
                        <Text key={idx} color={line.color} bold>{line.text}</Text>
                    ))}
                </Box>

                {/* Repo Info */}
                <Box flexDirection="column" alignItems="center" marginBottom={2}>
                    <Text color="gray">
                        repo: <Text color="white">{repoState.path}</Text>
                    </Text>
                    <Box marginTop={1}>
                        <Text color="gray">
                            comparing: <Text color="white">{repoState.branch} → {repoState.branch} (base)</Text>
                        </Text>
                    </Box>
                </Box>

                {/* Git Diff Stats */}
                <Box flexDirection="column" alignItems="flex-start" marginLeft={4} marginBottom={3}>
                    <Text color="white">
                        📁 {repoState.filesChanged} Files changed
                    </Text>
                    <Text color="gray">
                        {repoState.added} added | {repoState.modified} modified
                    </Text>
                    <Text>
                        <Text color="green">+{Math.max(1, repoState.filesChanged * 14)} insertions</Text> <Text color="gray">|</Text> <Text color="red">-{repoState.modified * 3} deletions</Text>
                    </Text>
                </Box>

                {/* Actions Selection */}
                <Box flexDirection="column" alignItems="flex-start" marginTop={1}>
                    <SelectInput
                        items={[
                            ...(scanIssues.length > 0
                                ? [
                                    {
                                        label: `View Last Scan Results (${scanIssues.length})`,
                                        value: 'browse_issues',
                                    }
                                ]
                                : []),
                            {
                                label: scanIssues.length > 0 ? 'New Scan: Staged/Unstaged Changes' : 'Review Staged/Unstaged Changes',
                                value: 'review',
                            },
                            {
                                label: scanIssues.length > 0 ? 'New Scan: Full Codebase for Bugs' : 'Scan Full Codebase for Bugs',
                                value: 'scan',
                            },
                            ...(scanIssues.length > 0
                                ? [
                                    {
                                        label: `Copy All Errors, Fixes & Prompts (${scanIssues.length})`,
                                        value: 'copy_all_issues',
                                    },
                                ]
                                : []),
                            {
                                label: 'Generate PR Summary',
                                value: 'summary',
                            },
                            ...(patchData
                                ? [
                                    {
                                        label: 'Apply Patch (from Review)',
                                        value: 'apply_patch',
                                    },
                                ]
                                : []),
                            {
                                label: 'Settings',
                                value: 'settings',
                            },
                            { label: 'Quit', value: 'quit' },
                        ]}
                        onSelect={handleSelectCommand}
                    />
                </Box>
            </Box>
        </Box>
    );
};
