// Pattern check: no GoF pattern (-) — rejected — unit tests over the vial schema
// round-trip + the vial.json / config.h emitter; assertions on data, no abstraction.
import { describe, expect, it } from 'vitest'
import { parseKeymap, serializeKeymap } from '../index'
import type { CanonVial, ConfigKeymap } from '../index'
import { buildVialJson } from '../compilers/vialJson'

const base = (vial?: CanonVial): ConfigKeymap =>
    ({
        schemaVersion: 1,
        kind: 'remappr.keymap',
        meta: {
            name: 'Pad',
            target: 'qmk',
            vendorId: '0xCEEB',
            productId: '0x0007',
        },
        keyboard: {
            id: 'pad',
            name: 'Pad',
            keys: [
                { x: 0, y: 0, w: 1, h: 1, r: 0 },
                { x: 1, y: 0, w: 1, h: 1, r: 0 },
            ],
            pins: { rows: ['B0'], cols: ['B1', 'B2'] },
            ...(vial ? { vial } : {}),
        },
        layers: [
            {
                name: 'base',
                bindings: [{ type: 'transparent' }, { type: 'transparent' }],
            },
        ],
    }) as ConfigKeymap

describe('keyboard.vial round-trip', () => {
    it('round-trips uid + unlock combo + insecure through serialize → parse', () => {
        const vial: CanonVial = {
            uid: [0xfe, 0x06, 0xbf, 0x52, 0x18, 0xba, 0x4f, 0x8a],
            unlockKeys: [
                [0, 0],
                [0, 1],
            ],
        }
        const back = parseKeymap(serializeKeymap(base(vial)))
        expect(back.keyboard.vial).toEqual(vial)
    })
})

describe('buildVialJson', () => {
    it('emits a secure config.h from the UID + unlock combo', () => {
        const r = buildVialJson(
            base({
                uid: [0xfe, 0x06, 0xbf, 0x52, 0x18, 0xba, 0x4f, 0x8a],
                unlockKeys: [
                    [0, 0],
                    [0, 1],
                ],
            }),
        )
        expect(r.configH).toContain(
            '#define VIAL_KEYBOARD_UID {0xFE, 0x06, 0xBF, 0x52, 0x18, 0xBA, 0x4F, 0x8A}',
        )
        expect(r.configH).toContain('#define VIAL_UNLOCK_COMBO_ROWS {0, 0}')
        expect(r.configH).toContain('#define VIAL_UNLOCK_COMBO_COLS {0, 1}')
        expect(r.configH).not.toContain('VIAL_INSECURE')
        // vial.json is the VIA KLE definition (matrix legends)
        expect(r.json.matrix).toEqual({ rows: 1, cols: 2 })
        expect(r.json.layouts).toBeTruthy()
    })

    it('defaults to a placeholder UID + VIAL_INSECURE with a warning when unset', () => {
        const r = buildVialJson(base())
        expect(r.configH).toContain('#define VIAL_KEYBOARD_UID {')
        expect(r.configH).toContain('#define VIAL_INSECURE')
        expect(r.diagnostics.some((d) => /UID not set/.test(d.message))).toBe(
            true,
        )
        expect(
            r.diagnostics.some((d) => /unlock combo not set/.test(d.message)),
        ).toBe(true)
    })

    it('honours insecure even when an unlock combo is present', () => {
        const r = buildVialJson(
            base({
                uid: [1, 2, 3, 4, 5, 6, 7, 8],
                unlockKeys: [[0, 0]],
                insecure: true,
            }),
        )
        expect(r.configH).toContain('#define VIAL_INSECURE')
        expect(r.configH).not.toContain('VIAL_UNLOCK_COMBO_ROWS')
    })
})
