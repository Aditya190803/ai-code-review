import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import clipboard from 'clipboardy';
import type { ScanIssue } from '../types.js';
import { SEVERITY_COLORS, SEVERITY_ICONS, CATEGORY_ICONS } from '../types.js';

const sanitize = (text: string) => text.replace(/[<>]/g, '');

/**
 * Detailed view of a single scan issue with:
 * - Arrow key scrolling (up/down) for long content
 * - [c] to copy AI prompt to clipboard
 * - [b/Esc] to go back
 */
export const IssueDetailView = ({
    issue,
    onBack,
}: {
    issue: ScanIssue;
    onBack: () => void;
}) => {
    const [copied, setCopied] = useState(false);
    const [scrollOffset, setScrollOffset] = useState(0);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Get terminal rows for viewport calculation
    const termRows = process.stdout.rows || 24;
    // Reserve lines for header + footer chrome
    const viewportHeight = Math.max(termRows - 10, 8);

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
            lines.push({ text: dl, color: 'gray' });
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

    useInput((input: string, key: any) => {
        // Back navigation
        if (key.escape || key.leftArrow || input === 'b') {
            onBack();
            return;
        }

        // Scroll up/down with arrow keys
        if (key.upArrow) {
            setScrollOffset((prev) => Math.max(0, prev - 1));
            return;
        }
        if (key.downArrow) {
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

    return (
        <Box flexDirection="column" padding={1}>
            {/* Header */}
            <Box borderStyle="single" borderColor={sevColor} paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                <Text color={sevColor} bold>
                    {sevIcon} [{catIcon}] {issue.title}
                </Text>
                <Text color="gray">
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
                    <Text color="gray" dimColor>
                        ─── {scrollPercent}% ── {scrollOffset + 1}–
                        {Math.min(scrollOffset + viewportHeight, contentLines.length)} of{' '}
                        {contentLines.length} lines ───
                    </Text>
                </Box>
            )}

            {/* Footer Controls */}
            <Box marginTop={1} paddingX={1} flexDirection="row" gap={2}>
                {copied ? (
                    <Text color="greenBright" bold>
                        Copied to clipboard!
                    </Text>
                ) : (
                    <Text color="cyan">[c] Copy AI Prompt</Text>
                )}
                <Text color="cyan">[↑↓] Scroll</Text>
                <Text color="cyan">[←/Esc] Back</Text>
            </Box>
        </Box>
    );
};
