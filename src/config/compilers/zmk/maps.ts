// pattern-check: skip — static ZMK keycode lookup tables + two string helpers
//
// Constant keycode maps and id helpers shared across the ZMK emitter modules
// (bindings / behaviors). Kept data-only so the binding dispatch and the
// behavior emitters reference one source of truth.

import type { Modifier } from '../../keycodes'
import type { LightingAction } from '../../types'

export const RGB_UG: Partial<Record<LightingAction, string>> = {
    toggle: 'RGB_TOG',
    on: 'RGB_ON',
    off: 'RGB_OFF',
    brightness_up: 'RGB_BRI',
    brightness_down: 'RGB_BRD',
    hue_up: 'RGB_HUI',
    hue_down: 'RGB_HUD',
    saturation_up: 'RGB_SAI',
    saturation_down: 'RGB_SAD',
    effect_next: 'RGB_EFF',
    effect_previous: 'RGB_EFR',
    speed_up: 'RGB_SPI',
    speed_down: 'RGB_SPD',
}
export const BL: Partial<Record<LightingAction, string>> = {
    toggle: 'BL_TOG',
    on: 'BL_ON',
    off: 'BL_OFF',
    brightness_up: 'BL_INC',
    brightness_down: 'BL_DEC',
    cycle: 'BL_CYCLE',
}

export const EP: Record<'toggle' | 'on' | 'off', string> = {
    toggle: 'EP_TOG',
    on: 'EP_ON',
    off: 'EP_OFF',
}
export const MOUSE_BTN: Record<string, string> = {
    left: 'MB1',
    right: 'MB2',
    middle: 'MB3',
    mb4: 'MB4',
    mb5: 'MB5',
}
export const MOVE: Record<string, string> = {
    up: 'MOVE_UP',
    down: 'MOVE_DOWN',
    left: 'MOVE_LEFT',
    right: 'MOVE_RIGHT',
}
export const SCRL: Record<string, string> = {
    up: 'SCRL_UP',
    down: 'SCRL_DOWN',
    left: 'SCRL_LEFT',
    right: 'SCRL_RIGHT',
}

export const sanitize = (id: string): string =>
    id.replace(/[^a-zA-Z0-9_]/g, '_')

// Escape a string for safe interpolation inside a double-quoted devicetree /
// Kconfig value (display-name, ZMK_KEYBOARD_NAME, …). Devicetree string literals
// have no escape for a raw `"`, so an un-escaped quote (e.g. a layer named
// `My "Fn"`) produces malformed DTS that fails the firmware build. Strip control
// chars, then escape backslash before quote.
export const dtsString = (s: string): string =>
    Array.from(s, (ch) => (ch.charCodeAt(0) < 0x20 ? ' ' : ch))
        .join('')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')

// ZMK modifier bitmask flags (dt-bindings/zmk/modifiers.h) for mod-morph `mods`.
const MOD_FLAG: Record<Modifier, string> = {
    LEFT_CTRL: 'MOD_LCTL',
    LEFT_SHIFT: 'MOD_LSFT',
    LEFT_ALT: 'MOD_LALT',
    LEFT_GUI: 'MOD_LGUI',
    RIGHT_CTRL: 'MOD_RCTL',
    RIGHT_SHIFT: 'MOD_RSFT',
    RIGHT_ALT: 'MOD_RALT',
    RIGHT_GUI: 'MOD_RGUI',
}
export const modFlags = (mods: Modifier[]): string =>
    `(${mods.map((m) => MOD_FLAG[m]).join('|')})`
