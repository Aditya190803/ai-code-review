import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import clipboard from 'clipboardy';
import { useArrowBurstGuard, useMouseWheel, useTerminalSize } from './TUIUtils.js';

const MIN_COLS = 90;
const MIN_ROWS = 24;
const PADDING_CRAMPED = 11;
const PADDING_NORMAL = 8;
const MIN_VIEWPORT_HEIGHT = 10;
const COPY_TOAST_DURATION = 2000;

/**
 * Full-screen view for the AI Review result.
 * Supports scrolling for long markdown reports.
 */
export const ReviewResultView = ({
    content,
    onBack,
}: {
    content: string;
    onBack: () => void;
}) => {
    const { cols, rows } = useTerminalSize();
    const [scrollOffset, setScrollOffset] = useState(0);
    const [copied, setCopied] = useState(false);
    const allowArrow = useArrowBurstGuard();
    const isCramped = cols < MIN_COLS || rows < MIN_ROWS;
    const termWidth = Math.max(40, cols - 8);

    const viewportHeight = Math.max(rows - (isCramped ? PADDING_CRAMPED : PADDING_NORMAL), MIN_VIEWPORT_HEIGHT);

    const renderedMarkdown = useMemo(() => {
        const renderer = new TerminalRenderer({
            width: termWidth,
            reflowText: true,
        }) as never;

        return String(marked.parse(content, { renderer })).trim();
    }, [content, termWidth]);

    const lines = useMemo(() => renderedMarkdown.split('\n'), [renderedMarkdown]);
    const maxScroll = Math.max(0, lines.length - viewportHeight);

    useMouseWheel((direction) => {
        setScrollOffset((prev) =>
            direction === 'up'
                ? Math.max(0, prev - 1)
                : Math.min(maxScroll, prev + 1)
        );
    }, maxScroll > 0);

    useInput((input, key) => {
        if (key.escape || key.leftArrow || input === 'b') {
            onBack();
            return;
        }

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
        if (key.pageUp) {
            setScrollOffset((prev) => Math.max(0, prev - viewportHeight));
            return;
        }
        if (key.pageDown) {
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

        if (input === 'c' && !key.meta && !key.ctrl) {
            try {
                clipboard.write(content).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), COPY_TOAST_DURATION);
                }).catch(() => {
                    // Ignore background write errors
                });
            } catch {
                // Clipboard access failed - silently ignore or show error
            }
        }
    });

    const visibleLines = lines.slice(scrollOffset, scrollOffset + viewportHeight);
    const scrollPercent = maxScroll > 0 ? Math.round((scrollOffset / maxScroll) * 100) : 100;

    return (
        <Box flexDirection="column" padding={1}>
            <Box borderStyle="single" borderColor="blue" paddingX={2} paddingY={1} flexDirection="column" alignItems="flex-start">
                <Text color="white" bold>AI Code Review Report</Text>
            </Box>

            <Box flexDirection="column" paddingX={1} marginTop={1} minHeight={viewportHeight}>
                {visibleLines.map((line, i) => (
                    <Text key={i}>{line}</Text>
                ))}
            </Box>

            {/* Scroll Indicator */}
            <Box paddingX={1} marginTop={1}>
                <Text color="whiteBright">
                    {scrollOffset > 0 ? '⏶' : ' '} {scrollPercent}% {scrollOffset < maxScroll ? '⏷' : ' '}
                    {' '}─── {scrollOffset + 1}–{Math.min(scrollOffset + viewportHeight, lines.length)} of {lines.length} lines ───
                </Text>
                {scrollOffset < maxScroll && (
                    <Box marginLeft={2}>
                        <Text color="yellow" bold>↓ More content below</Text>
                    </Box>
                )}
                {scrollOffset > 0 && (
                    <Box marginLeft={2}>
                        <Text color="yellow" bold>↑ Content above</Text>
                    </Box>
                )}
            </Box>

            <Box marginTop={1} paddingX={1} flexDirection="column">
                <Box flexDirection={isCramped ? 'column' : 'row'} gap={2}>
                    <Text color="cyan">[c] Copy Report</Text>
                    <Text color="cyan">[↑↓ / Mouse] Scroll</Text>
                    <Text color="cyan">[PgUp/PgDn] Jump</Text>
                </Box>
                <Box marginTop={isCramped ? 0 : 1} flexDirection={isCramped ? 'column' : 'row'} gap={2}>
                    <Text color="cyan">[Esc/b] Back to Menu</Text>
                    {copied && <Text color="greenBright">Copied!</Text>}
                </Box>
            </Box>
        </Box>
    );
};
