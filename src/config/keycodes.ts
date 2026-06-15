// Pattern check: no GoF pattern (-) — rejected — name→canonical lookup tables + resolver functions over the existing catalog; pure data/transform, no abstraction.
//
// The remappr config does NOT invent a keycode namespace. Every keycode string
// a user writes ("A", "Space", "Vol Up", "KC_BSPC", or a raw canonical id like
// "key.keyboard_spacebar") resolves to a catalog CanonicalKeyId via the entry's
// id / label / name / aliases. Compilation then reuses the existing per-firmware
// KeycodeCodec. This keeps one vocabulary instead of three.

import { CATALOG } from '../catalog/entries'
import type { CanonicalKeyId } from '../catalog/types'

/* ── modifiers ─────────────────────────────────────────────────────────── */

export const MODIFIERS = [
    'LEFT_CTRL',
    'LEFT_SHIFT',
    'LEFT_ALT',
    'LEFT_GUI',
    'RIGHT_CTRL',
    'RIGHT_SHIFT',
    'RIGHT_ALT',
    'RIGHT_GUI',
] as const

export type Modifier = (typeof MODIFIERS)[number]

// Human + firmware short spellings → canonical modifier. Bare CTRL/SHIFT/ALT/GUI
// default to the left side (the common case for combo strings like "Ctrl+C").
const MODIFIER_ALIASES: Record<string, Modifier> = {
    LEFT_CTRL: 'LEFT_CTRL',
    LCTRL: 'LEFT_CTRL',
    LCTL: 'LEFT_CTRL',
    LC: 'LEFT_CTRL',
    CTRL: 'LEFT_CTRL',
    CONTROL: 'LEFT_CTRL',
    CTL: 'LEFT_CTRL',
    LEFT_SHIFT: 'LEFT_SHIFT',
    LSHIFT: 'LEFT_SHIFT',
    LSFT: 'LEFT_SHIFT',
    LS: 'LEFT_SHIFT',
    SHIFT: 'LEFT_SHIFT',
    SFT: 'LEFT_SHIFT',
    LEFT_ALT: 'LEFT_ALT',
    LALT: 'LEFT_ALT',
    LA: 'LEFT_ALT',
    ALT: 'LEFT_ALT',
    OPT: 'LEFT_ALT',
    OPTION: 'LEFT_ALT',
    LEFT_GUI: 'LEFT_GUI',
    LGUI: 'LEFT_GUI',
    LG: 'LEFT_GUI',
    GUI: 'LEFT_GUI',
    CMD: 'LEFT_GUI',
    COMMAND: 'LEFT_GUI',
    WIN: 'LEFT_GUI',
    META: 'LEFT_GUI',
    SUPER: 'LEFT_GUI',
    RIGHT_CTRL: 'RIGHT_CTRL',
    RCTRL: 'RIGHT_CTRL',
    RCTL: 'RIGHT_CTRL',
    RC: 'RIGHT_CTRL',
    RIGHT_SHIFT: 'RIGHT_SHIFT',
    RSHIFT: 'RIGHT_SHIFT',
    RSFT: 'RIGHT_SHIFT',
    RS: 'RIGHT_SHIFT',
    RIGHT_ALT: 'RIGHT_ALT',
    RALT: 'RIGHT_ALT',
    RA: 'RIGHT_ALT',
    ALTGR: 'RIGHT_ALT',
    RIGHT_GUI: 'RIGHT_GUI',
    RGUI: 'RIGHT_GUI',
    RG: 'RIGHT_GUI',
}

const strict = (s: string): string => s.trim().toUpperCase()
// Loose key: drop separators so "Vol Up" / "VOL_UP" / "vol-up" all collapse.
const loose = (s: string): string => strict(s).replace(/[\s_-]+/g, '')

/** Resolve a modifier token ("Ctrl", "LCTL", "LEFT_CTRL") to canonical, or null. */
export function resolveModifier(token: string): Modifier | null {
    return (
        MODIFIER_ALIASES[strict(token)] ??
        MODIFIER_ALIASES[loose(token)] ??
        null
    )
}

/* ── keycode resolution ────────────────────────────────────────────────── */

// Build name→id indexes once. Priority on collision: canonical id > alias >
// label > name. We fill higher-priority maps first and never overwrite, so a
// later (lower-priority) spelling can't steal a name a stronger one already owns.
const ID_SET = new Set<CanonicalKeyId>()
const STRICT_TO_ID = new Map<string, CanonicalKeyId>()
const LOOSE_TO_ID = new Map<string, CanonicalKeyId>()
const ID_TO_FRIENDLY = new Map<CanonicalKeyId, string>()

const addStrict = (key: string, id: CanonicalKeyId): void => {
    if (!STRICT_TO_ID.has(key)) STRICT_TO_ID.set(key, id)
}
const addLoose = (key: string, id: CanonicalKeyId): void => {
    if (!LOOSE_TO_ID.has(key)) LOOSE_TO_ID.set(key, id)
}

// Prefer a human-friendly display token (label, else a non-prefixed alias).
const pickFriendly = (label: string, aliases: string[]): string => {
    if (label && label.length <= 16) return label
    const human = aliases.find(
        (a) => !/^(KC_|QK_|&|RGB_|BL_|OUT_)/.test(a) && a.length <= 16,
    )
    return human ?? label
}

for (const e of CATALOG) ID_SET.add(e.id)

// pass 1 — ids (exact + strict + loose)
for (const e of CATALOG) {
    addStrict(strict(e.id), e.id)
    addLoose(loose(e.id), e.id)
}
// pass 2 — aliases (firmware + merged spellings)
for (const e of CATALOG) {
    for (const a of e.aliases ?? []) {
        addStrict(strict(a), e.id)
        addLoose(loose(a), e.id)
    }
}
// pass 3 — display label
for (const e of CATALOG) {
    if (e.label) {
        addStrict(strict(e.label), e.id)
        addLoose(loose(e.label), e.id)
    }
}
// pass 4 — long name
for (const e of CATALOG) {
    if (e.name) {
        addStrict(strict(e.name), e.id)
        addLoose(loose(e.name), e.id)
    }
    ID_TO_FRIENDLY.set(e.id, pickFriendly(e.label, e.aliases ?? []))
}

/** Resolve a single keycode token to a CanonicalKeyId, or null if unknown. */
export function resolveKeycode(token: string): CanonicalKeyId | null {
    const t = token.trim()
    if (ID_SET.has(t)) return t // exact canonical id
    return STRICT_TO_ID.get(strict(t)) ?? LOOSE_TO_ID.get(loose(t)) ?? null
}

export function isKnownKeycode(token: string): boolean {
    return resolveKeycode(token) !== null
}

/** Friendly display spelling for a canonical id (used by serialize). */
export function friendlyName(id: CanonicalKeyId): string {
    return ID_TO_FRIENDLY.get(id) ?? id
}

/* ── key tokens (single key OR "Mod+Mod+Key" combo string) ─────────────── */

export interface ParsedKeyToken {
    key: CanonicalKeyId
    mods: Modifier[]
}

/**
 * Parse a bare keycode token. Plain "C" → { key, mods: [] }. A "+"-joined
 * combo string "Ctrl+Shift+C" → trailing token is the key, leading tokens are
 * modifiers. Returns null if any part fails to resolve.
 */
export function parseKeyToken(token: string): ParsedKeyToken | null {
    const t = token.trim()
    if (!t.includes('+')) {
        const key = resolveKeycode(t)
        return key ? { key, mods: [] } : null
    }
    const parts = t
        .split('+')
        .map((p) => p.trim())
        .filter(Boolean)
    if (parts.length < 2) return null
    const keyToken = parts[parts.length - 1]
    const key = resolveKeycode(keyToken)
    if (!key) return null
    const mods: Modifier[] = []
    for (const m of parts.slice(0, -1)) {
        const mod = resolveModifier(m)
        if (!mod) return null
        mods.push(mod)
    }
    return { key, mods }
}

export function isKnownKeyToken(token: string): boolean {
    return parseKeyToken(token) !== null
}
