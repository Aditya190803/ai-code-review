import { expect, test } from 'vite-plus/test';
import { globToRegExp } from './glob.js';

test('recursive patterns match root and nested source files', () => {
    const pattern = globToRegExp('**/*.ts');
    expect(pattern.test('app.ts')).toBe(true);
    expect(pattern.test('src/deep/app.ts')).toBe(true);
    expect(pattern.test('src/app.tsx')).toBe(false);
});
test('single stars do not cross directories and literal regex syntax stays literal', () => {
    expect(globToRegExp('src/*.ts').test('src/deep/app.ts')).toBe(false);
    expect(globToRegExp('src/[file].ts').test('src/[file].ts')).toBe(true);
    expect(globToRegExp('src/[file].ts').test('src/f.ts')).toBe(false);
});
