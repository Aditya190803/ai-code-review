import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useArrowBurstGuard, useMouseWheel, useTerminalSize } from './TUIUtils.js';

export interface SelectableItem {
    label: string;
    value: string;
}

export function SelectableList({
    items,
    onSelect,
    initialIndex = 0,
    limit,
}: {
    items: SelectableItem[];
    onSelect: (item: SelectableItem) => void;
    initialIndex?: number;
    limit?: number;
}) {
    const { rows, cols } = useTerminalSize();
    const allowArrow = useArrowBurstGuard();
    const clampIndex = (index: number) => {
        if (items.length === 0) {
            return 0;
        }

        return Math.max(0, Math.min(index, items.length - 1));
    };
    const [selectedIndex, setSelectedIndex] = useState(() => clampIndex(initialIndex));
    const [startIndex, setStartIndex] = useState(0);
    const hasItems = items.length > 0;

    const visibleLimit = useMemo(() => {
        if (typeof limit === 'number') {
            return Math.max(1, limit);
        }
        return Math.max(5, rows - 6);
    }, [limit, rows]);

    useEffect(() => {
        setSelectedIndex((prev) => clampIndex(prev));
    }, [items.length]);

    useEffect(() => {
        setSelectedIndex(clampIndex(initialIndex));
    }, [initialIndex]);

    useEffect(() => {
        if (selectedIndex < startIndex) {
            setStartIndex(selectedIndex);
        } else if (selectedIndex >= startIndex + visibleLimit) {
            setStartIndex(selectedIndex - visibleLimit + 1);
        }
    }, [selectedIndex, startIndex, visibleLimit]);

    useMouseWheel((direction) => {
        if (!hasItems) {
            return;
        }

        setSelectedIndex((prev) => {
            if (direction === 'up') {
                return Math.max(0, prev - 1);
            }
            return Math.min(items.length - 1, prev + 1);
        });
    }, hasItems);

    useInput((input, key) => {
        if (!hasItems) {
            return;
        }

        if (key.upArrow) {
            if (!allowArrow('up')) return;
            setSelectedIndex((prev) => Math.max(0, prev - 1));
            return;
        }
        if (key.downArrow) {
            if (!allowArrow('down')) return;
            setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
            return;
        }
        if (key.pageUp) {
            setSelectedIndex((prev) => Math.max(0, prev - visibleLimit));
            return;
        }
        if (key.pageDown) {
            setSelectedIndex((prev) => Math.min(items.length - 1, prev + visibleLimit));
            return;
        }
        if (key.home) {
            setSelectedIndex(0);
            return;
        }
        if (key.end) {
            setSelectedIndex(Math.max(0, items.length - 1));
            return;
        }
        if (key.return || input === ' ') {
            const item = items[selectedIndex];
            if (item) {
                onSelect(item);
            }
        }
    }, { isActive: true });

    const rowWidth = Math.max(cols - 2, 20);
    const visibleItems = items.slice(startIndex, startIndex + visibleLimit);

    if (!hasItems) {
        return (
            <Box flexDirection="column">
                <Text color="gray">No items available.</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column">
            {visibleItems.map((item, idx) => {
                const globalIndex = startIndex + idx;
                const isSelected = globalIndex === selectedIndex;
                const content = `${isSelected ? '›' : ' '} ${item.label}`;

                return (
                    <Box key={`${item.value}-${globalIndex}`} width={rowWidth}>
                        {isSelected ? (
                            <Text color="white" bold>
                                {content}
                            </Text>
                        ) : (
                            <Text color="whiteBright">{content}</Text>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}
