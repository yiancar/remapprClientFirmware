// Pattern check: no GoF pattern (-) — rejected — vitest unit tests asserting QmkCodec encode/decode round-trips for HID + quantum keycodes.
import { describe, expect, it } from 'vitest'

import { qmkCodec } from './codec'
import { QMK_HEX_BY_CANONICAL } from './keycodes-hex'

describe('QmkCodec', () => {
    it('encodes HID page-7 letter to basic 8-bit value', () => {
        expect(qmkCodec.encode('key.keyboard_a')?.value).toBe(0x04)
    })

    it('decodes 0x04 back to key.keyboard_a', () => {
        expect(qmkCodec.decode(0x04)?.canonicalId).toBe('key.keyboard_a')
    })

    it('encodes mouse.cursor.up to 0xCD', () => {
        expect(qmkCodec.encode('mouse.cursor.up')?.value).toBe(0x00cd)
    })

    it('encodes media.transport.next to 0xA8', () => {
        expect(qmkCodec.encode('media.transport.next')?.value).toBe(0x00a8)
    })

    it('encodes audio.toggle to 0x7482', () => {
        expect(qmkCodec.encode('audio.toggle')?.value).toBe(0x7482)
    })

    it('encodes rgb.toggle to 0x7820', () => {
        expect(qmkCodec.encode('rgb.toggle')?.value).toBe(0x7820)
    })

    it('encodes system.bootloader to 0x7C00', () => {
        expect(qmkCodec.encode('system.bootloader')?.value).toBe(0x7c00)
    })

    it('encodes magic.nkro.toggle to 0x7013', () => {
        expect(qmkCodec.encode('magic.nkro.toggle')?.value).toBe(0x7013)
    })

    it('round-trips every quantum hex map entry', () => {
        for (const [id, hex] of Object.entries(QMK_HEX_BY_CANONICAL)) {
            const enc = qmkCodec.encode(id)
            expect(enc?.value, `encode failed for ${id}`).toBe(hex)
            const dec = qmkCodec.decode(hex)
            expect(dec?.canonicalId, `decode failed for ${id}`).toBe(id)
        }
    })

    it('encodes wireless.profile.1 to QK_BLUETOOTH_PROFILE1 (0x7793)', () => {
        expect(qmkCodec.encode('wireless.profile.1')?.value).toBe(0x7793)
    })

    it('returns null for nonsense canonical id', () => {
        expect(qmkCodec.encode('wireless.nonsense.99')).toBeNull()
    })

    it('supports() agrees with encode()', () => {
        expect(qmkCodec.supports('rgb.toggle')).toBe(true)
        expect(qmkCodec.supports('wireless.nonsense.99')).toBe(false)
    })
})
