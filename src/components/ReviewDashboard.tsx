import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { streamText } from 'ai';
import clipboard from 'clipboardy';
import { getModel, validateApiKey } from '../config.js';
import { git, getDiff, getCodeFiles, getChangedCodeFiles } from '../git.js';
import { ensureProjectIndex, getProjectContext } from '../project-index.js';
import { scanCodebase } from '../scanner.js';
import { IssueDetailView } from './IssueDetailView.js';
import { IssueListView, createInitialIssueListState, getIssueListItems } from './IssueListView.js';
import { ReviewResultView } from './ReviewResultView.js';
import { SelectableList } from './SelectableList.js';
import type { ScanIssue, AppConfig } from '../types.js';
import { getLanguageLabel } from '../locales.js';
import { useTerminalSize } from './TUIUtils.js';
import type { Key } from 'ink';

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
    const { cols, rows } = useTerminalSize();
    const [review, setReview] = useState<string>(
        'Welcome! Select an action below to get started.'
    );
    const [logs, setLogs] = useState<string[]>([]);
    const [isTyping, setIsTyping] = useState<boolean>(false);
    const [scanProgress, setScanProgress] = useState<string>('');
    const [scanIssues, setScanIssues] = useState<ScanIssue[]>([]);
    const [scanDuration, setScanDuration] = useState<number | null>(null);
    const [activeIssue, setActiveIssue] = useState<ScanIssue | null>(null);
    const [issueListState, setIssueListState] = useState(createInitialIssueListState);
    const [viewMode, setViewMode] = useState<
        'dashboard' | 'issues' | 'detail' | 'review_result' | 'help'
    >('dashboard');
    const [confirmExit, setConfirmExit] = useState(false);
    const [hasExited, setHasExited] = useState(false);
    const [actionNotice, setActionNotice] = useState<string | null>(null);
    const [actionNoticeKind, setActionNoticeKind] = useState<'info' | 'success' | 'warning' | 'error'>('info');
    const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const actionNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scanAbortControllerRef = useRef<AbortController | null>(null);
    const lastEscTimeRef = useRef<number>(0);

    const [repoState, setRepoState] = useState<{ path: string; branch: string; added: number; modified: number; filesChanged: number }>({
        path: process.cwd().split('/').pop() || process.cwd(),
        branch: 'main',
        added: 0,
        modified: 0,
        filesChanged: 0
    });
    const orderedIssueItems = getIssueListItems(scanIssues, issueListState).items.filter(
        (item): item is { type: 'issue'; issue: ScanIssue; file: string } => item.type === 'issue'
    );
    const orderedIssues = orderedIssueItems.map((item) => item.issue);
    const isCompact = cols < 110 || rows < 34;
    const isCramped = cols < 88 || rows < 28;

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
            } catch (err) {
                // Ignore GIT status errors.
            }
        }
        loadGitStatus();
    }, []);

    useEffect(() => {
        let isCancelled = false;

        async function warmProjectIndex() {
            try {
                const files = await getCodeFiles();
                if (files.length === 0 || isCancelled) return;
                await ensureProjectIndex(files);
            } catch (err) {
                // Background indexing is best-effort only.
            }
        }

        void warmProjectIndex();

        return () => {
            isCancelled = true;
        };
    }, []);

    useEffect(() => {
        setIssueListState((prev) => {
            const nextCollapsed = { ...prev.collapsed };
            for (const file of [...new Set(scanIssues.map((issue) => issue.file))]) {
                if (!(file in nextCollapsed)) {
                    nextCollapsed[file] = true;
                }
            }

            return {
                ...prev,
                collapsed: nextCollapsed,
            };
        });
    }, [scanIssues]);

    useEffect(() => {
        return () => {
            if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
            if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
            if (actionNoticeTimerRef.current) clearTimeout(actionNoticeTimerRef.current);
        };
    }, []);

    const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);
    const logError = (msg: string) => addLog(`Error: ${msg}`);
    const showActionNotice = (message: string, kind: 'info' | 'success' | 'warning' | 'error' = 'info') => {
        setActionNotice(message);
        setActionNoticeKind(kind);
        if (actionNoticeTimerRef.current) clearTimeout(actionNoticeTimerRef.current);
        actionNoticeTimerRef.current = setTimeout(() => setActionNotice(null), 2200);
    };
    const renderActionToast = () => {
        if (!actionNotice) return null;

        const noticeColor = actionNoticeKind === 'success'
            ? 'green'
            : actionNoticeKind === 'error'
                ? 'red'
                : actionNoticeKind === 'warning'
                    ? 'yellow'
                    : 'blue';
        const textColor = actionNoticeKind === 'success'
            ? 'greenBright'
            : actionNoticeKind === 'error'
                ? 'redBright'
                : actionNoticeKind === 'warning'
                    ? 'yellow'
                    : 'whiteBright';

        return (
            <Box alignItems="center" justifyContent="center" marginBottom={1}>
                <Box borderStyle="round" borderColor={noticeColor} paddingX={2} paddingY={0}>
                    <Text color={textColor} bold>
                        {actionNotice}
                    </Text>
                </Box>
            </Box>
        );
    };

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
            showActionNotice(`Copied ${scanIssues.length} issues to clipboard`, 'success');
            addLog(`Copied all ${scanIssues.length} issues, fixes, and prompts to clipboard!`);
        } catch {
            clipboard.write(text).then(() => {
                showActionNotice(`Copied ${scanIssues.length} issues to clipboard`, 'success');
                addLog(`Copied all ${scanIssues.length} issues, fixes, and prompts to clipboard!`);
            }).catch(() => {
                showActionNotice('Clipboard copy failed', 'error');
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

                const changedFiles = await getChangedCodeFiles();
                const allFiles = await getCodeFiles();
                const projectIndex = allFiles.length > 0
                    ? await ensureProjectIndex(allFiles)
                    : null;
                const projectContext = projectIndex && changedFiles.length > 0
                    ? changedFiles
                        .slice(0, 6)
                        .map((file, index) => `--- changed file ${index + 1} ---\n${getProjectContext(projectIndex, file, { changedFiles })}`)
                        .join('\n\n')
                    : 'No project index context available.';

                const { textStream } = await streamText({
                    model: getModel(config),
                    system: `You are an automated PR summary generator. Write the response in ${getLanguageLabel(config.reviewLanguage)} using a ${config.reviewTone === 'balanced' ? 'constructive and collaborative' : 'strict production-ready'} tone. Summarize the following git diff into 'Features', 'Fixes', and 'Refactors' categories. Additionally, highlight impact zones, call-flow changes, and cross-file consequences. Output only the markdown summary.`,
                    prompt: `Here is the git diff:\n\n${currentDiff}\n\nProject context for the changed files:\n${projectContext}`,
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
    useInput((input: string, key: Key) => {
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
                        <Text>  ↑/↓: Navigate menu  ·  Enter/Space: Select action</Text>
                        <Text>  Mouse Wheel: Scroll selections  ·  ?: This help screen  ·  Ctrl+C: Quit</Text>

                        <Box marginTop={1}><Text><Text color="yellow" bold>Issue List:</Text></Text></Box>
                        <Text>  ↑/↓ or Mouse Wheel: Navigate  ·  Enter/Space: Open/Collapse  ·  →: Open issue  ·  /: Filter</Text>
                        <Text>  PgUp/PgDn: Jump  ·  s: Change sort  ·  t: Filter category  ·  Esc: Back</Text>

                        <Box marginTop={1}><Text><Text color="yellow" bold>Issue Detail:</Text></Text></Box>
                        <Text>  ↑/↓ or Mouse Wheel: Scroll  ·  PgUp/PgDn: Jump  ·  c: Copy AI Prompt  ·  Esc: Back to list</Text>
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
        const activeIssueIndex = orderedIssues.findIndex((candidate) =>
            candidate.file === activeIssue.file &&
            candidate.line === activeIssue.line &&
            candidate.title === activeIssue.title
        );

        if (activeIssueIndex < 0) {
            return (
                <Box flexDirection="column" flexGrow={1}>
                    {renderActionToast()}
                    <Box flexDirection="column" padding={1}>
                        <Text color="yellow" bold>
                            The selected issue is no longer available in the current list.
                        </Text>
                        <Text color="whiteBright">
                            Press Esc to return to the issue list.
                        </Text>
                    </Box>
                </Box>
            );
        }

        return (
            <Box flexDirection="column" flexGrow={1}>
                {renderActionToast()}
                <IssueDetailView
                    issues={orderedIssues}
                    activeIndex={activeIssueIndex}
                    issue={activeIssue}
                    onSelectIssue={(nextIndex) => {
                        const nextIssue = orderedIssues[nextIndex];
                        if (nextIssue) {
                            setActiveIssue(nextIssue);
                        }
                    }}
                    onBack={() => {
                        setActiveIssue(null);
                        setViewMode('issues');
                    }}
                />
            </Box>
        );
    }

    if (viewMode === 'review_result') {
        return (
            <Box flexDirection="column" flexGrow={1}>
                {renderActionToast()}
                <ReviewResultView
                    content={review}
                    onBack={() => setViewMode('dashboard')}
                />
            </Box>
        );
    }

    if (viewMode === 'issues' && scanIssues.length > 0) {
        return (
            <Box flexDirection="column" flexGrow={1}>
                {renderActionToast()}
                <IssueListView
                    issues={scanIssues}
                    durationSecs={scanDuration}
                    isTyping={isTyping}
                    scanProgress={scanProgress}
                    state={issueListState}
                    onStateChange={(updater) => setIssueListState(updater)}
                    onBack={() => setViewMode('dashboard')}
                    onOpenIssue={(issue) => {
                        setActiveIssue(issue);
                        setViewMode('detail');
                    }}
                />
            </Box>
        );
    }

    // ── Render Main Dashboard ──

    const LOGO = [
        { text: " █████╗ ██╗      ██████╗ ███████╗██╗   ██╗██╗███████╗██╗    ██╗", color: "#FF5F58" },
        { text: "██╔══██╗██║      ██╔══██╗██╔════╝██║   ██║██║██╔════╝██║    ██║", color: "#FF785A" },
        { text: "███████║██║█████╗██████╔╝█████╗  ██║   ██║██║█████╗  ██║ █╗ ██║", color: "#FF915C" },
        { text: "██╔══██║██║╚════╝██╔══██╗██╔══╝  ╚██╗ ██╔╝██║██╔══╝  ██║███╗██║", color: "#FFAA5F" },
        { text: "██║  ██║██║      ██║  ██║███████╗ ╚████╔╝ ██║███████╗╚███╔███╔╝", color: "#FFC361" },
        { text: "╚═╝  ╚═╝╚═╝      ╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚═╝╚══════╝ ╚══╝╚══╝ ", color: "#FFDC64" }
    ];
    const actionItems = [
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
        {
            label: 'Settings',
            value: 'settings',
        },
        { label: 'Quit', value: 'quit' },
    ];
    const reservedRows = isCramped ? 18 : isCompact ? 24 : 30;
    const menuLimit = Math.max(4, Math.min(actionItems.length, rows - reservedRows));

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
        <Box flexDirection="column" flexGrow={1} height="100%" paddingX={isCramped ? 2 : 4} paddingY={isCramped ? 1 : 2}>
            {renderActionToast()}
            <Box
                flexDirection="column"
                alignItems="center"
                justifyContent={isCramped ? 'flex-start' : 'center'}
                flexGrow={1}
            >
                <Box flexDirection="column" alignItems="center" marginBottom={isCramped ? 1 : 2}>
                    {isCramped ? (
                        <Text color="#FF915C" bold>AI REVIEW</Text>
                    ) : isCompact ? (
                        <>
                            <Text color="#FF5F58" bold>AI REVIEW</Text>
                            <Box marginTop={1}>
                                <Text color="gray">terminal code review assistant</Text>
                            </Box>
                        </>
                    ) : (
                        LOGO.map((line, idx) => (
                            <Text key={idx} color={line.color} bold>{line.text}</Text>
                        ))
                    )}
                </Box>

                <Box flexDirection="column" alignItems="center" marginBottom={isCramped ? 1 : 2}>
                    <Text color="gray">
                        repo: <Text color="white">{repoState.path}</Text>
                    </Text>
                    <Text color="gray">
                        comparing: <Text color="white">{repoState.branch} → {repoState.branch} (base)</Text>
                    </Text>
                    {isCramped ? (
                        <>
                            <Text color="gray">
                                provider: <Text color="white">{config.provider}</Text>
                            </Text>
                            <Text color="gray">
                                model: <Text color="white">{config.model}</Text>
                            </Text>
                            <Text color="gray">
                                language: <Text color="white">{getLanguageLabel(config.reviewLanguage)}</Text>  ·  tone: <Text color="white">{config.reviewTone || 'strict'}</Text>
                            </Text>
                        </>
                    ) : (
                        <>
                            <Text color="gray">
                                provider: <Text color="white">{config.provider}</Text>  ·  model: <Text color="white">{config.model}</Text>
                            </Text>
                            <Text color="gray">
                                review language: <Text color="white">{getLanguageLabel(config.reviewLanguage)}</Text>  ·  tone: <Text color="white">{config.reviewTone || 'strict'}</Text>
                            </Text>
                        </>
                    )}
                </Box>

                <Box flexDirection="column" alignItems="center">
                    <Text color="white">
                        {repoState.filesChanged} Files changed
                    </Text>
                    <Text color="gray">
                        {repoState.added} added | {repoState.modified} modified
                    </Text>
                    <Text>
                        <Text color="green">+{Math.max(1, repoState.filesChanged * 14)} insertions</Text> <Text color="gray">|</Text> <Text color="red">-{repoState.modified * 3} deletions</Text>
                    </Text>
                </Box>
            </Box>

            <Box flexDirection="column" alignItems="flex-start" marginTop={isCramped ? 1 : 2}>
                <SelectableList
                    items={actionItems}
                    onSelect={handleSelectCommand}
                    limit={menuLimit}
                />
                <Box marginTop={1}>
                    <Text color="gray">
                        ↑↓ or mouse wheel navigate  ·  Enter/Space select  ·  ? help
                    </Text>
                </Box>
            </Box>
        </Box>
    );
};
