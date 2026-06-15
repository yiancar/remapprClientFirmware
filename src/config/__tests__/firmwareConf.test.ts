import { describe, expect, it } from 'vitest'
import {
    deriveQmkConfigH,
    deriveQmkRulesMk,
    deriveZmkConf,
    parseKeymap,
} from '../index'

/** Minimal ZMK config builder — `kb`/`fc` patch the keyboard / firmwareConfig. */
const make = (
    kb: Record<string, unknown> = {},
    bindings: unknown[] = ['A', 'B'],
): ReturnType<typeof parseKeymap> =>
    parseKeymap(
        JSON.stringify({
            schemaVersion: 1,
            kind: 'remappr.keymap',
            meta: { name: 'K', target: 'zmk' },
            keyboard: {
                id: 'k',
                name: 'K',
                keys: [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                ],
                ...kb,
            },
            layers: [{ name: 'base', bindings }],
        }),
    )

describe('deriveZmkConf', () => {
    it('defaults: USB on, BLE off, Studio on + locking, logging commented', () => {
        const conf = deriveZmkConf(make())
        expect(conf).toContain('CONFIG_ZMK_USB=y')
        expect(conf).toContain('# CONFIG_ZMK_BLE=y')
        expect(conf).toContain('CONFIG_ZMK_STUDIO=y')
        expect(conf).toContain('CONFIG_ZMK_STUDIO_LOCKING=y')
        expect(conf).toContain('CONFIG_ZMK_STUDIO_TRANSPORT_UART=y') // CDC follows Studio
        expect(conf).toContain('# CONFIG_ZMK_USB_LOGGING=y')
        expect(conf).toContain('# CONFIG_ZMK_BACKLIGHT=y') // unused → commented
    })

    it('auto-derives flags from used behaviors', () => {
        const conf = deriveZmkConf(
            make(
                {
                    keys: [
                        { x: 0, y: 0 },
                        { x: 1, y: 0 },
                        { x: 2, y: 0 },
                        { x: 3, y: 0 },
                    ],
                },
                [
                    { type: 'soft_off' },
                    { type: 'ext_power', action: 'toggle' },
                    { type: 'mouse_key', button: 'left' },
                    { type: 'lighting', target: 'underglow', action: 'toggle' },
                ],
            ),
        )
        expect(conf).toContain('CONFIG_ZMK_PM_SOFT_OFF=y')
        expect(conf).toContain('CONFIG_ZMK_EXT_POWER=y')
        expect(conf).toContain('CONFIG_ZMK_POINTING=y')
        expect(conf).toContain('CONFIG_ZMK_RGB_UNDERGLOW=y')
    })

    it('auto-derives backlight/underglow/ext-power from declared hardware', () => {
        const conf = deriveZmkConf(
            make({
                hardware: {
                    backlightPwm: {
                        instance: 'pwm0',
                        channel: 0,
                        pin: 'P0.13',
                    },
                    ws2812: { spi: 'spi3', dataPin: 'P1.13', chainLength: 5 },
                    extPowerCtrl: { controlGpio: 'P0.14' },
                },
            }),
        )
        expect(conf).toContain('CONFIG_ZMK_BACKLIGHT=y')
        expect(conf).toContain('CONFIG_PWM=y')
        expect(conf).toContain('CONFIG_ZMK_RGB_UNDERGLOW=y')
        expect(conf).toContain('CONFIG_ZMK_EXT_POWER=y')
    })

    it('derives backlight/underglow from the builder Lighting section', () => {
        const conf = deriveZmkConf(
            make({
                lighting: {
                    underglow: { effect: 'solid' },
                    backlight: { brightness: 50 },
                },
            }),
        )
        expect(conf).toContain('CONFIG_ZMK_RGB_UNDERGLOW=y')
        expect(conf).toContain('CONFIG_ZMK_BACKLIGHT=y')
        expect(conf).toContain('CONFIG_PWM=y')
    })

    it('tri-state: explicit false suppresses an otherwise-derived flag', () => {
        const conf = deriveZmkConf(
            make({ firmwareConfig: { studio: false, usb: false, ble: true } }),
        )
        expect(conf).toContain('# CONFIG_ZMK_USB=y') // forced off
        expect(conf).toContain('CONFIG_ZMK_BLE=y') // forced on
        expect(conf).not.toContain('CONFIG_ZMK_STUDIO=y')
        expect(conf).not.toContain('CONFIG_ZMK_STUDIO_TRANSPORT_UART=y')
    })

    it('studioLocking=false emits an explicit =n (not a comment)', () => {
        const conf = deriveZmkConf(
            make({ firmwareConfig: { studioLocking: false } }),
        )
        expect(conf).toContain('CONFIG_ZMK_STUDIO_LOCKING=n')
        expect(conf).not.toContain('CONFIG_ZMK_STUDIO_LOCKING=y')
    })

    it('appends free-text kconfig overrides verbatim, last', () => {
        const conf = deriveZmkConf(
            make({
                firmwareConfig: { kconfig: 'CONFIG_FOO=y\nCONFIG_BAR=42' },
            }),
        )
        expect(conf).toContain('# ── Extra Kconfig (from builder) ──')
        expect(conf.trimEnd().endsWith('CONFIG_BAR=42')).toBe(true)
    })
})

describe('deriveQmk config files', () => {
    const mk = (
        fc: Record<string, unknown> = {},
    ): ReturnType<typeof parseKeymap> =>
        parseKeymap(
            JSON.stringify({
                schemaVersion: 1,
                kind: 'remappr.keymap',
                meta: { name: 'Q', target: 'qmk' },
                keyboard: {
                    id: 'q',
                    name: 'Q',
                    keys: [{ x: 0, y: 0 }],
                    firmwareConfig: fc,
                },
                layers: [{ name: 'base', bindings: ['A'] }],
            }),
        )

    it('rules.mk gates VIA/Vial + appends overrides', () => {
        const r = deriveQmkRulesMk(
            mk({ rulesMk: 'MOUSEKEY_ENABLE = yes' }),
            true,
            true,
        )
        expect(r).toContain('VIA_ENABLE = yes')
        expect(r).toContain('VIAL_ENABLE = yes')
        expect(r).toContain('MOUSEKEY_ENABLE = yes')
    })

    it('config.h carries the pragma block + appended defines', () => {
        const h = deriveQmkConfigH(mk({ configH: '#define TAPPING_TERM 180' }))
        expect(h.startsWith('#pragma once')).toBe(true)
        expect(h).toContain('#define TAPPING_TERM 180')
    })
})
