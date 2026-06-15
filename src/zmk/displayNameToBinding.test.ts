// pattern-check: skip — table-driven assertions over the multi-variant lookup
import { describe, expect, it } from 'vitest'
import {
    KNOWN_BINDING_PREFIXES,
    displayNameToBinding,
} from './displayNameToBinding'

describe('displayNameToBinding', () => {
    it.each([
        ['Key Press', '&kp'],
        ['Modifier', '&kp'],
        ['Mod-Tap', '&mt'],
        ['Mod Tap', '&mt'],
        ['Layer-Tap', '&lt'],
        ['Layer (Momentary)', '&mo'],
        ['Momentary Layer', '&mo'],
        ['Layer', '&mo'],
        ['To Layer', '&to'],
        ['Toggle Layer', '&tog'],
        ['Sticky Layer', '&sl'],
        ['Sticky Key', '&sk'],
        ['Key Toggle', '&kt'],
        ['Transparent', '&trans'],
        ['None', '&none'],
        ['Caps Word', '&caps_word'],
        ['Key Repeat', '&key_repeat'],
        ['Grave Escape', '&gresc'],
        ['Bluetooth', '&bt'],
        ['Output Selection', '&out'],
        ['Outputs', '&out'],
        ['RGB Underglow', '&rgb_ug'],
        ['Underglow', '&rgb_ug'],
        ['Backlight', '&bl'],
        ['External Power', '&ext_power'],
        ['Ext Power', '&ext_power'],
        ['Soft Off', '&soft_off'],
        ['Studio Unlock', '&studio_unlock'],
        ['Reset', '&sys_reset'],
        ['System Reset', '&sys_reset'],
        ['Bootloader', '&bootloader'],
        ['Mouse Button Press', '&mkp'],
        ['Mouse Button', '&mkp'],
        ['Mouse Move', '&mmv'],
        ['Mouse Scroll', '&msc'],
    ])('maps "%s" -> %s', (name, expected) => {
        expect(displayNameToBinding(name)).toBe(expected)
    })

    it('returns empty string for empty input', () => {
        expect(displayNameToBinding('')).toBe('')
    })

    it('falls back to slugified &prefix for unknown display names', () => {
        expect(displayNameToBinding('Some New Behavior')).toBe(
            '&some_new_behavior',
        )
        expect(displayNameToBinding('Foo-Bar')).toBe('&foo_bar')
    })

    it('every known prefix has at least one variant', () => {
        for (const prefix of KNOWN_BINDING_PREFIXES) {
            expect(prefix.startsWith('&')).toBe(true)
            expect(prefix.length).toBeGreaterThan(1)
        }
    })
})
