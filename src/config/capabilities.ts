// Pattern check: no GoF pattern (-) — rejected — static per-firmware capability data table + a lookup helper; no abstraction.
//
// Single source for "which generalized feature does firmware X actually
// support". Compilers consult this to emit a `warn` diagnostic + drop an
// unsupported binding to a no-op, instead of scattering `if (target === 'zmk')`
// across each emitter. Keychron runs the VIA/QMK stack plus a BLE radio.

import type { LightingTarget, OutputAction, Target } from './types'

export interface FirmwareCapabilities {
    /** Lighting axes the firmware can drive. */
    lighting: LightingTarget[]
    /** Output-routing actions; `profiles` = supports a bluetooth profile index. */
    output: { actions: OutputAction[]; profiles: boolean }
    /** Generalized behaviors with a code-gen path on this firmware. */
    behaviors: {
        capsWord: boolean
        stickyKey: boolean
        stickyLayer: boolean
        tapDance: boolean
        macro: boolean
        combo: boolean
    }
}

export const CAPABILITY_MATRIX: Record<Target, FirmwareCapabilities> = {
    zmk: {
        lighting: ['underglow', 'backlight'], // no per_key matrix control
        output: {
            actions: [
                'usb',
                'bluetooth',
                'bluetooth_clear',
                'bluetooth_next',
                'bluetooth_prev',
                'bluetooth_disconnect',
                'toggle',
                'none',
            ],
            profiles: true,
        },
        behaviors: {
            capsWord: true,
            stickyKey: true,
            stickyLayer: true,
            tapDance: true,
            macro: true,
            combo: true,
        },
    },
    qmk: {
        lighting: ['underglow', 'backlight', 'per_key'],
        output: { actions: ['usb'], profiles: false }, // wired-only stock QMK
        behaviors: {
            capsWord: true,
            stickyKey: true,
            stickyLayer: true,
            tapDance: true,
            macro: true,
            combo: true,
        },
    },
    keychron: {
        lighting: ['underglow', 'backlight', 'per_key'],
        output: {
            actions: [
                'usb',
                'bluetooth',
                'bluetooth_clear',
                'bluetooth_next',
                'bluetooth_prev',
                'bluetooth_disconnect',
                'toggle',
                'none',
            ],
            profiles: true,
        }, // VIA/QMK + BLE
        behaviors: {
            capsWord: true,
            stickyKey: true,
            stickyLayer: true,
            tapDance: true,
            macro: true,
            combo: true,
        },
    },
}

export const supportsLighting = (
    target: Target,
    axis: LightingTarget,
): boolean => CAPABILITY_MATRIX[target].lighting.includes(axis)

export const supportsOutput = (target: Target, action: OutputAction): boolean =>
    CAPABILITY_MATRIX[target].output.actions.includes(action)

/**
 * Targets a user may compile for. Demo (no connected firmware) → all; a
 * connected device → only its own firmware family.
 */
export function resolveAllowedTargets(
    connectedFirmware?: string | null,
): Target[] {
    const all: Target[] = ['zmk', 'qmk', 'keychron']
    if (!connectedFirmware) return all
    const fam = connectedFirmware.toLowerCase()
    return all.filter((t) => fam.includes(t))
}
