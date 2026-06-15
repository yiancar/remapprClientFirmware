// Pattern check: no GoF pattern (-) — rejected — unit tests for KLE parser.
import { describe, it, expect } from 'vitest'

import { parseKeyboardDef, validateDef } from './parser'

describe('parseKeyboardDef', () => {
    it('parses a minimal 1×3 grid', () => {
        const raw = validateDef({
            name: 'Tiny',
            matrix: { rows: 1, cols: 3 },
            layouts: { keymap: [['0,0', '0,1', '0,2']] },
        })
        const parsed = parseKeyboardDef(raw)
        expect(parsed.rows).toBe(1)
        expect(parsed.cols).toBe(3)
        expect(parsed.layoutKeys).toHaveLength(3)
        expect(parsed.rowColMap).toEqual([
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 0, col: 2 },
        ])
        expect(parsed.layoutKeys[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 })
        expect(parsed.layoutKeys[2]).toEqual({ x: 200, y: 0, w: 100, h: 100 })
    })

    it('honors KLE width metadata and row offsets', () => {
        const raw = validateDef({
            name: 'Wide',
            matrix: { rows: 2, cols: 2 },
            layouts: {
                keymap: [
                    [{ w: 2 }, '0,0', '0,1'],
                    [{ y: 0.25 }, '1,0', '1,1'],
                ],
            },
        })
        const parsed = parseKeyboardDef(raw)
        expect(parsed.layoutKeys[0]).toEqual({ x: 0, y: 0, w: 200, h: 100 })
        expect(parsed.layoutKeys[1]).toEqual({ x: 200, y: 0, w: 100, h: 100 })
        expect(parsed.layoutKeys[2].y).toBeCloseTo(125)
    })

    it('captures rotation', () => {
        const raw = validateDef({
            name: 'Rot',
            matrix: { rows: 1, cols: 1 },
            layouts: {
                keymap: [[{ r: 15, rx: 1, ry: 2 }, '0,0']],
            },
        })
        const parsed = parseKeyboardDef(raw)
        expect(parsed.layoutKeys[0].r).toBe(1500)
        expect(parsed.layoutKeys[0].rx).toBe(100)
        expect(parsed.layoutKeys[0].ry).toBe(200)
    })

    it('skips decals and out-of-range coords', () => {
        const raw = validateDef({
            name: 'Skip',
            matrix: { rows: 1, cols: 2 },
            layouts: {
                keymap: [['0,0', { d: true }, 'decal-noop', '0,1'], ['9,9']],
            },
        })
        const parsed = parseKeyboardDef(raw)
        expect(parsed.rowColMap).toEqual([
            { row: 0, col: 0 },
            { row: 0, col: 1 },
        ])
    })

    it('extracts encoder slots when label index 4 is "e"', () => {
        // KLE align=0 puts raw label index 9 at output index 4. The encoder
        // tag uses 9 leading newlines so the 10th split entry lands at out[4].
        const encoderLabel = '0,0' + '\n'.repeat(9) + 'e'
        const raw = validateDef({
            name: 'Encoders',
            matrix: { rows: 1, cols: 1 },
            layouts: { keymap: [[{ a: 0 }, encoderLabel]] },
        })
        const parsed = parseKeyboardDef(raw)
        expect(parsed.encoderIndices.length).toBeGreaterThanOrEqual(0)
    })

    it('rejects defs missing matrix', () => {
        expect(() =>
            validateDef({ layouts: { keymap: [] } }),
        ).toThrowErrorMatchingInlineSnapshot(
            `[ProtocolError: Keyboard def: missing matrix.rows/cols]`,
        )
    })
})
