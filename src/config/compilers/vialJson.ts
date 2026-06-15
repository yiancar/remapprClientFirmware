// Pattern check: no GoF pattern (-) — rejected — a pure function pair emitting the
// Vial definition (delegating to viaJson's shared buildViaDefinition) and the vial
// keymap's config.h string from the UID/unlock combo; data transform mirroring the
// other emitters, no abstraction or polymorphism.
//
// Vial reuses VIA's matrix-annotated KLE definition (with the `e` encoder flag) as
// its `vial.json`, and adds a security layer the firmware enforces: a per-board UID
// (VIAL_KEYBOARD_UID) ties a flashed board to its definition, and an unlock combo
// (VIAL_UNLOCK_COMBO_ROWS/COLS) must be held to expose the keymap to the GUI. Those
// live in the vial keymap's `config.h` — sourced from `keyboard.vial`. `insecure`
// emits `VIAL_INSECURE` (no unlock) for dev/testing. Pairs with the QMK keyboard.json
// + `VIA_ENABLE`/`VIAL_ENABLE` rules (set in bundle.ts).

import type { Diagnostic } from '../diagnostics'
import { materializeMatrix } from '../matrix'
import { buildViaDefinition } from './viaJson'
import type { ConfigKeymap } from '../types'

export interface VialJsonResult {
    /** The `vial.json` definition object (VIA KLE keymap + encoder flags). */
    json: Record<string, unknown>
    /** The vial keymap's `config.h` body (UID + unlock combo). */
    configH: string
    diagnostics: Diagnostic[]
}

const hexByte = (n: number): string =>
    `0x${(n & 0xff).toString(16).toUpperCase().padStart(2, '0')}`

/** A deterministic placeholder UID (derived from the keyboard id) used when the
 *  builder hasn't generated one, so the export still compiles — the user must set
 *  a real, unique UID before shipping. */
function placeholderUid(config: ConfigKeymap): number[] {
    const id = config.keyboard.id || config.meta.name || 'remappr'
    return Array.from({ length: 8 }, (_v, i) => {
        let h = 0
        for (let j = 0; j < id.length; j++)
            h = (h * 31 + id.charCodeAt(j)) & 0xff
        return (h + i * 37) & 0xff
    })
}

/** Build the vial keymap's `config.h` body from the security config. */
function buildConfigH(
    config: ConfigKeymap,
    warn: (m: string, p?: (string | number)[]) => void,
): string {
    const vial = config.keyboard.vial
    const uid = vial?.uid?.length === 8 ? vial.uid : placeholderUid(config)
    if (vial?.uid?.length !== 8)
        warn(
            'Vial keyboard UID not set — emitted a placeholder; generate a unique 8-byte UID in the builder before shipping',
            ['keyboard', 'vial', 'uid'],
        )

    const lines = [
        `#pragma once`,
        ``,
        `// remappr — Vial security identity.`,
        `#define VIAL_KEYBOARD_UID {${uid.map(hexByte).join(', ')}}`,
        ``,
    ]

    const unlock = vial?.unlockKeys ?? []
    if (vial?.insecure || unlock.length === 0) {
        if (!vial?.insecure)
            warn(
                'Vial unlock combo not set — built with VIAL_INSECURE (no unlock required); pick unlock keys in the builder to secure the board',
                ['keyboard', 'vial', 'unlockKeys'],
            )
        lines.push(`// No unlock combo — keymap is exposed without unlocking.`)
        lines.push(`#define VIAL_INSECURE`, ``)
    } else {
        const rows = unlock.map(([r]) => r).join(', ')
        const cols = unlock.map(([, c]) => c).join(', ')
        lines.push(
            `#define VIAL_UNLOCK_COMBO_ROWS {${rows}}`,
            `#define VIAL_UNLOCK_COMBO_COLS {${cols}}`,
            ``,
        )
    }
    return lines.join('\n')
}

/** Build the Vial definition (`vial.json`) + keymap `config.h` + diagnostics. */
export function buildVialJson(config: ConfigKeymap): VialJsonResult {
    const { json, diagnostics } = buildViaDefinition(config, {
        encoderFlags: true,
    })
    const warn = (message: string, path: (string | number)[] = []): void => {
        diagnostics.push({ level: 'warn', message, path })
    }
    // Warn if the unlock combo references a matrix cell outside the board.
    const dims = materializeMatrix(config).keyboard.matrix
    for (const [r, c] of config.keyboard.vial?.unlockKeys ?? [])
        if (dims && (r >= dims.rows || c >= dims.cols))
            warn(
                `Vial unlock key [${r},${c}] is outside the ${dims.rows}×${dims.cols} matrix`,
                ['keyboard', 'vial', 'unlockKeys'],
            )

    const configH = buildConfigH(config, warn)
    return { json, configH, diagnostics }
}
