// Pattern check: no GoF pattern (-) — rejected — unit tests over the layout-option
// round-trip + the VIA emitter's labels/legends; assertions on data, no abstraction.
import { describe, expect, it } from 'vitest'
import { parseKeymap, serializeKeymap } from '../index'
import type { CanonLayoutOption, ConfigKeymap } from '../index'
import { buildViaJson } from '../compilers/viaJson'

const base = (
    options?: CanonLayoutOption[],
    keyOption?: [number, number],
): ConfigKeymap =>
    ({
        schemaVersion: 1,
        kind: 'remappr.keymap',
        meta: {
            name: 'Board',
            target: 'qmk',
            vendorId: '0x1234',
            productId: '0x5678',
        },
        keyboard: {
            id: 'board',
            name: 'Board',
            keys: [
                { x: 0, y: 0, w: 1, h: 1, r: 0 },
                {
                    x: 1,
                    y: 0,
                    w: 1,
                    h: 1,
                    r: 0,
                    ...(keyOption ? { option: keyOption } : {}),
                },
            ],
            pins: { rows: ['B0'], cols: ['B1', 'B2'] },
            ...(options ? { layoutOptions: options } : {}),
        },
        layers: [
            {
                name: 'base',
                bindings: [{ type: 'transparent' }, { type: 'transparent' }],
            },
        ],
    }) as ConfigKeymap

describe('layoutOptions round-trip', () => {
    it('round-trips layoutOptions + per-key option through serialize → parse', () => {
        const options: CanonLayoutOption[] = [
            { label: 'Split Backspace' },
            { label: 'Spacebar', choices: ['6.25U', '7U'] },
        ]
        const back = parseKeymap(serializeKeymap(base(options, [1, 0])))
        expect(back.keyboard.layoutOptions).toEqual(options)
        expect(back.keyboard.keys[1].option).toEqual([1, 0])
    })
})

describe('buildViaJson layout options', () => {
    it('emits VIA labels (boolean + multi-choice) and key option legends', () => {
        const r = buildViaJson(
            base(
                [
                    { label: 'Split Backspace' },
                    { label: 'Spacebar', choices: ['6.25U', '7U'] },
                ],
                [1, 0],
            ),
        )
        const layouts = r.json.layouts as {
            labels: unknown[]
            keymap: unknown[][]
        }
        expect(layouts.labels).toEqual([
            'Split Backspace',
            ['Spacebar', '6.25U', '7U'],
        ])
        // key 1 carries its matrix at index 0 and its option [1,0] at index 3
        expect(layouts.keymap[0]).toEqual(['0,0', '0,1\n\n\n1,0'])
    })

    it('omits labels when no layout options are defined', () => {
        const r = buildViaJson(base())
        expect(
            (r.json.layouts as Record<string, unknown>).labels,
        ).toBeUndefined()
    })
})
