import { describe, expect, it } from 'vitest'

import { COLORLESS_EFFECT } from './lighting'

describe('COLORLESS_EFFECT', () => {
    it.each(['Breathe', 'Breathing'])(
        'keeps the colour picker available for %s',
        (effect) => {
            expect(COLORLESS_EFFECT.test(effect)).toBe(false)
        },
    )

    it('keeps the colour picker hidden for Hue Breathing', () => {
        expect(COLORLESS_EFFECT.test('Hue Breathing')).toBe(true)
    })
})
