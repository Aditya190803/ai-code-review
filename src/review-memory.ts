import * as fs from 'fs-extra';
import { createHash } from 'crypto';
import type { ScanIssue } from './types.js';

const MEMORY_FILE = '.ai-review-memory.json';
const MAX_ENTRIES = 200;

export interface ReviewMemoryEntry {
    fingerprint: string;
    title: string;
    category: string;
    suppressed: boolean;
    downvotes: number;
    upvotes: number;
    updatedAt: number;
}

export interface ReviewMemoryStore {
    version: 1;
    entries: ReviewMemoryEntry[];
}

function fingerprint(issue: ScanIssue): string {
    const payload = `${issue.file}|${issue.category}|${issue.title}`.toLowerCase().trim();
    return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function issueFingerprint(issue: ScanIssue): string {
    return fingerprint(issue);
}

export async function loadReviewMemory(file = MEMORY_FILE): Promise<ReviewMemoryStore> {
    try {
        const data = await fs.readJson(file) as ReviewMemoryStore;
        if (data?.version === 1 && Array.isArray(data.entries)) return data;
    } catch {
        // fresh store
    }
    return { version: 1, entries: [] };
}

export async function saveReviewMemory(store: ReviewMemoryStore, file = MEMORY_FILE): Promise<void> {
    store.entries = store.entries
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_ENTRIES);
    await fs.writeJson(file, store, { spaces: 2 });
}

export function filterSuppressedIssues(issues: ScanIssue[], store: ReviewMemoryStore): ScanIssue[] {
    const suppressed = new Set(
        store.entries.filter((e) => e.suppressed).map((e) => e.fingerprint),
    );
    return issues.filter((issue) => !suppressed.has(fingerprint(issue)));
}

export function recordReviewFeedback(
    store: ReviewMemoryStore,
    issue: ScanIssue,
    vote: 'up' | 'down',
): ReviewMemoryStore {
    const fp = fingerprint(issue);
    const existing = store.entries.find((e) => e.fingerprint === fp);
    const now = Date.now();

    if (existing) {
        if (vote === 'down') {
            existing.downvotes += 1;
            if (existing.downvotes >= 2) existing.suppressed = true;
        } else {
            existing.upvotes += 1;
            existing.suppressed = false;
        }
        existing.updatedAt = now;
        return store;
    }

    store.entries.push({
        fingerprint: fp,
        title: issue.title,
        category: issue.category,
        suppressed: vote === 'down',
        downvotes: vote === 'down' ? 1 : 0,
        upvotes: vote === 'up' ? 1 : 0,
        updatedAt: now,
    });

    return store;
}