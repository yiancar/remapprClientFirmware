// pattern-check: skip — data-substrate test, no production logic
import { describe, expect, it } from 'vitest'
import { ACTION_META, getActionMeta, KEYCODE_PALETTE } from '../index'
import { ACTION_TYPES } from '../schema'

describe('editorMeta', () => {
    it('covers every action type with a description + snippet', () => {
        expect(ACTION_META).toHaveLength(ACTION_TYPES.length)
        for (const meta of ACTION_META) {
            expect(ACTION_TYPES).toContain(meta.type)
            expect(meta.description.length).toBeGreaterThan(0)
            expect(meta.snippet).toBeDefined()
        }
    })

    it('snippets parse back to the action type they describe', () => {
        for (const meta of ACTION_META) {
            // Bare-string snippets are key_press; object snippets carry `type`.
            if (typeof meta.snippet === 'string') {
                expect(meta.type).toBe('key_press')
            } else {
                expect((meta.snippet as { type: string }).type).toBe(meta.type)
            }
        }
    })

    it('getActionMeta resolves known types and rejects unknown', () => {
        expect(getActionMeta('key_press')?.category).toBe('key')
        expect(getActionMeta('lighting')?.category).toBe('lighting')
        expect(getActionMeta('not_a_type')).toBeUndefined()
    })

    it('exposes a non-empty categorized keycode palette', () => {
        expect(KEYCODE_PALETTE.length).toBeGreaterThan(0)
        const total = KEYCODE_PALETTE.reduce((n, g) => n + g.keycodes.length, 0)
        expect(total).toBeGreaterThan(0)
        // Every keycode has an id + a display name.
        for (const group of KEYCODE_PALETTE) {
            for (const kc of group.keycodes) {
                expect(kc.id.length).toBeGreaterThan(0)
                expect(kc.name.length).toBeGreaterThan(0)
            }
        }
    })
})
