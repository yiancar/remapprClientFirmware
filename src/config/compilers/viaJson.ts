// Pattern check: no GoF pattern (-) — rejected — pure function assembling the VIA
// definition object (KLE keymap + matrix + USB ids) from the canonical config; a
// data transform mirroring qmkKeyboardJson's style, no abstraction or polymorphism.
//
// Emits a VIA keyboard definition `<kb>.json` (the format the VIA app loads in its
// Authoring/Design tab). It is a KLE keymap whose every key carries its electrical
// `"row,col"` as the top-left legend — that is how VIA maps a cap to the firmware
// matrix — plus per-cap colours derived from the base layer's function category
// (mods violet, layers blue, …) so the VIA board mirrors the builder's colour
// coding. Inputs: `materializeMatrix` (authoritative [row,col] + dims) and the
// catalog HID usages (category → colour). Pairs with the QMK keyboard.json in the
// VIA bundle; the firmware itself just needs `VIA_ENABLE = yes` (set in bundle.ts).

import type { Diagnostic } from '../diagnostics'
import { materializeMatrix } from '../matrix'
import { HID_USAGE_BY_CANONICAL } from '../../catalog/entries'
import type { CanonicalKeyId } from '../../catalog/types'
import type { CanonAction, ConfigKeymap } from '../types'

export interface ViaJsonResult {
    json: Record<string, unknown>
    diagnostics: Diagnostic[]
}

/* ── cap colour by function category ──────────────────────────────────────── */

type Category =
    | 'alpha'
    | 'mod'
    | 'layer'
    | 'nav'
    | 'edit'
    | 'num'
    | 'punct'
    | 'media'
    | 'mouse'
    | 'system'
    | 'space'
    | 'trans'

// KLE's implicit default cap background; neutral categories stay on it so only the
// accented keys get tinted (matching the builder, where alpha/space caps are bare).
const DEFAULT_COLOR = '#cccccc'

// Hex approximations of the design's per-category oklch hues (see lib/keymap
// keyCategory CATEGORY_META). Firmware-local — VIA wants concrete hex, and the
// emitter must not reach up into the renderer layer for the oklch tints.
const CATEGORY_COLOR: Record<Category, string> = {
    alpha: DEFAULT_COLOR,
    space: DEFAULT_COLOR,
    trans: DEFAULT_COLOR,
    mod: '#9a86d4', // violet  (h≈286)
    layer: '#6fa8dc', // blue    (h≈210)
    nav: '#b3c170', // lime    (h≈80)
    edit: '#7cc6a4', // green   (h≈152)
    num: '#8c95da', // indigo  (h≈252)
    punct: '#8c95da', // indigo  (h≈252)
    media: '#d98aa8', // pink    (h≈348)
    mouse: '#d8a978', // orange  (h≈42)
    system: '#d68b7a', // red-orange (h≈25)
}

// Mirror of lib/keymap keyCategory's keyboardUsageCategory ranges, kept firmware-
// local so the emitter stays out of the renderer layer. Only used for cap colour.
function keyboardUsageCategory(id: number): Category {
    if (id >= 0x04 && id <= 0x1d) return 'alpha' // a–z
    if (id >= 0x1e && id <= 0x27) return 'num' // 1–0
    if (id === 0x28 || id === 0x58) return 'edit' // Enter / KP Enter
    if (id === 0x29) return 'system' // Escape
    if (id === 0x2a || id === 0x2b) return 'edit' // Backspace / Tab
    if (id === 0x2c) return 'space' // Space
    if ((id >= 0x2d && id <= 0x38) || id === 0x64 || id === 0x32) return 'punct'
    if (id === 0x39) return 'mod' // Caps Lock
    if ((id >= 0x3a && id <= 0x45) || (id >= 0x68 && id <= 0x73))
        return 'system' // F-keys
    if (id >= 0x46 && id <= 0x48) return 'system' // PrtSc/ScrLk/Pause
    if (id === 0x49 || id === 0x4c) return 'edit' // Insert / Delete
    if (id === 0x4a || id === 0x4b || id === 0x4d || id === 0x4e) return 'nav'
    if (id >= 0x4f && id <= 0x52) return 'nav' // arrows
    if (id >= 0x53 && id <= 0x63) return 'num' // keypad
    if (id >= 0xe0 && id <= 0xe7) return 'mod' // L/R Ctrl/Shift/Alt/GUI
    return 'system'
}

/** Category of a single canonical key id, via its HID usage page/id. */
function usageCategory(key: CanonicalKeyId): Category {
    const u = HID_USAGE_BY_CANONICAL.get(key)
    if (!u) return 'alpha'
    if (u.page === 12) return 'media' // consumer
    if (u.page === 1) return 'system' // generic desktop
    if (u.page === 7) return keyboardUsageCategory(u.usage)
    return 'system'
}

/** Function category of a base-layer action — drives the cap colour. A tap-hold
 *  follows its tap key (matching the builder's face colouring). */
function categoryForAction(a: CanonAction | undefined): Category {
    if (!a) return 'alpha'
    switch (a.type) {
        case 'transparent':
        case 'none':
            return 'trans'
        case 'key_press':
        case 'sticky_key':
        case 'key_toggle':
            return usageCategory(a.key)
        case 'tap_hold':
            return usageCategory(a.tap.key)
        case 'layer':
            return 'layer'
        case 'mouse_key':
        case 'mouse_move':
        case 'mouse_scroll':
            return 'mouse'
        default:
            return 'system'
    }
}

/* ── KLE keymap serialisation ─────────────────────────────────────────────── */

// pattern-check: skip additive field + helper on an existing serialiser, no abstraction
/** One key's input to the KLE serialiser: placement + matrix + cap colour. */
interface KleKey {
    x: number
    y: number
    w: number
    h: number
    row: number
    col: number
    color: string
    /** Vial-only: marks the cap as a rotary encoder (KLE `e` flag legend). */
    encoder?: boolean
    /** VIA layout-option tag `[group, choice]` (KLE index-3 legend). */
    option?: [number, number]
}

/** KLE legend for a key. VIA reads positional legends: index 0 = `"row,col"`
 *  (matrix), index 3 = `"group,choice"` (layout option), index 9 = `e` (Vial
 *  encoder flag). Build the sparse position array and join with `\n`, trimming to
 *  the highest set index. */
function keyLegend(k: KleKey): string {
    const pos: string[] = [`${k.row},${k.col}`]
    if (k.option) pos[3] = `${k.option[0]},${k.option[1]}`
    if (k.encoder) pos[9] = 'e'
    const last = pos.length - 1
    return Array.from({ length: last + 1 }, (_v, i) => pos[i] ?? '').join('\n')
}

/** Serialise placed keys to KLE rows. KLE is row-relative: x resets and y advances
 *  by 1 at each row boundary, so we group keys by their y band and emit only the
 *  deltas (x gaps, fractional y, non-unit w/h) plus a colour prop when it changes.
 *  Each key's string legend is `"row,col"` in the top-left position — VIA reads the
 *  matrix mapping from there. */
function buildKeymap(
    keys: KleKey[],
): (Record<string, number | string> | string)[][] {
    const sorted = [...keys].sort((a, b) => a.y - b.y || a.x - b.x)
    const yBands = [...new Set(sorted.map((k) => k.y))].sort((a, b) => a - b)
    const rows: (Record<string, number | string> | string)[][] = []
    let curColor = DEFAULT_COLOR
    yBands.forEach((bandY, rowIdx) => {
        const rowKeys = sorted.filter((k) => k.y === bandY)
        const row: (Record<string, number | string> | string)[] = []
        let xCursor = 0
        let first = true
        for (const k of rowKeys) {
            const props: Record<string, number | string> = {}
            // y advances by 1 per row automatically; correct for fractional bands.
            if (first) {
                const yDelta = bandY - rowIdx
                if (yDelta !== 0) props.y = yDelta
            }
            const xDelta = k.x - xCursor
            if (xDelta !== 0) props.x = xDelta
            if (k.w !== 1) props.w = k.w
            if (k.h !== 1) props.h = k.h
            if (k.color !== curColor) {
                props.c = k.color
                curColor = k.color
            }
            if (Object.keys(props).length) row.push(props)
            row.push(keyLegend(k))
            xCursor = k.x + k.w
            first = false
        }
        rows.push(row)
    })
    return rows
}

// pattern-check: skip extracting a shared builder + options bag from buildViaJson, no GoF pattern
/** Options for the shared VIA/Vial definition builder. */
export interface ViaDefinitionOptions {
    /** Emit the KLE `e` encoder flag on `element: "encoder"` caps (Vial). */
    encoderFlags?: boolean
}

/** Build the shared VIA/Vial keyboard definition object + export diagnostics. The
 *  VIA and Vial definitions are the same matrix-annotated KLE keymap; Vial only
 *  adds the encoder flag (its UID/unlock live in the firmware config.h, not here). */
export function buildViaDefinition(
    config: ConfigKeymap,
    opts: ViaDefinitionOptions = {},
): ViaJsonResult {
    const diagnostics: Diagnostic[] = []
    const warn = (message: string, path: (string | number)[] = []): void => {
        diagnostics.push({ level: 'warn', message, path })
    }

    const mat = materializeMatrix(config)
    const kb = mat.keyboard
    const dims = kb.matrix ?? { rows: 1, cols: 1 }
    const base = config.layers[0]?.bindings ?? []

    const vid = config.meta.vendorId ?? '0xFEED'
    const pid = config.meta.productId ?? '0x0000'
    if (!config.meta.vendorId || !config.meta.productId)
        warn(
            'USB vendor/product id missing — defaulted in the VIA definition; set them in the builder identity panel (must match the firmware)',
            ['meta'],
        )

    const kleKeys: KleKey[] = kb.keys.map((k, i) => {
        const [row, col] = k.matrix ?? [0, 0]
        return {
            x: k.x,
            y: k.y,
            w: k.w,
            h: k.h,
            row,
            col,
            color: CATEGORY_COLOR[categoryForAction(base[i])],
            encoder: opts.encoderFlags && k.element === 'encoder',
            ...(k.option ? { option: k.option } : {}),
        }
    })

    // VIA `labels`: a string is a boolean toggle, an array a multi-choice dropdown.
    const options = config.keyboard.layoutOptions ?? []
    const labels = options.map((o) =>
        o.choices && o.choices.length >= 2 ? [o.label, ...o.choices] : o.label,
    )

    const json: Record<string, unknown> = {
        name: config.meta.name,
        vendorId: vid,
        productId: pid,
        matrix: { rows: dims.rows, cols: dims.cols },
        layouts: {
            ...(labels.length ? { labels } : {}),
            keymap: buildKeymap(kleKeys),
        },
    }

    return { json, diagnostics }
}

/** Build the VIA keyboard definition object (no encoder flags). */
export function buildViaJson(config: ConfigKeymap): ViaJsonResult {
    return buildViaDefinition(config)
}
