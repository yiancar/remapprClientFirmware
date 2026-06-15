// Pattern check: no GoF pattern (-) — rejected — data-only refactor; multi-variant lookup keyed by &prefix, reverse-indexed at module load. Slug fallback unchanged.
//
// ZMK firmware reports each behavior's `displayName` over RPC. Names are not
// formally specified; upstream zmk-studio firmware has historically used
// "Mod-Tap" / "Layer-Tap" / "Momentary Layer" / etc., but third-party
// firmwares and future ZMK releases may drift. Multi-variant entries absorb
// reasonable spelling differences without forcing a slug-fallback (which
// emits the wrong &prefix for behaviors whose binding name doesn't match
// the slugified display name — e.g. "Mouse Button Press" → &mouse_button_press
// instead of &mkp).
//
// Coverage matches the ZMK behaviors index page
// (https://zmk.dev/docs/keymaps/behaviors).

const BINDING_VARIANTS: Record<string, readonly string[]> = {
    '&kp': ['Key Press', 'Modifier'],
    '&mt': ['Mod-Tap', 'Mod Tap', 'Hold Tap (Mod-Tap)'],
    '&lt': ['Layer-Tap', 'Layer Tap'],
    '&mo': ['Layer', 'Layer (Momentary)', 'Momentary Layer'],
    '&to': ['To Layer'],
    '&tog': ['Toggle Layer'],
    '&sl': ['Sticky Layer'],
    '&sk': ['Sticky Key'],
    '&kt': ['Key Toggle'],
    '&trans': ['Transparent'],
    '&none': ['None'],
    '&caps_word': ['Caps Word'],
    '&key_repeat': ['Key Repeat'],
    '&gresc': ['Grave Escape'],
    '&bt': ['Bluetooth'],
    '&out': ['Output Selection', 'Outputs'],
    '&rgb_ug': ['RGB Underglow', 'Underglow'],
    '&bl': ['Backlight'],
    '&ext_power': ['External Power', 'Ext Power'],
    '&soft_off': ['Soft Off'],
    '&studio_unlock': ['Studio Unlock'],
    '&sys_reset': ['Reset', 'System Reset', 'Sys Reset'],
    '&bootloader': ['Bootloader'],
    '&mkp': ['Mouse Button Press', 'Mouse Button'],
    '&mmv': ['Mouse Move'],
    '&msc': ['Mouse Scroll'],
}

const DISPLAY_TO_PREFIX: Map<string, string> = (() => {
    const m = new Map<string, string>()
    for (const [prefix, variants] of Object.entries(BINDING_VARIANTS)) {
        for (const v of variants) m.set(v, prefix)
    }
    return m
})()

export function displayNameToBinding(displayName: string): string {
    if (!displayName) return ''
    const direct = DISPLAY_TO_PREFIX.get(displayName)
    if (direct) return direct
    const slug = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    return slug ? `&${slug}` : ''
}

export const KNOWN_BINDING_PREFIXES: readonly string[] =
    Object.keys(BINDING_VARIANTS)
