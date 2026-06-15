// pattern-check: skip — converter test, no production logic
import { describe, expect, it } from 'vitest'
import { buildConfigJsonSchema } from '../jsonSchema'

describe('buildConfigJsonSchema', () => {
    it('derives an object JSON Schema from the zod KeymapSchema', () => {
        const schema = buildConfigJsonSchema()
        expect(schema.type).toBe('object')
        expect(schema.properties).toBeTypeOf('object')
        const props = schema.properties as Record<string, unknown>
        // Top-level config surface is present for Monaco autocomplete.
        for (const key of ['schemaVersion', 'meta', 'keyboard', 'layers']) {
            expect(props).toHaveProperty(key)
        }
    })

    it('memoizes — returns the same instance', () => {
        expect(buildConfigJsonSchema()).toBe(buildConfigJsonSchema())
    })

    it('carries field descriptions from zod .describe()', () => {
        const json = JSON.stringify(buildConfigJsonSchema())
        // At least some .describe() text survives into the schema.
        expect(json).toMatch(/"description":/)
    })
})
