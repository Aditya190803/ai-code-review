import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text, useInput, Key } from 'ink';
import clipboard from 'clipboardy';
import type { ScanIssue } from '../types.js';
import { SEVERITY_COLORS, SEVERITY_ICONS, CATEGORY_ICONS } from '../types.js';
import { useArrowBurstGuard, useMouseWheel, useTerminalSize } from './TUIUtils.js';

const sanitize = (text: string) => text.replace(/[<>]/g, '');

/**
 * Detailed view of a single scan issue with:
 * - Arrow key scrolling (up/down) for long content
 * - [c] to copy AI prompt to clipboard
 * - [b/Esc] to go back
 */
export const IssueDetailView = ({
    issues,
    activeIndex,
    issue,
    onSelectIssue,
    onBack,
}: {
    issues: ScanIssue[];
    activeIndex: number;
    issue: ScanIssue;
    onSelectIssue: (nextIndex: number) => void;
    onBack: () => void;
}) => {
    const { rows: termRows, cols: termCols } = useTerminalSize();
    const [copied, setCopied] = useState(false);
    const [scrollOffset, setScrollOffset] = useState(0);
    const [sidebarTextOffset, setSidebarTextOffset] = useState(0);
    const allowArrow = useArrowBurstGuard();
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isNarrow = termCols < 110;
    const isCramped = termCols < 86 || termRows < 24;
    const viewportHeight = Math.max(termRows - (isCramped ? 13 : 10), 8);

    useEffect(() => {
        return () => {
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        };
    }, []);

    // Build all the content lines for scrolling
    const contentLines = useMemo(() => {
        const lines: { text: string; color?: string; bold?: boolean; dimColor?: boolean }[] = [];

        // Description section
        lines.push({ text: '', color: 'white' });
        lines.push({ text: 'DESCRIPTION', color: 'blueBright', bold: true });
        const descLines = (issue.description || 'No description.').split('\n');
        for (const dl of descLines) {
            lines.push({ text: dl, color: 'whiteBright' });
        }

        // Problematic Code section
        if (issue.codeContext) {
            lines.push({ text: '' });
            lines.push({ text: '━━ PROBLEMATIC CODE ━━', color: 'red', bold: true });
            const codeLines = issue.codeContext.split('\n');
            for (const cl of codeLines) {
                lines.push({ text: `- ${cl}`, color: 'red' });
            }
        }

        // Suggested Fix section
        if (issue.suggestedFix) {
            lines.push({ text: '' });
            lines.push({ text: '━━ SUGGESTED FIX ━━', color: 'green', bold: true });
            const fixLines = issue.suggestedFix.split('\n');
            for (const fl of fixLines) {
                lines.push({ text: `+ ${fl}`, color: 'green' });
            }
        }

        // AI Prompt section
        if (issue.aiPrompt) {
            lines.push({ text: '' });
            lines.push({ text: 'AI PROMPT TO FIX', color: 'magenta', bold: true });
            const promptLines = issue.aiPrompt.split('\n');
            for (const pl of promptLines) {
                lines.push({ text: pl, color: 'white' });
            }
        }

        return lines;
    }, [issue]);

    const maxScroll = Math.max(0, contentLines.length - viewportHeight);

    useEffect(() => {
        setScrollOffset(0);
    }, [issue]);

    useEffect(() => {
        setSidebarTextOffset(0);
    }, [activeIndex]);

    useMouseWheel((direction) => {
        setScrollOffset((prev) =>
            direction === 'up'
                ? Math.max(0, prev - 1)
                : Math.min(maxScroll, prev + 1)
        );
    }, maxScroll > 0);

    useInput((input: string, key: Key) => {
        // Back navigation
        if (key.escape || input === 'b') {
            onBack();
            return;
        }

        if (key.leftArrow) {
            onSelectIssue(Math.max(0, activeIndex - 1));
            return;
        }

        if (key.rightArrow) {
            onSelectIssue(Math.min(issues.length - 1, activeIndex + 1));
            return;
        }

        // Scroll up/down with arrow keys
        if (key.upArrow) {
            if (!allowArrow('up')) return;
            setScrollOffset((prev) => Math.max(0, prev - 1));
            return;
        }
        if (key.downArrow) {
            if (!allowArrow('down')) return;
            setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
            return;
        }

        // Page up/down for faster scrolling
        if (key.pageUp || (input === 'u' && key.ctrl)) {
            setScrollOffset((prev) => Math.max(0, prev - viewportHeight));
            return;
        }
        if (key.pageDown || (input === 'd' && key.ctrl)) {
            setScrollOffset((prev) => Math.min(maxScroll, prev + viewportHeight));
            return;
        }
        if (key.home) {
            setScrollOffset(0);
            return;
        }
        if (key.end) {
            setScrollOffset(maxScroll);
            return;
        }

        // Copy AI prompt
        if (input === 'c' && !key.meta && !key.ctrl) {
            const textToCopy = issue.aiPrompt || issue.description || issue.title;
            if (!textToCopy) return;

            try {
                clipboard.writeSync(sanitize(textToCopy));
                setCopied(true);
                if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
                copyTimerRef.current = setTimeout(() => setCopied(false), 2500);
            } catch (_e) {
                // Fallback: try async write
                clipboard.write(sanitize(textToCopy)).then(() => {
                    setCopied(true);
                    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
                    copyTimerRef.current = setTimeout(() => setCopied(false), 2500);
                }).catch(() => {
                    // If clipboard fails entirely, show the prompt so user can manually copy
                    setCopied(false);
                });
            }
        }
    });

    const sevColor = SEVERITY_COLORS[issue.severity] || 'white';
    const sevIcon = SEVERITY_ICONS[issue.severity] || ' ';
    const catIcon = CATEGORY_ICONS[issue.category] || issue.category;

    // Visible content slice
    const visibleLines = contentLines.slice(scrollOffset, scrollOffset + viewportHeight);
    const scrollPercent =
        maxScroll > 0 ? Math.round((scrollOffset / maxScroll) * 100) : 100;
    const sidebarWidth = isNarrow
        ? Math.max(24, termCols - 4)
        : Math.max(30, Math.min(44, Math.floor(termCols * 0.26)));
    const sidebarPadding = 4;
    const sidebarInnerWidth = Math.max(18, sidebarWidth - sidebarPadding);
    const sidebarVisibleCount = isNarrow ? Math.max(5, Math.min(8, Math.floor(termRows * 0.25))) : Math.max(8, viewportHeight - 2);
    const sidebarStartIndex = Math.max(
        0,
        Math.min(
            activeIndex - Math.floor(sidebarVisibleCount / 2),
            Math.max(0, issues.length - sidebarVisibleCount)
        )
    );
    const sidebarItems = issues.slice(sidebarStartIndex, sidebarStartIndex + sidebarVisibleCount);
    const activeSidebarIssue = issues[activeIndex];
    const activeSidebarPrefix = activeSidebarIssue
        ? activeSidebarIssue.severity === 'critical'
            ? '[C]'
            : activeSidebarIssue.severity === 'warning'
                ? '[W]'
                : '[I]'
        : '[I]';
    const sidebarAvailableTitleWidth = Math.max(8, sidebarInnerWidth - 4 - activeSidebarPrefix.length);
    const activeSidebarTitleLength = activeSidebarIssue?.title.length || 0;
    const maxSidebarTextOffset = Math.max(0, activeSidebarTitleLength - sidebarAvailableTitleWidth);
    const footerText = copied
        ? 'Copied to clipboard!  ·  [c] Copy AI Prompt  ·  [←→] Previous/Next Issue  ·  [↑↓ / Mouse] Scroll Issue  ·  [PgUp/PgDn] Jump Scroll  ·  [Esc] Back'
        : '[c] Copy AI Prompt  ·  [←→] Previous/Next Issue  ·  [↑↓ / Mouse] Scroll Issue  ·  [PgUp/PgDn] Jump Scroll  ·  [Esc] Back';

    useEffect(() => {
        if (maxSidebarTextOffset === 0) return;

        const timer = setInterval(() => {
            setSidebarTextOffset((prev) => (prev >= maxSidebarTextOffset ? 0 : prev + 1));
        }, 700);

        return () => clearInterval(timer);
    }, [maxSidebarTextOffset]);

    const formatSidebarLabel = (sidebarIssue: ScanIssue, isSelected: boolean) => {
        const prefix = sidebarIssue.severity === 'critical'
            ? '[C]'
            : sidebarIssue.severity === 'warning'
                ? '[W]'
                : '[I]';
        const marker = isSelected ? '› ' : '  ';
        const titleWidth = Math.max(8, sidebarInnerWidth - marker.length - prefix.length - 1);

        if (!isSelected || sidebarIssue.title.length <= titleWidth) {
            return `${marker}${prefix} ${sidebarIssue.title}`.slice(0, sidebarInnerWidth);
        }

        const hiddenLeft = sidebarTextOffset > 0;
        const hiddenRight = sidebarTextOffset + titleWidth < sidebarIssue.title.length;
        const visibleTitle = sidebarIssue.title.slice(sidebarTextOffset, sidebarTextOffset + titleWidth);
        const paddedTitle = visibleTitle.padEnd(titleWidth, ' ');
        const startChar = hiddenLeft ? '…' : '';
        const endChar = hiddenRight ? '…' : '';
        const composedTitle = `${startChar}${paddedTitle.slice(
            0,
            titleWidth - startChar.length - endChar.length
        )}${endChar}`;

        return `${marker}${prefix} ${composedTitle}`.slice(0, sidebarInnerWidth);
    };

    return (
        <Box flexDirection="column" padding={1}>
            <Box flexDirection={isNarrow ? 'column' : 'row'}>
                <Box
                    width={sidebarWidth}
                    borderStyle="single"
                    borderColor="gray"
                    paddingX={1}
                    paddingY={1}
                    flexDirection="column"
                >
                    <Text color="white" bold>Issues</Text>
                    <Box marginTop={1} flexDirection="column">
                        {sidebarItems.map((sidebarIssue, idx) => {
                            const issueIndex = sidebarStartIndex + idx;
                            const isSelected = issueIndex === activeIndex;

                            return (
                                <Text
                                    key={`sidebar-${issueIndex}`}
                                    color={isSelected ? 'white' : 'whiteBright'}
                                    bold={isSelected}
                                    wrap="truncate-end"
                                >
                                    {formatSidebarLabel(sidebarIssue, isSelected)}
                                </Text>
                            );
                        })}
                    </Box>
                </Box>

                <Box flexDirection="column" marginLeft={isNarrow ? 0 : 1} marginTop={isNarrow ? 1 : 0} flexGrow={1}>
                    {/* Header */}
                    <Box borderStyle="single" borderColor={sevColor} paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                        <Text color={sevColor} bold>
                            {sevIcon} [{catIcon}] {issue.title}
                        </Text>
                        <Text color="whiteBright">
                            {issue.file} • Line {issue.line}
                            {issue.lineEnd > issue.line ? `–${issue.lineEnd}` : ''} •{' '}
                            {issue.severity.toUpperCase()}
                        </Text>
                    </Box>

                    {/* Scrollable Content */}
                    <Box flexDirection="column" paddingX={1} marginTop={1}>
                        {visibleLines.map((line, i) => (
                            <Text
                                key={`line-${scrollOffset + i}`}
                                color={line.color || 'white'}
                                bold={line.bold}
                                dimColor={line.dimColor}
                                wrap="wrap"
                            >
                                {line.text}
                            </Text>
                        ))}
                    </Box>

                    {/* Scroll indicator */}
                    {maxScroll > 0 && (
                        <Box paddingX={1}>
                            <Text color="whiteBright">
                                ─── {scrollPercent}% ── {scrollOffset + 1}–
                                {Math.min(scrollOffset + viewportHeight, contentLines.length)} of{' '}
                                {contentLines.length} lines ───
                            </Text>
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Footer Controls */}
            <Box marginTop="auto" paddingX={1}>
                <Text color={copied ? 'greenBright' : 'cyan'} bold={copied} wrap="truncate-end">
                    {footerText}
                </Text>
            </Box>
        </Box>
    );
};
