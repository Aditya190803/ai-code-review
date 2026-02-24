import React, { useState, useEffect } from 'react';
import { useInput, useStdin } from 'ink';

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
 * Global component to capture terminal mouse scrolling and translate it to UP/DOWN arrow keys.
 */
export function GlobalMouseHandler() {
    const { stdin } = useStdin();

    useEffect(() => {
        if (!stdin || !process.stdout.isTTY) return;

        // Enable normal mouse tracking (1000) and SGR mouse mode (1006)
        process.stdout.write('\x1b[?1000h\x1b[?1006h');

        const onData = (data: Buffer) => {
            const seq = data.toString();
            // Match SGR mouse sequence: \x1b[<[btn];[x];[y]M
            const match = seq.match(/\x1b\[<(\d+);\d+;\d+[Mm]/);
            if (match) {
                const btn = parseInt(match[1] || '0', 10);
                if (btn === 64) {
                    // Scroll up -> emit ↑ arrow
                    stdin.emit('data', Buffer.from('\u001b[A'));
                } else if (btn === 65) {
                    // Scroll down -> emit ↓ arrow
                    stdin.emit('data', Buffer.from('\u001b[B'));
                }
            }
        };

        if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
            stdin.on('data', onData);
        }

        return () => {
            try {
                // Disable mouse modes
                process.stdout.write('\x1b[?1006l\x1b[?1000l');
                stdin.off('data', onData);
            } catch (_) { }
        };
    }, [stdin]);

    return null;
}
