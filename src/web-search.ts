import type { ScanIssue } from './types.js';

/** Optional web context for review prompts (DuckDuckGo HTML lite — no API key). */
export async function fetchWebContextForReview(query: string, maxResults = 3): Promise<string> {
    const q = encodeURIComponent(query.slice(0, 200));
    const url = `https://html.duckduckgo.com/html/?q=${q}`;
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'ai-review-cli/1.0' },
            signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) return '';
        const html = await res.text();
        const snippets: string[] = [];
        const re = /<a[^>]+class="result__a"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([^<]+)/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) !== null && snippets.length < maxResults) {
            snippets.push(`- ${m[1].trim()}: ${m[2].trim()}`);
        }
        if (!snippets.length) return '';
        return `Recent web context (verify before trusting):\n${snippets.join('\n')}`;
    } catch {
        return '';
    }
}

export function webSearchQueryFromIssues(issues: ScanIssue[], files: string[]): string {
    const cats = [...new Set(issues.map((i) => i.category))].slice(0, 3).join(' ');
    const lang = files[0]?.split('.').pop() || 'code';
    return `${lang} code review best practices ${cats}`.trim();
}