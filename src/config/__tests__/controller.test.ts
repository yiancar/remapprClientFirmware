// Pattern check: no GoF pattern (-) — rejected — unit tests over the pure
// resolveController accessor + a controller round-trip; assertions on data.
import { describe, expect, it } from 'vitest'
import { parseKeymap, resolveController, serializeKeymap } from '../index'
import type { CanonController, ConfigKeymap } from '../index'

const base = (controller?: CanonController, hardware?: object): ConfigKeymap =>
    ({
        schemaVersion: 1,
        kind: 'remappr.keymap',
        meta: { name: 'B', target: 'qmk' },
        keyboard: {
            id: 'b',
            name: 'B',
            keys: [{ x: 0, y: 0, w: 1, h: 1, r: 0 }],
            ...(controller ? { controller } : {}),
            ...(hardware ? { hardware } : {}),
        },
        layers: [{ name: 'base', bindings: [{ type: 'transparent' }] }],
    }) as ConfigKeymap

describe('resolveController', () => {
    it('prefers keyboard.controller over the deprecated hardware fields', () => {
        const c = base({ board: 'nice_nano_v2' }, { board: 'old_board' })
        expect(resolveController(c).board).toBe('nice_nano_v2')
    })

    it('falls back to hardware.board / hardware.shield (pre-controller configs)', () => {
        const c = base(undefined, { board: 'pro_micro', shield: 'corne_left' })
        expect(resolveController(c)).toMatchObject({
            board: 'pro_micro',
            shield: 'corne_left',
        })
    })

    it('returns only set fields and surfaces the QMK identity', () => {
        const c = base({
            processor: 'atmega32u4',
            bootloader: 'atmel-dfu',
            developmentBoard: 'promicro',
            deviceVersion: '1.0.0',
        })
        expect(resolveController(c)).toEqual({
            processor: 'atmega32u4',
            bootloader: 'atmel-dfu',
            developmentBoard: 'promicro',
            deviceVersion: '1.0.0',
        })
    })

    it('round-trips keyboard.controller through serialize → parse', () => {
        const controller: CanonController = {
            board: 'STM32_F103_STM32DUINO',
            processor: 'STM32F103',
            bootloader: 'uf2boot',
            deviceVersion: '0.0.1',
        }
        const back = parseKeymap(serializeKeymap(base(controller)))
        expect(back.keyboard.controller).toEqual(controller)
    })
})
