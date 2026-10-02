/** Repository-relative globs, including root files for recursive patterns. */
export function globToRegExp(pattern: string): RegExp {
    let regex = '';
    const normalized = pattern.replace(/\\/g, '/');
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized[i];
        if (char === '*' && normalized[i + 1] === '*') {
            i++;
            if (normalized[i + 1] === '/') {
                regex += '(?:.*/)?';
                i++;
            } else regex += '.*';
        } else if (char === '*') regex += '[^/]*';
        else if (char === '?') regex += '[^/]';
        else regex += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${regex}$`);
}
