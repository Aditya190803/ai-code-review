import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import clipboard from 'clipboardy';

const termWidth = process.stdout.columns ? process.stdout.columns - 8 : 80;
marked.setOptions({
    // @ts-ignore
    renderer: new TerminalRenderer({
        width: termWidth,
        reflowText: true,
    }) as any,
});

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
    const [scrollOffset, setScrollOffset] = useState(0);
    const [copied, setCopied] = useState(false);

    const termRows = process.stdout.rows || 24;
    const viewportHeight = Math.max(termRows - 8, 10);

    const renderedMarkdown = useMemo(() => {
        return String(marked(content)).trim();
    }, [content]);

    const lines = useMemo(() => renderedMarkdown.split('\n'), [renderedMarkdown]);
    const maxScroll = Math.max(0, lines.length - viewportHeight);

    useInput((input, key) => {
        if (key.escape || key.leftArrow || input === 'b') {
            onBack();
            return;
        }

        if (key.upArrow) {
            setScrollOffset((prev) => Math.max(0, prev - 1));
        }
        if (key.downArrow) {
            setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
        }
        if (key.pageUp) {
            setScrollOffset((prev) => Math.max(0, prev - viewportHeight));
        }
        if (key.pageDown) {
            setScrollOffset((prev) => Math.min(maxScroll, prev + viewportHeight));
        }

        if (input === 'c') {
            try {
                clipboard.writeSync(content);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
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
                <Text color="gray" dimColor>
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

            <Box marginTop={1} gap={2} paddingX={1}>
                <Text color="cyan">[c] Copy Report</Text>
                <Text color="cyan">[↑↓] Scroll</Text>
                <Text color="cyan">[Esc/b] Back to Menu</Text>
                {copied && <Text color="greenBright">Copied!</Text>}
            </Box>
        </Box>
    );
};
