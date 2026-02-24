import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { ScanIssue } from '../types.js';

// Reactive terminal size hook
function useTerminalSize() {
    const [size, setSize] = React.useState({
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
    });

    React.useEffect(() => {
        const onResize = () => {
            setSize({
                cols: process.stdout.columns || 80,
                rows: process.stdout.rows || 24,
            });
        };
        process.stdout.on('resize', onResize);
        return () => {
            process.stdout.off('resize', onResize);
        };
    }, []);

    return size;
}

type ListItem =
    | { type: 'file'; file: string; count: number; isCollapsed: boolean }
    | { type: 'issue'; issue: ScanIssue; file: string };

export const IssueListView = ({
    issues,
    durationSecs,
    isTyping,
    scanProgress,
    onBack,
    onOpenIssue,
}: {
    issues: ScanIssue[];
    durationSecs?: number | null;
    isTyping?: boolean;
    scanProgress?: string;
    onBack: () => void;
    onOpenIssue: (issue: ScanIssue) => void;
}) => {
    const { rows, cols } = useTerminalSize();

    const [filterQuery, setFilterQuery] = useState('');
    const [isFiltering, setIsFiltering] = useState(false);
    const [sortMode, setSortMode] = useState<'severity' | 'file'>('file');
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [startIndex, setStartIndex] = useState(0);

    const filteredIssues = useMemo(() => {
        let result = issues;
        if (filterQuery) {
            const lower = filterQuery.toLowerCase();
            result = result.filter(
                (i) => i.file.toLowerCase().includes(lower) || i.title.toLowerCase().includes(lower)
            );
        }
        if (categoryFilter) {
            result = result.filter((i) => i.category === categoryFilter);
        }
        return result;
    }, [issues, filterQuery, categoryFilter]);

    const categories = useMemo(() => {
        const cats = new Set(issues.map(i => i.category));
        return Array.from(cats).sort();
    }, [issues]);

    const grouped = useMemo(() => {
        const groups: Record<string, ScanIssue[]> = {};
        for (const issue of filteredIssues) {
            if (!groups[issue.file]) groups[issue.file] = [];
            groups[issue.file].push(issue);
        }
        return groups;
    }, [filteredIssues]);

    const listItems = useMemo(() => {
        const items: ListItem[] = [];
        const sortedGroups = Object.entries(grouped);

        if (sortMode === 'severity') {
            // Flatten first, then sort all issues by severity
            const severityWeight: Record<string, number> = { critical: 3, warning: 2, info: 1 };
            const allIssues = filteredIssues.sort((a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0));
            for (const issue of allIssues) {
                items.push({ type: 'issue', issue, file: issue.file });
            }
        } else {
            // Group by file (existing logic)
            for (const [file, fileIssues] of sortedGroups) {
                const isCollapsed = !!collapsed[file];
                items.push({ type: 'file', file, count: fileIssues.length, isCollapsed });
                if (!isCollapsed) {
                    const severityWeight: Record<string, number> = { critical: 3, warning: 2, info: 1 };
                    const sortedFileIssues = [...fileIssues].sort(
                        (a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0)
                    );
                    for (const issue of sortedFileIssues) {
                        items.push({ type: 'issue', issue, file });
                    }
                }
            }
        }
        return items;
    }, [grouped, collapsed, sortMode, filteredIssues]);

    // Safety clamp
    useEffect(() => {
        if (selectedIndex >= listItems.length) {
            setSelectedIndex(Math.max(0, listItems.length - 1));
        }
    }, [listItems.length, selectedIndex]);

    const limit = Math.max(rows - 8, 5);

    useEffect(() => {
        if (selectedIndex < startIndex) {
            setStartIndex(selectedIndex);
        } else if (selectedIndex >= startIndex + limit) {
            setStartIndex(selectedIndex - limit + 1);
        }
    }, [selectedIndex, limit, startIndex]);

    useInput((input, key) => {
        if (isFiltering) {
            if (key.return || key.escape) {
                setIsFiltering(false);
            }
            return;
        }

        if (input === '/') {
            setIsFiltering(true);
            return;
        }

        if (key.escape || key.leftArrow || input === 'b') {
            onBack();
            return;
        }

        if (input === 's') {
            setSortMode(prev => prev === 'severity' ? 'file' : 'severity');
            setSelectedIndex(0);
            return;
        }

        if (input === 't') {
            setCategoryFilter(prev => {
                const idx = prev ? categories.indexOf(prev) : -1;
                if (idx === categories.length - 1) return null;
                return categories[idx + 1];
            });
            setSelectedIndex(0);
            return;
        }

        if (key.upArrow) {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow) {
            setSelectedIndex((prev) => Math.min(listItems.length - 1, prev + 1));
        } else if (key.return) {
            const item = listItems[selectedIndex];
            if (!item) return;

            if (item.type === 'file') {
                setCollapsed((prev) => ({ ...prev, [item.file]: !prev[item.file] }));
            } else if (item.type === 'issue') {
                onOpenIssue(item.issue);
            }
        }
    }, { isActive: true });

    const visibleItems = listItems.slice(startIndex, startIndex + limit);

    return (
        <Box flexDirection="column" paddingLeft={0}>
            {/* Header: CodeRabbit Style */}
            <Box flexDirection="row">
                <Text bold color="white">Filter: </Text>
                {isFiltering ? (
                    <Text>
                        <TextInput value={filterQuery} onChange={setFilterQuery} />
                    </Text>
                ) : (
                    <Text color="gray">Press / to filter files</Text>
                )}
            </Box>

            <Box>
                <Text color="gray">{'─'.repeat(Math.min(cols, 120))}</Text>
            </Box>

            <Box flexDirection="row" justifyContent="space-between">
                <Text color="white">
                    Files / Issues <Text color="gray">{issues.length} Potential Issues</Text>
                </Text>
                {isTyping && scanProgress && (
                    <Text color="yellow">{scanProgress}</Text>
                )}
            </Box>

            {/* List */}
            <Box flexDirection="column" marginTop={1}>
                {listItems.length === 0 ? (
                    <Text color="gray">No issues found matching filter.</Text>
                ) : (
                    visibleItems.map((item, idx) => {
                        const globalIndex = startIndex + idx;
                        const isSelected = globalIndex === selectedIndex;

                        if (item.type === 'file') {
                            return (
                                <Box key={`file-${item.file}`}>
                                    {isSelected ? (
                                        <Text inverse color="white">
                                            {item.isCollapsed ? '▶' : '▼'} {item.file} ({item.count} Potential Issues)
                                        </Text>
                                    ) : (
                                        <Text color="white">
                                            {item.isCollapsed ? '▶' : '▼'} {item.file} <Text color="gray">({item.count} Potential Issues)</Text>
                                        </Text>
                                    )}
                                </Box>
                            );
                        } else {
                            const sevChar = item.issue.severity === 'critical' ? 'C' : item.issue.severity === 'warning' ? 'W' : 'I';
                            const sevColor = item.issue.severity === 'critical' ? 'red' : item.issue.severity === 'warning' ? 'yellow' : 'blueBright';

                            return (
                                <Box key={`issue-${item.file}-${item.issue.line}-${item.issue.title}`} paddingLeft={4}>
                                    {isSelected ? (
                                        <Text inverse color="white">
                                            [{sevChar}] {item.issue.title}
                                        </Text>
                                    ) : (
                                        <Text color="white">
                                            <Text color={sevColor}>[{sevChar}] </Text>
                                            {item.issue.title}
                                        </Text>
                                    )}
                                </Box>
                            );
                        }
                    })
                )}
            </Box>

            {!isFiltering && (
                <Box marginTop={1} flexDirection="column">
                    <Box flexDirection="row" gap={2}>
                        <Text color="cyan">[s] Sort: {sortMode}</Text>
                        <Text color="cyan">[t] Category: {categoryFilter || 'All'}</Text>
                    </Box>
                    <Box marginTop={1}>
                        <Text color="gray" dimColor>
                            ↑↓ navigate  ·  Enter select  ·  / filter  ·  Esc back  ·  Alt+C copy all
                        </Text>
                    </Box>
                </Box>
            )}
        </Box>
    );
};
