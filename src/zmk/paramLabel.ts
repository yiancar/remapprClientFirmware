// pattern-check: skip — static token→legend data tables for the ZMK adapter
//
// ZMK enum-command tokens (as reported in behavior metadata param values) →
// short keycap text + optional neutral icon id. Consumed by buildParamLabel
// (src/paramLabel.ts) via the `shortMap` argument; any token absent here falls
// back to shortenToken() with no icon. Entries are either a bare string
// (text-only) or { text, icon }. Keep text ≤6 chars — KeyButton sizes the
// legend off text length. Icon ids come from the neutral vocabulary
// (src/legendIcons.ts) and are resolved by the renderer's registry; an
// unrecognised id degrades to the token's text.
import type { TokenLegend, TokenMap } from '../paramLabel'

export const ZMK_SHORT_TOKENS: Readonly<TokenMap> = {
    // &bt — Bluetooth. BT_SEL / BT_DISC take a trailing profile index which
    // buildParamLabel appends as a plain-text part (→ "BT 0" / "Disc 0").
    BT_SEL: { text: 'BT', icon: 'bluetooth' },
    BT_DISC: { text: 'Disc', icon: 'disconnect' },
    BT_CLR: { text: 'Clr', icon: 'clear' },
    BT_CLR_ALL: { text: 'ClrAll', icon: 'clear-all' },
    BT_NXT: { text: 'Next', icon: 'next' },
    BT_PRV: { text: 'Prev', icon: 'prev' },

    // &rgb_ug — RGB underglow. On/off/toggle carry icons; the +/- fine-grain
    // adjustments stay text (no unambiguous glyph) — the &rgb_ug behavior icon
    // still prefixes them.
    RGB_TOG: { text: 'Tog', icon: 'toggle' },
    RGB_ON: { text: 'On', icon: 'on' },
    RGB_OFF: { text: 'Off', icon: 'off' },
    RGB_HUI: 'Hue+',
    RGB_HUD: 'Hue−',
    RGB_SAI: 'Sat+',
    RGB_SAD: 'Sat−',
    RGB_BRI: 'Bri+',
    RGB_BRD: 'Bri−',
    RGB_SPI: 'Spd+',
    RGB_SPD: 'Spd−',
    RGB_EFF: 'Eff+',
    RGB_EFR: 'Eff−',

    // &bl — Backlight.
    BL_TOG: { text: 'Tog', icon: 'toggle' },
    BL_INC: 'Bri+',
    BL_DEC: 'Bri−',
    BL_ON: { text: 'On', icon: 'on' },
    BL_OFF: { text: 'Off', icon: 'off' },
    BL_CYCLE: 'Cycle',

    // &ext_power — External power.
    EP_TOG: { text: 'Tog', icon: 'toggle' },
    EP_ON: { text: 'On', icon: 'on' },
    EP_OFF: { text: 'Off', icon: 'off' },

    // &out — Output selection.
    OUT_USB: { text: 'USB', icon: 'usb' },
    OUT_BLE: { text: 'BLE', icon: 'ble' },
    OUT_TOG: { text: 'Tog', icon: 'toggle' },

    // &mkp — Mouse buttons (labels already short; behavior icon prefixes them).
    MB1: 'MB1',
    MB2: 'MB2',
    MB3: 'MB3',
    MB4: 'MB4',
    MB5: 'MB5',

    // &mmv — Mouse move.
    MOVE_UP: '↑',
    MOVE_DOWN: '↓',
    MOVE_LEFT: '←',
    MOVE_RIGHT: '→',

    // &msc — Mouse scroll.
    SCRL_UP: 'Scr↑',
    SCRL_DOWN: 'Scr↓',
    SCRL_LEFT: 'Scr←',
    SCRL_RIGHT: 'Scr→',
}

// Behavior-level legends keyed by &prefix. The `icon` prefixes every command of
// the behavior on a cap (e.g. a &bt cap leads with the bluetooth icon), and is
// the whole legend for a zero-arg behavior (&soft_off, &caps_word, …) with
// `text` as the icon-less fallback. Param behaviors use `text: ''` — their
// command part carries the visible text. Icon ids are from src/legendIcons.ts.
export const ZMK_BEHAVIOR_LEGENDS: Readonly<Record<string, TokenLegend>> = {
    '&bt': { text: '', icon: 'bluetooth' },
    '&out': { text: '', icon: 'output' },
    '&rgb_ug': { text: '', icon: 'underglow' },
    '&bl': { text: '', icon: 'backlight' },
    '&ext_power': { text: '', icon: 'power' },
    '&mkp': { text: '', icon: 'mouse' },
    '&mmv': { text: '', icon: 'mouse-move' },
    '&msc': { text: '', icon: 'mouse-scroll' },
    '&soft_off': { text: 'Off', icon: 'power-off' },
    '&sys_reset': { text: 'Rst', icon: 'reset' },
    '&bootloader': { text: 'Boot', icon: 'bootloader' },
    '&caps_word': { text: 'Caps', icon: 'caps-word' },
    '&key_repeat': { text: 'Rept', icon: 'key-repeat' },
    '&studio_unlock': { text: 'Unlk', icon: 'unlock' },
}

/** The neutral icon id for an enum token, if the ZMK map assigns one. */
export function zmkTokenIcon(token: string | undefined): string | undefined {
    if (!token) return undefined
    const entry = ZMK_SHORT_TOKENS[token]
    return typeof entry === 'object' ? entry.icon : undefined
}
