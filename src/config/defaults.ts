// Pattern check: Strategy (Tier 1) — rejected — per-target defaults are pure
// data keyed by Target via a Record lookup + shallow merge, no polymorphic
// behavior to encapsulate; a data table + resolver function suffices.
//
// THE single source of truth for "default" field values. A field equal to its
// default is dropped on serialize (the config stays minimal — those values
// "don't exist" visually) and re-filled on import / firmware build, so behavior
// is preserved. Some defaults are FIRMWARE-TARGET dependent (e.g. QMK's quick-
// tap term defaults to the tapping term, ZMK's defaults to 0) — resolveDefaults
// folds the per-target overrides onto the universal base.
//
// NOT covered here (intentionally): keyboard-specific structure — hardware,
// pins, kscan, layouts, split, firmware[], vendor/product id, per-key
// variant/pin/element, lighting. Those describe the physical board and stay
// visible whenever set; they are never stripped against a default.

import type { Target } from './types'

export interface TargetDefaults {
    /** Physical key geometry. Universal (a key's layout is target-independent). */
    geometry: { x: number; y: number; w: number; h: number; r: number }
    /** Tap-hold behavior timings the firmware resolves when omitted. */
    tapHold: { tappingTermMs: number; quickTapMs: number }
}

// Universal defaults. ZMK's behavior defaults are the base; QMK/Keychron layer
// their differences on top in PER_TARGET below.
const BASE: TargetDefaults = {
    geometry: { x: 0, y: 0, w: 1, h: 1, r: 0 },
    tapHold: { tappingTermMs: 200, quickTapMs: 0 },
}

// Per-target overrides. Geometry is never overridden (it is physical). QMK's
// QUICK_TAP_TERM defaults to TAPPING_TERM rather than ZMK's 0.
const PER_TARGET: Partial<
    Record<Target, { tapHold?: Partial<TargetDefaults['tapHold']> }>
> = {
    qmk: { tapHold: { quickTapMs: 200 } },
    keychron: { tapHold: { quickTapMs: 200 } },
}

/** Resolve the effective defaults for a firmware target (null → universal base). */
export function resolveDefaults(target: Target | null): TargetDefaults {
    const o = target ? PER_TARGET[target] : undefined
    return {
        geometry: { ...BASE.geometry },
        tapHold: { ...BASE.tapHold, ...(o?.tapHold ?? {}) },
    }
}
