import React, { useState, useEffect, useRef } from 'react';
import { Box, useInput } from 'ink';

type MouseWheelDirection = 'up' | 'down';

const mouseWheelListeners = new Set<(direction: MouseWheelDirection) => void>();

export function extractMouseWheelArrowSequences(sequence: string): string[] {
    const arrows: string[] = [];
    if (typeof sequence !== 'string') return arrows;
    const matches = sequence.matchAll(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g);

    for (const match of matches) {
        const btn = parseInt(match[1] || '0', 10);
        const x = parseInt(match[2] || '0', 10);
        const y = parseInt(match[3] || '0', 10);
        const isMouseRelease = match[4] === 'm';
        const isWheelEvent = btn >= 64 && btn < 80;

        if (x <= 0 || y <= 0) {
            continue;
        }

        if (!isWheelEvent || isMouseRelease) {
            continue;
        }

        const wheelDirection = btn & 1;
        arrows.push(wheelDirection === 0 ? '\u001b[B' : '\u001b[A');
    }

    return arrows;
}

function extractMouseWheelDirections(sequence: string): MouseWheelDirection[] {
    return extractMouseWheelArrowSequences(sequence).map((arrow) =>
        arrow === '\u001b[A' ? 'up' : 'down'
    );
}

export function useMouseWheel(handler: (direction: MouseWheelDirection) => void, enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        mouseWheelListeners.add(handler);
        return () => {
            mouseWheelListeners.delete(handler);
        };
    }, [handler, enabled]);
}

export function useArrowBurstGuard(windowMs = 50) {
    const lastEventRef = useRef<{ direction: 'up' | 'down' | null; at: number }>({
        direction: null,
        at: 0,
    });

    return (direction: 'up' | 'down') => {
        const now = Date.now();
        const previous = lastEventRef.current;

        if (previous.direction === direction && now - previous.at < windowMs) {
            return false;
        }

        lastEventRef.current = { direction, at: now };
        return true;
    };
}

/**
 * Hook to manage search state (Ctrl+F)
 */
export function useSearch(onSearchToggle?: (isSearching: boolean) => void) {
    const [isSearching, setIsSearching] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useInput((input, key) => {
        if (input === 'f' && key.ctrl) {
            const next = !isSearching;
            setIsSearching(next);
            if (!next) setSearchQuery('');
            onSearchToggle?.(next);
        }

        if (key.escape && isSearching) {
            setIsSearching(false);
            setSearchQuery('');
            onSearchToggle?.(false);
        }
    });

    return {
        isSearching,
        setIsSearching,
        searchQuery,
        setSearchQuery,
    };
}

/**
 * Global component to enable alternate-scroll mode.
 * In the terminal alternate screen, this lets the mouse wheel behave like
 * up/down arrow keys without grabbing normal left-click text selection.
 */
export function GlobalMouseHandler() {
    useEffect(() => {
        if (!process.stdout.isTTY || !process.stdin.isTTY) return;

        const handleData = (chunk: Buffer | string) => {
            const sequence = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            const directions = extractMouseWheelDirections(sequence);

            if (directions.length === 0) return;

            for (const direction of directions) {
                for (const listener of mouseWheelListeners) {
                    listener(direction);
                }
            }
        };

        try { process.stdout.write('\x1b[?1007h'); } catch (err) {
            console.error('Failed to enable alternate mouse mode:', err);
        }
        process.stdin.on('data', handleData);

        return () => {
            process.stdin.off('data', handleData);
            try {
                process.stdout.write('\x1b[?1007l');
            } catch (err) {
                console.error('Failed to disable alternate mouse mode:', err);
            }
        };
    }, []);

    return null;
}

const terminalSizeListeners = new Set<() => void>();
let isTerminalSizeListening = false;

function handleTerminalResize() {
    for (const listener of terminalSizeListeners) {
        listener();
    }
}

export function useTerminalSize() {
    const [size, setSize] = useState(() => ({
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
    }));

    useEffect(() => {
        const onResize = () => {
            setSize({
                cols: process.stdout.columns || 80,
                rows: process.stdout.rows || 24,
            });
        };

        terminalSizeListeners.add(onResize);

        if (!isTerminalSizeListening) {
            process.stdout.on('resize', handleTerminalResize);
            isTerminalSizeListening = true;
        }

        return () => {
            terminalSizeListeners.delete(onResize);
            if (terminalSizeListeners.size === 0) {
                process.stdout.off('resize', handleTerminalResize);
                isTerminalSizeListening = false;
            }
        };
    }, []);

    return size;
}

export function FullScreenTerminal({ children }: { children: React.ReactNode }) {
    const { cols, rows } = useTerminalSize();

    useEffect(() => {
        if (!process.stdout.isTTY) return;

        try {
            process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H');
        } catch (err) {
            console.error('Failed to enter alternate screen mode', err);
        }

        return () => {
            try {
                process.stdout.write('\x1b[?1049l');
            } catch (err) {
                // Ignore restore failures during shutdown.
            }
        };
    }, []);

    return (
        <Box width={cols} height={rows} flexDirection="column">
            {children}
        </Box>
    );
}
