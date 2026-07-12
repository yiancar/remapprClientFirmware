// Pattern check: no GoF pattern (-) — rejected — pure v2→v1 surface down-migration; data transforms mirroring normalize.ts, no abstraction.
//
// Schema v2 is the ergonomic, hand-authorable surface (see docs/json-config.md).
// It funnels into the existing v1 surface HERE, before validation, so
// normalize/lower/compile stay byte-for-byte identical: a v2 doc and its v1
// spelling produce the same RMBC blob. Detection is `schemaVersion === 2` (or the
// `version` alias); a v1 doc passes through untouched, so existing configs and
// their golden bytes are unaffected.
//
// The two ergonomic wins v2 adds over v1:
//   1. `layers[].keys` with a compact `"verb:arg"` string grammar for actions.
//   2. behavior DEFS as dictionaries keyed by id (`macros`, `tapDances`,
//      `modMorphs`, `holdTaps`) instead of `{id, …}` arrays.
// Everything a v2 doc omits (geometry, target) is synthesized to the minimal v1
// shape the compiler needs.

import { resolveModifier } from './keycodes'

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj =>
    typeof v === 'object' && v !== null && !Array.isArray(v)

/** True when `raw` is a v2 document (root `schemaVersion: 2` or `version: 2`). */
export function isV2(raw: unknown): boolean {
    if (!isObj(raw)) return false
    return raw.schemaVersion === 2 || raw.version === 2
}

/* ── action string grammar ─────────────────────────────────────────────────
 * A binding is either an object (already-explicit v1 action, or a v2 tap-hold
 * `{tap, hold}`) or a compact string. Strings resolve in this order:
 *   1. bare keyword         → e.g. "capsword", "___", "reset"
 *   2. "verb:arg[:mode]"    → e.g. "layer:nav:toggle", "macro:greet(A)"
 *   3. anything else        → passed through as a v1 key token ("A", "Ctrl+C")
 */

const KEYWORD_ACTIONS: Record<string, Obj> = {
    ___: { type: 'transparent' },
    trans: { type: 'transparent' },
    xxx: { type: 'none' },
    none: { type: 'none' },
    capsword: { type: 'caps_word' },
    caps_word: { type: 'caps_word' },
    repeat: { type: 'key_repeat' },
    key_repeat: { type: 'key_repeat' },
    altrepeat: { type: 'alt_repeat' },
    alt_repeat: { type: 'alt_repeat' },
    bootloader: { type: 'bootloader' },
    reset: { type: 'reset' },
    softoff: { type: 'soft_off' },
    soft_off: { type: 'soft_off' },
    graveescape: { type: 'grave_escape' },
    grave_escape: { type: 'grave_escape' },
    layerlock: { type: 'layer_lock' },
    layer_lock: { type: 'layer_lock' },
}

const LAYER_MODE_ALIASES: Record<string, string> = {
    layer: 'momentary',
    mo: 'momentary',
    tog: 'toggle',
    to: 'to',
    sl: 'sticky',
}

const LAYER_MODES = new Set(['momentary', 'toggle', 'to', 'sticky'])

/** Split a `"ref(a, b)"` call into `[ref, [a, b]]`; `[ref, []]` when no parens. */
function splitCall(rest: string): [string, string[]] {
    const m = /^([^(]+)\(([^)]*)\)\s*$/.exec(rest)
    if (!m) return [rest.trim(), []]
    const args = m[2]
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0)
    return [m[1].trim(), args]
}

/** Lower one v2 binding (string or object) into a v1 surface action. */
export function migrateAction(a: unknown): unknown {
    if (isObj(a)) {
        // A v2 tap-hold is the only object sugar; everything else is already v1.
        if (a.type === undefined && 'tap' in a && 'hold' in a) {
            return migrateTapHold(a)
        }
        // Accept friendly modifier names in any explicit action object.
        if (Array.isArray(a.mods)) return { ...a, mods: resolveMods(a.mods) }
        return a
    }
    if (typeof a !== 'string') return a
    const s = a.trim()

    const kw = KEYWORD_ACTIONS[s.toLowerCase()]
    if (kw) return { ...kw }

    const colon = s.indexOf(':')
    if (colon < 0) return s // bare key token — normalize resolves it.
    const verb = s.slice(0, colon).toLowerCase()
    const rest = s.slice(colon + 1).trim()

    if (verb in LAYER_MODE_ALIASES || verb === 'layer') {
        // "layer:nav", "layer:nav:toggle", "mo:nav", "tog:game".
        let layer = rest
        let mode = LAYER_MODE_ALIASES[verb] ?? 'momentary'
        const lastColon = rest.lastIndexOf(':')
        if (lastColon >= 0 && LAYER_MODES.has(rest.slice(lastColon + 1))) {
            layer = rest.slice(0, lastColon)
            mode = rest.slice(lastColon + 1)
        }
        return { type: 'layer', mode, layer }
    }

    switch (verb) {
        case 'sticky':
        case 'sk':
            return { type: 'sticky_key', key: rest }
        case 'macro': {
            const [ref, args] = splitCall(rest)
            return args.length > 0
                ? { type: 'macro', ref, param: args[0] }
                : { type: 'macro', ref }
        }
        case 'td':
            return { type: 'tap_dance', ref: rest }
        case 'mm':
            return { type: 'mod_morph', ref: rest }
        case 'ht': {
            const [ref, args] = splitCall(rest)
            return {
                type: 'hold_tap',
                ref,
                holdParam: args[0] ?? '',
                tapParam: args[1] ?? '',
            }
        }
        case 'mouse':
            return { type: 'mouse_key', button: rest }
        case 'move':
            return { type: 'mouse_move', direction: rest }
        case 'scroll':
            return { type: 'mouse_scroll', direction: rest }
        case 'key':
            return { type: 'key_press', key: rest }
        default:
            // Unknown verb — leave the raw string so validation reports it
            // against the actual key token, not a silently-dropped action.
            return s
    }
}

/** Resolve an array of friendly modifier names ("LShift") to canonical enum
 *  values ("LEFT_SHIFT"); unknown tokens pass through for validation to report. */
function resolveMods(mods: unknown): unknown {
    if (!Array.isArray(mods)) return mods
    return mods.map((m) =>
        typeof m === 'string' ? (resolveModifier(m) ?? m) : m,
    )
}

/** Resolve a v2 hold target string/object into a v1 HoldTarget. */
function migrateHoldTarget(h: unknown): unknown {
    if (isObj(h)) return h
    if (typeof h !== 'string') return h
    const s = h.trim()
    const colon = s.indexOf(':')
    if (colon >= 0) {
        const verb = s.slice(0, colon).toLowerCase()
        if (verb === 'layer' || verb in LAYER_MODE_ALIASES) {
            return { type: 'layer', layer: s.slice(colon + 1).trim() }
        }
    }
    // Resolve the friendly modifier spelling ("LGui") to the canonical enum
    // ("LEFT_GUI") the surface HoldTarget requires; leave unknown tokens raw so
    // validation reports them.
    return { type: 'modifier', modifier: resolveModifier(s) ?? s }
}

/** v2 `{tap, hold, term?, quickTap?, flavor?, resolve?}` → v1 tap_hold. */
function migrateTapHold(a: Obj): Obj {
    const out: Obj = {
        type: 'tap_hold',
        tap: a.tap,
        hold: migrateHoldTarget(a.hold),
    }
    const term = a.tappingTermMs ?? a.term
    if (term !== undefined) out.tappingTermMs = term
    const quick = a.quickTapMs ?? a.quickTap
    if (quick !== undefined) out.quickTapMs = quick
    if (a.flavor !== undefined) out.flavor = a.flavor
    if (a.resolve !== undefined) out.resolve = a.resolve
    return out
}

/* ── macro step grammar ────────────────────────────────────────────────── */

/** Lower one v2 macro step (string or object) into a v1 macro step. */
export function migrateMacroStep(s: unknown): unknown {
    if (isObj(s)) return s
    if (typeof s !== 'string') return s
    const t = s.trim()
    const colon = t.indexOf(':')
    if (colon < 0) {
        if (t.toLowerCase() === 'param') return { type: 'param' }
        if (
            t.toLowerCase() === 'pause' ||
            t.toLowerCase() === 'pause_for_release'
        ) {
            return { type: 'pause_for_release' }
        }
        return { type: 'tap', key: t } // bare key in a macro = a tap.
    }
    const verb = t.slice(0, colon).toLowerCase()
    const rest = t.slice(colon + 1)
    switch (verb) {
        case 'tap':
            return { type: 'tap', key: rest.trim() }
        case 'press':
            return { type: 'press', key: rest.trim() }
        case 'release':
            return { type: 'release', key: rest.trim() }
        case 'wait':
            return { type: 'wait', ms: Number(rest.trim()) }
        case 'taptime':
        case 'tap_time':
            return { type: 'tap_time', ms: Number(rest.trim()) }
        case 'text':
            return { type: 'text', text: rest } // keep spacing verbatim.
        default:
            return { type: 'tap', key: t }
    }
}

/* ── dictionary → array def lowering ───────────────────────────────────── */

/** `{id1: def1, id2: def2}` → `[{id:'id1', …def1}, …]`, preserving key order.
 *  The raw def (which may be an array, e.g. a macro's step list) is passed
 *  through verbatim so each lowerer decides how to read it. */
function dictToArray(
    dict: unknown,
    lower: (id: string, def: unknown) => Obj,
): unknown[] | undefined {
    if (!isObj(dict)) return undefined
    return Object.entries(dict).map(([id, def]) => lower(id, def))
}

function migrateMacroDef(id: string, raw: unknown): Obj {
    // Dict value may be the step array directly, or `{steps, params, …}`.
    const def = isObj(raw) ? raw : {}
    const rawSteps = Array.isArray(raw) ? raw : (def.steps as unknown)
    const steps = Array.isArray(rawSteps) ? rawSteps.map(migrateMacroStep) : []
    const out: Obj = { id, steps }
    if (def.params !== undefined) out.params = def.params
    if (def.description !== undefined) out.description = def.description
    return out
}

function migrateTapDanceDef(id: string, raw: unknown): Obj {
    const def = isObj(raw) ? raw : {}
    // v2: `{ "1": <action>, "2": <action>, timing?: {tappingTermMs} }`.
    const taps: Obj[] = []
    for (const [k, v] of Object.entries(def)) {
        const count = Number(k)
        if (Number.isInteger(count) && count > 0) {
            taps.push({ count, action: migrateAction(v) })
        }
    }
    const out: Obj = { id, taps }
    const timing = def.timing
    const term =
        (isObj(timing) ? timing.tappingTermMs : undefined) ?? def.tappingTermMs
    if (term !== undefined) out.tappingTermMs = term
    if (def.hold !== undefined) out.hold = migrateHoldTarget(def.hold)
    if (def.description !== undefined) out.description = def.description
    return out
}

function migrateModMorphDef(id: string, raw: unknown): Obj {
    const def = isObj(raw) ? raw : {}
    const base = def.base ?? (Array.isArray(def.bindings) ? def.bindings[0] : undefined)
    const morphed =
        def.morphed ?? (Array.isArray(def.bindings) ? def.bindings[1] : undefined)
    const out: Obj = {
        id,
        mods: resolveMods(def.on ?? def.mods),
        bindings: [migrateAction(base), migrateAction(morphed)],
    }
    if (def.keepMods !== undefined) out.keepMods = resolveMods(def.keepMods)
    if (def.description !== undefined) out.description = def.description
    return out
}

function migrateHoldTapDef(id: string, raw: unknown): Obj {
    const def = isObj(raw) ? raw : {}
    const timing = isObj(def.timing) ? def.timing : {}
    const flags = isObj(def.flags) ? def.flags : {}
    const out: Obj = {
        id,
        // The two inner behaviors default to key-presses; v2 hides this ZMK-ism.
        bindings: Array.isArray(def.bindings) ? def.bindings : ['&kp', '&kp'],
    }
    if (def.flavor !== undefined) out.flavor = def.flavor
    const term = timing.tappingTermMs ?? def.tappingTermMs
    if (term !== undefined) out.tappingTermMs = term
    const quick = timing.quickTapMs ?? def.quickTapMs
    if (quick !== undefined) out.quickTapMs = quick
    const idle = timing.requirePriorIdleMs ?? def.requirePriorIdleMs
    if (idle !== undefined) out.requirePriorIdleMs = idle
    const positions = def.positions ?? def.holdTriggerKeyPositions
    if (positions !== undefined) out.holdTriggerKeyPositions = positions
    const retro = flags.retroTap ?? def.retroTap
    if (retro !== undefined) out.retroTap = retro
    const htor = flags.holdTriggerOnRelease ?? def.holdTriggerOnRelease
    if (htor !== undefined) out.holdTriggerOnRelease = htor
    if (def.description !== undefined) out.description = def.description
    return out
}

/* ── the top-level down-migration ──────────────────────────────────────── */

/** Synthesize the minimal v1 `keyboard` block a geometry-less v2 doc omits. */
function synthKeyboard(name: string, positions: number): Obj {
    const keys: Obj[] = []
    for (let i = 0; i < positions; i++) keys.push({ x: i, y: 0 })
    return { id: name || 'keymap', name: name || 'keymap', keys }
}

/**
 * Down-migrate a v2 document to the v1 surface shape. Idempotent on v1 input
 * (returns it unchanged). Unknown root sections (`node`, `firmware`, `board`)
 * are left in place — the v1 zod schema strips them — pending later phases.
 */
export function migrateToV1(raw: unknown): unknown {
    if (!isV2(raw) || !isObj(raw)) return raw
    const km: Obj = { ...raw }
    km.schemaVersion = 1
    delete km.version

    // Layers: `keys` → `bindings`, each lowered through the action grammar.
    if (Array.isArray(km.layers)) {
        km.layers = km.layers.map((l) => {
            if (!isObj(l)) return l
            const layer: Obj = { ...l }
            const cells = (l.keys ?? l.bindings) as unknown
            if (Array.isArray(cells)) layer.bindings = cells.map(migrateAction)
            delete layer.keys
            return layer
        })
    }

    // Behavior defs: dictionary → array.
    if (isObj(km.macros)) km.macros = dictToArray(km.macros, migrateMacroDef)
    if (isObj(km.tapDances))
        km.tapDances = dictToArray(km.tapDances, migrateTapDanceDef)
    if (isObj(km.modMorphs))
        km.modMorphs = dictToArray(km.modMorphs, migrateModMorphDef)
    if (isObj(km.holdTaps))
        km.holdTaps = dictToArray(km.holdTaps, migrateHoldTapDef)

    // Combos: `do` → `action`, synthesize a name when omitted.
    if (Array.isArray(km.combos)) {
        km.combos = km.combos.map((c, i) => {
            if (!isObj(c)) return c
            const combo: Obj = { ...c }
            if (combo.name === undefined) combo.name = `combo_${i}`
            if (combo.do !== undefined) {
                combo.action = migrateAction(combo.do)
                delete combo.do
            } else if (combo.action !== undefined) {
                combo.action = migrateAction(combo.action)
            }
            return combo
        })
    }

    // Conditional layers: `{if, then}` → `{ifLayers, thenLayer}`.
    if (Array.isArray(km.conditionalLayers)) {
        km.conditionalLayers = km.conditionalLayers.map((cl) => {
            if (!isObj(cl)) return cl
            if (cl.ifLayers !== undefined) return cl
            return { ifLayers: cl.if, thenLayer: cl.then }
        })
    }

    // Geometry: synthesize a placeholder keyboard when the doc has none.
    if (!isObj(km.keyboard)) {
        const layers = Array.isArray(km.layers) ? km.layers : []
        let positions = 0
        for (const l of layers) {
            if (isObj(l) && Array.isArray(l.bindings)) {
                positions = Math.max(positions, l.bindings.length)
            }
        }
        const name = isObj(km.meta) ? String(km.meta.name ?? '') : ''
        km.keyboard = synthKeyboard(name, Math.max(positions, 1))
    }

    return km
}
