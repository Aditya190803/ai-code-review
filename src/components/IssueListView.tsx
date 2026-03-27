import React, { useMemo, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { ScanIssue } from '../types.js';
import { useArrowBurstGuard, useMouseWheel, useTerminalSize } from './TUIUtils.js';

type ListItem =
    | { type: 'file'; file: string; count: number; isCollapsed: boolean }
    | { type: 'issue'; issue: ScanIssue; file: string };

export interface IssueListState {
    filterQuery: string;
    isFiltering: boolean;
    sortMode: 'severity' | 'file';
    categoryFilter: string | null;
    collapsed: Record<string, boolean>;
    selectedIndex: number;
    startIndex: number;
}

export function createInitialIssueListState(): IssueListState {
    return {
        filterQuery: '',
        isFiltering: false,
        sortMode: 'file',
        categoryFilter: null,
        collapsed: {},
        selectedIndex: 0,
        startIndex: 0,
    };
}

export function getIssueListItems(
    issues: ScanIssue[],
    state: Pick<IssueListState, 'filterQuery' | 'sortMode' | 'categoryFilter' | 'collapsed'>
): { items: ListItem[]; categories: string[] } {
    let filteredIssues = issues;
    if (state.filterQuery) {
        const lower = state.filterQuery.toLowerCase();
        filteredIssues = filteredIssues.filter(
            (issue) => issue.file.toLowerCase().includes(lower) || issue.title.toLowerCase().includes(lower)
        );
    }
    if (state.categoryFilter) {
        filteredIssues = filteredIssues.filter((issue) => issue.category === state.categoryFilter);
    }

    const categories = Array.from(new Set(issues.map((issue) => issue.category))).sort();

    const grouped: Record<string, ScanIssue[]> = {};
    for (const issue of filteredIssues) {
        if (!grouped[issue.file]) grouped[issue.file] = [];
        grouped[issue.file].push(issue);
    }

    const items: ListItem[] = [];
    const sortedGroups = Object.entries(grouped);
    const severityWeight: Record<string, number> = { critical: 3, warning: 2, info: 1 };

    if (state.sortMode === 'severity') {
        const allIssues = [...filteredIssues].sort(
            (a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0)
        );
        for (const issue of allIssues) {
            items.push({ type: 'issue', issue, file: issue.file });
        }
    } else {
        for (const [file, fileIssues] of sortedGroups) {
            const isCollapsed = state.collapsed[file] !== false;
            items.push({ type: 'file', file, count: fileIssues.length, isCollapsed });
            if (!isCollapsed) {
                const sortedFileIssues = [...fileIssues].sort(
                    (a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0)
                );
                for (const issue of sortedFileIssues) {
                    items.push({ type: 'issue', issue, file });
                }
            }
        }
    }

    return { items, categories };
}

export const IssueListView = ({
    issues,
    durationSecs,
    isTyping,
    scanProgress,
    state,
    onStateChange,
    onBack,
    onOpenIssue,
}: {
    issues: ScanIssue[];
    durationSecs?: number | null;
    isTyping?: boolean;
    scanProgress?: string;
    state: IssueListState;
    onStateChange: (updater: (prev: IssueListState) => IssueListState) => void;
    onBack: () => void;
    onOpenIssue: (issue: ScanIssue) => void;
}) => {
    const { rows, cols } = useTerminalSize();
    const allowArrow = useArrowBurstGuard();
    const isNarrow = cols < 110;
    const isCramped = cols < 84 || rows < 24;
    const separatorWidth = Math.max(20, Math.min(cols - 2, 120));
    const contentWidth = Math.max(20, cols - 2);
    const { items: listItems, categories } = useMemo(
        () => getIssueListItems(issues, state),
        [issues, state]
    );
    const listItemsLengthRef = useRef(listItems.length);
    const truncateLabel = (label: string, maxWidth: number) => {
        if (label.length <= maxWidth) return label;
        return `${label.slice(0, Math.max(0, maxWidth - 1))}…`;
    };

    useEffect(() => {
        listItemsLengthRef.current = listItems.length;
    }, [listItems.length]);

    // Safety clamp
    useEffect(() => {
        const lastIndex = Math.max(0, listItemsLengthRef.current - 1);
        if (state.selectedIndex >= listItemsLengthRef.current) {
            onStateChange((prev) => ({
                ...prev,
                selectedIndex: lastIndex,
            }));
        }
    }, [onStateChange, state.selectedIndex]);

    const footerRows = state.isFiltering ? 0 : isCramped ? 4 : isNarrow ? 5 : 4;
    const headerRows = state.isFiltering ? 4 : 5;
    const limit = Math.max(rows - headerRows - footerRows, 5);

    useEffect(() => {
        if (state.selectedIndex < state.startIndex) {
            onStateChange((prev) => ({ ...prev, startIndex: prev.selectedIndex }));
        } else if (state.selectedIndex >= state.startIndex + limit) {
            onStateChange((prev) => ({
                ...prev,
                startIndex: prev.selectedIndex - limit + 1,
            }));
        }
    }, [limit, onStateChange, state.selectedIndex, state.startIndex]);

    useMouseWheel((direction) => {
        if (state.isFiltering) return;
        const lastIndex = Math.max(0, listItemsLengthRef.current - 1);

        onStateChange((prev) => ({
            ...prev,
            selectedIndex: direction === 'up'
                ? Math.max(0, prev.selectedIndex - 1)
                : Math.min(lastIndex, prev.selectedIndex + 1),
        }));
    }, listItems.length > 0);

    useInput((input, key) => {
        if (state.isFiltering) {
            if (key.return || key.escape) {
                onStateChange((prev) => ({ ...prev, isFiltering: false }));
            }
            return;
        }

        if (input === '/') {
            onStateChange((prev) => ({ ...prev, isFiltering: true }));
            return;
        }

        if (key.escape || key.leftArrow || input === 'b') {
            onBack();
            return;
        }

        if (input === 's') {
            onStateChange((prev) => ({
                ...prev,
                sortMode: prev.sortMode === 'severity' ? 'file' : 'severity',
                selectedIndex: 0,
                startIndex: 0,
            }));
            return;
        }

        if (input === 't') {
            onStateChange((prev) => {
                const idx = prev.categoryFilter ? categories.indexOf(prev.categoryFilter) : -1;
                return {
                    ...prev,
                    categoryFilter: idx === categories.length - 1 ? null : categories[idx + 1],
                    selectedIndex: 0,
                    startIndex: 0,
                };
            });
            return;
        }

        if (input === 'o') {
            const fileNames = [...new Set(issues.map((issue) => issue.file))];
            const hasCollapsedFiles = fileNames.some((file) => state.collapsed[file] !== false);
            onStateChange((prev) => ({
                ...prev,
                collapsed: {
                    ...prev.collapsed,
                    ...Object.fromEntries(fileNames.map((file) => [file, hasCollapsedFiles ? false : true])),
                },
                selectedIndex: 0,
                startIndex: 0,
            }));
            return;
        }

        if (key.upArrow) {
            if (!allowArrow('up')) return;
            onStateChange((prev) => ({ ...prev, selectedIndex: Math.max(0, prev.selectedIndex - 1) }));
        } else if (key.downArrow) {
            if (!allowArrow('down')) return;
            const lastIndex = Math.max(0, listItemsLengthRef.current - 1);
            onStateChange((prev) => ({ ...prev, selectedIndex: Math.min(lastIndex, prev.selectedIndex + 1) }));
        } else if (key.pageUp) {
            onStateChange((prev) => ({ ...prev, selectedIndex: Math.max(0, prev.selectedIndex - limit) }));
        } else if (key.pageDown) {
            const lastIndex = Math.max(0, listItemsLengthRef.current - 1);
            onStateChange((prev) => ({ ...prev, selectedIndex: Math.min(lastIndex, prev.selectedIndex + limit) }));
        } else if (key.home) {
            onStateChange((prev) => ({ ...prev, selectedIndex: 0 }));
        } else if (key.end) {
            const lastIndex = Math.max(0, listItemsLengthRef.current - 1);
            onStateChange((prev) => ({ ...prev, selectedIndex: lastIndex }));
        } else if (key.rightArrow) {
            const item = listItems[state.selectedIndex];
            if (!item) return;

            if (item.type === 'file') {
                if (item.isCollapsed) {
                    onStateChange((prev) => ({
                        ...prev,
                        collapsed: { ...prev.collapsed, [item.file]: false },
                    }));
                } else {
                    const nextIndex = state.selectedIndex + 1;
                    if (nextIndex < listItemsLengthRef.current) {
                        onStateChange((prev) => ({ ...prev, selectedIndex: nextIndex }));
                    }
                }
            } else {
                onOpenIssue(item.issue);
            }
        } else if (key.return || input === ' ') {
            const item = listItems[state.selectedIndex];
            if (!item) return;

            if (item.type === 'file') {
                onStateChange((prev) => ({
                    ...prev,
                    collapsed: { ...prev.collapsed, [item.file]: prev.collapsed[item.file] === false ? true : false },
                }));
            } else if (item.type === 'issue') {
                onOpenIssue(item.issue);
            }
        }
    }, { isActive: true });

    const visibleItems = listItems.slice(state.startIndex, state.startIndex + limit);

    return (
        <Box flexDirection="column" paddingLeft={0} flexGrow={1}>
            {/* Header: CodeRabbit Style */}
            <Box flexDirection="row">
                <Text bold color="white">Filter: </Text>
                {state.isFiltering ? (
                    <Text>
                        <TextInput
                            value={state.filterQuery}
                            onChange={(value) => onStateChange((prev) => ({ ...prev, filterQuery: value }))}
                        />
                    </Text>
                ) : (
                    <Text color="whiteBright">Press / to filter files</Text>
                )}
            </Box>

            <Box>
                <Text color="whiteBright">{'─'.repeat(separatorWidth)}</Text>
            </Box>

            <Box flexDirection={isNarrow ? 'column' : 'row'} justifyContent="space-between">
                <Text color="white">
                    Files / Issues <Text color="whiteBright">{issues.length} Potential Issues</Text>
                </Text>
                {isTyping && scanProgress && (
                    <Text color="yellow">{truncateLabel(scanProgress, contentWidth)}</Text>
                )}
            </Box>

            {/* List */}
            <Box flexDirection="column" marginTop={1} flexGrow={1}>
                {listItems.length === 0 ? (
                    <Text color="whiteBright">No issues found matching filter.</Text>
                ) : (
                    visibleItems.map((item, idx) => {
                        const globalIndex = state.startIndex + idx;
                        const isSelected = globalIndex === state.selectedIndex;
                        if (item.type === 'file') {
                            const label = truncateLabel(
                                `${item.isCollapsed ? '▶' : '▼'} ${item.file} (${item.count} Potential Issues)`,
                                Math.max(16, contentWidth - 2)
                            );
                            return (
                                <Box key={`file-${globalIndex}-${item.file}`}>
                                    {isSelected ? (
                                        <Text color="white" bold>{`› ${label}`}</Text>
                                    ) : (
                                        <Text color="white">{`  ${label}`}</Text>
                                    )}
                                </Box>
                            );
                        } else {
                            const sevChar = item.issue.severity === 'critical' ? 'C' : item.issue.severity === 'warning' ? 'W' : 'I';
                            const sevColor = item.issue.severity === 'critical' ? 'red' : item.issue.severity === 'warning' ? 'yellow' : 'blueBright';
                            const title = truncateLabel(item.issue.title, Math.max(12, contentWidth - 9));

                            return (
                                <Box key={`issue-${globalIndex}-${item.file}-${item.issue.line}-${item.issue.title}`}>
                                    {isSelected ? (
                                        <Text color="white" bold>
                                            {'› '}
                                            <Text color={sevColor}>[{sevChar}] </Text>
                                            <Text color="white">{title}</Text>
                                        </Text>
                                    ) : (
                                        <Text color="white">
                                            {'    '}
                                            <Text color={sevColor}>[{sevChar}] </Text>
                                            <Text color="whiteBright">{title}</Text>
                                        </Text>
                                    )}
                                </Box>
                            );
                        }
                    })
                )}
            </Box>

            {!state.isFiltering && (
                <Box marginTop={1} flexDirection="column">
                    <Box flexDirection={isCramped ? 'column' : 'row'} gap={2}>
                        <Text color="cyan">[s] Sort: {state.sortMode}</Text>
                        <Text color="cyan">[t] Category: {state.categoryFilter || 'All'}</Text>
                        <Text color="cyan">[o] Toggle all</Text>
                    </Box>
                    {isCramped ? (
                        <>
                            <Box marginTop={1}>
                                <Text color="whiteBright">
                                    ↑↓ or mouse wheel navigate  ·  ←→ collapse/open  ·  PgUp/PgDn jump
                                </Text>
                            </Box>
                            <Box>
                                <Text color="whiteBright">
                                    Enter/Space select  ·  / filter  ·  Esc back  ·  Alt+C copy all
                                </Text>
                            </Box>
                        </>
                    ) : (
                        <Box marginTop={1}>
                            <Text color="whiteBright">
                                ↑↓ or mouse wheel navigate  ·  ←→ collapse/open  ·  PgUp/PgDn jump  ·  Enter/Space select  ·  / filter  ·  Esc back  ·  Alt+C copy all
                            </Text>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
};
