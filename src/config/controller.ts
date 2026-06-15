// Pattern check: no GoF pattern (-) — rejected — a single pure merge accessor that
// reads the controller identity with a back-compat fallback; no abstraction.
//
// `keyboard.controller` is the unified controller / MCU identity (ZMK board+shield,
// QMK processor/bootloader/board/development_board, USB device version). It
// supersedes the older `hardware.board` / `hardware.shield`; this resolver lets
// every emitter read one place while still honoring pre-controller configs that
// only set `hardware.board`/`shield`. Returns only the fields that are set.

import type { CanonController, ConfigKeymap } from './types'

/** Resolve a config's controller identity, preferring `keyboard.controller` and
 *  falling back to the deprecated `hardware.board` / `hardware.shield`. */
export function resolveController(config: ConfigKeymap): CanonController {
    const c = config.keyboard.controller
    const hw = config.keyboard.hardware
    const board = c?.board ?? hw?.board
    const shield = c?.shield ?? hw?.shield
    return {
        ...(board ? { board } : {}),
        ...(shield ? { shield } : {}),
        ...(c?.processor ? { processor: c.processor } : {}),
        ...(c?.bootloader ? { bootloader: c.bootloader } : {}),
        ...(c?.developmentBoard
            ? { developmentBoard: c.developmentBoard }
            : {}),
        ...(c?.deviceVersion ? { deviceVersion: c.deviceVersion } : {}),
    }
}

const slug = (s: string): string =>
    s
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')

// pattern-check: skip pure name-derivation for split shields, shared by compiler + bundle, no abstraction
/** Lowercase shield names for a ZMK split board (real ZMK convention: `corne_left`
 *  / `corne_right`, with a shared `corne.*` base that the keymap/dtsi/conf use).
 *  Derived from the controller shield (suffix stripped) or the keyboard id/name. */
export interface ZmkSplitShields {
    base: string
    left: string
    right: string
}

/** The `{base, left, right}` shield names for a split config, or null when the
 *  board isn't split. Compiler and bundle both call this so the emitted file names,
 *  `#include`s and `build.yaml` shields stay in lockstep. */
export function zmkSplitShields(config: ConfigKeymap): ZmkSplitShields | null {
    if (!config.keyboard.split) return null
    const raw =
        resolveController(config).shield ||
        config.keyboard.id ||
        config.keyboard.name
    const base = slug(raw.replace(/_(left|right)$/i, '')) || 'split'
    return { base, left: `${base}_left`, right: `${base}_right` }
}
