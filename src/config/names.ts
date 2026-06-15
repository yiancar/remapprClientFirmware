// Pattern check: no GoF pattern (-) — rejected — canonicalId→firmware-keycode-name lookup over the catalog's EXTERNAL_NAMES; pure data resolver.
//
// Turns a canonical key id into the spelling a given firmware expects. ZMK uses
// the long external name (EXTERNAL_NAMES[id][0], e.g. "A", "SPACE", "LEFT");
// QMK uses the KC_/QK_ alias. Falls back to a sanitized id so an unmapped key
// still emits something inspectable rather than throwing.

import { EXTERNAL_NAMES } from '../catalog/external-names'
import type { CanonicalKeyId } from '../catalog/types'
import type { Modifier } from './keycodes'

/** ZMK `&kp` name. */
export function zmkKeyName(id: CanonicalKeyId): string {
    const names = EXTERNAL_NAMES[id]
    if (names && names.length) return names[0]
    return id.replace(/^.*\./, '').toUpperCase()
}

/** QMK `KC_`/`QK_` name. */
export function qmkKeyName(id: CanonicalKeyId): string {
    const names = EXTERNAL_NAMES[id]
    const kc = names?.find((n) => n.startsWith('KC_') || n.startsWith('QK_'))
    if (kc) return kc
    if (names && names.length) return `KC_${names[0]}`
    return 'KC_NO'
}

/** ZMK modifier keycode (for &mt and modifier-function wraps). */
export const ZMK_MOD: Record<Modifier, string> = {
    LEFT_CTRL: 'LCTRL',
    LEFT_SHIFT: 'LSHFT',
    LEFT_ALT: 'LALT',
    LEFT_GUI: 'LGUI',
    RIGHT_CTRL: 'RCTRL',
    RIGHT_SHIFT: 'RSHFT',
    RIGHT_ALT: 'RALT',
    RIGHT_GUI: 'RGUI',
}

/** ZMK modifier-function wrapper, e.g. LC(x) for Left-Ctrl. */
export const ZMK_MOD_FN: Record<Modifier, string> = {
    LEFT_CTRL: 'LC',
    LEFT_SHIFT: 'LS',
    LEFT_ALT: 'LA',
    LEFT_GUI: 'LG',
    RIGHT_CTRL: 'RC',
    RIGHT_SHIFT: 'RS',
    RIGHT_ALT: 'RA',
    RIGHT_GUI: 'RG',
}

/** QMK mod-tap shortcut macro, e.g. LCTL_T(kc). */
export const QMK_MODTAP: Record<Modifier, string> = {
    LEFT_CTRL: 'LCTL_T',
    LEFT_SHIFT: 'LSFT_T',
    LEFT_ALT: 'LALT_T',
    LEFT_GUI: 'LGUI_T',
    RIGHT_CTRL: 'RCTL_T',
    RIGHT_SHIFT: 'RSFT_T',
    RIGHT_ALT: 'RALT_T',
    RIGHT_GUI: 'RGUI_T',
}

/** QMK modifier-function wrapper for a modified keypress, e.g. LCTL(kc). */
export const QMK_MOD_FN: Record<Modifier, string> = {
    LEFT_CTRL: 'LCTL',
    LEFT_SHIFT: 'LSFT',
    LEFT_ALT: 'LALT',
    LEFT_GUI: 'LGUI',
    RIGHT_CTRL: 'RCTL',
    RIGHT_SHIFT: 'RSFT',
    RIGHT_ALT: 'RALT',
    RIGHT_GUI: 'RGUI',
}
