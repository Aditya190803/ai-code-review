import { describe, expect, test } from 'bun:test';
import { extractMouseWheelArrowSequences } from './TUIUtils.js';

describe('extractMouseWheelArrowSequences', () => {
    test('maps wheel up and down into arrow sequences', () => {
        const sequences = extractMouseWheelArrowSequences('\u001b[<64;20;10M\u001b[<65;20;10M');

        expect(sequences).toEqual(['\u001b[B', '\u001b[A']);
    });

    test('supports wheel events with modifier bits', () => {
        const sequences = extractMouseWheelArrowSequences('\u001b[<68;20;10M\u001b[<69;20;10M');

        expect(sequences).toEqual(['\u001b[B', '\u001b[A']);
    });

    test('ignores mouse release packets', () => {
        const sequences = extractMouseWheelArrowSequences('\u001b[<64;20;10m');

        expect(sequences).toEqual([]);
    });

    test('ignores malformed coordinates and still maps valid wheel packets', () => {
        const sequences = extractMouseWheelArrowSequences('\u001b[<64;0;0M\u001b[<65;20;10M');

        expect(sequences).toEqual(['\u001b[A']);
    });
});
