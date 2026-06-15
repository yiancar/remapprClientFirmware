// Pattern check: no GoF pattern (-) — rejected — pure functions implementing the public KLE (keyboard-layout-editor) serial JSON format; mechanical move from qmk-vial/keyboardDef.ts.
// Shared KLE deserializer used by Vial (protocol-fetched defs) and QMK/VIA (sideload + GitHub registry).
//
// The LABEL_MAP table and the deserialize cluster-walk derive from kle-serial
// (https://github.com/ijprest/kle-serial) — MIT License, Copyright (c) Ian Prest.

import { ProtocolError } from '@firmware/errors'
import type { EncoderSlot, PhysicalLayoutKey } from '@firmware/types'

export interface RawKeyboardDef {
    name?: string
    vendorId?: string
    productId?: string
    matrix: { rows: number; cols: number }
    layouts: { keymap: unknown[]; labels?: unknown[]; optionKeys?: unknown }
    customKeycodes?: VialCustomKeycode[]
    vial?: { vibl?: boolean; midi?: unknown }
    lighting?: unknown
    menus?: unknown
}

export interface VialCustomKeycode {
    name: string
    title: string
    shortName: string
}

export interface ParsedKeyboardDef {
    name: string
    rows: number
    cols: number
    layoutKeys: PhysicalLayoutKey[]
    rowColMap: { row: number; col: number }[]
    encoderSlots: EncoderSlot[]
    encoderIndices: number[]
    customKeycodes: VialCustomKeycode[]
    raw: RawKeyboardDef
}

export function validateDef(json: unknown): RawKeyboardDef {
    if (!json || typeof json !== 'object') {
        throw new ProtocolError('Keyboard def: not an object')
    }
    const obj = json as Record<string, unknown>
    const matrix = obj.matrix as { rows?: unknown; cols?: unknown } | undefined
    const layouts = obj.layouts as
        | { keymap?: unknown; labels?: unknown }
        | undefined
    if (
        !matrix ||
        typeof matrix.rows !== 'number' ||
        typeof matrix.cols !== 'number'
    ) {
        throw new ProtocolError('Keyboard def: missing matrix.rows/cols')
    }
    if (!layouts || !Array.isArray(layouts.keymap)) {
        throw new ProtocolError('Keyboard def: missing layouts.keymap')
    }
    return obj as unknown as RawKeyboardDef
}

interface KleKey {
    x: number
    y: number
    width: number
    height: number
    rotation_x: number
    rotation_y: number
    rotation_angle: number
    decal: boolean
    labels: (string | null)[]
}

const LABEL_MAP: number[][] = [
    [0, 6, 2, 8, 9, 11, 3, 5, 1, 4, 7, 10],
    [1, 7, -1, -1, 9, 11, 4, -1, -1, -1, -1, 10],
    [3, -1, 5, -1, 9, 11, -1, -1, 4, -1, -1, 10],
    [4, -1, -1, -1, 9, 11, -1, -1, -1, -1, -1, 10],
    [0, 6, 2, 8, 10, -1, 3, 5, 1, 4, 7, -1],
    [1, 7, -1, -1, 10, -1, 4, -1, -1, -1, -1, -1],
    [3, -1, 5, -1, 10, -1, -1, -1, 4, -1, -1, -1],
    [4, -1, -1, -1, 10, -1, -1, -1, -1, -1, -1, -1],
]

function reorderLabels(labels: string[], align: number): (string | null)[] {
    const out: (string | null)[] = new Array(12).fill(null)
    const map = LABEL_MAP[align] ?? LABEL_MAP[4]
    for (let i = 0; i < labels.length && i < map.length; i++) {
        const target = map[i]
        if (target >= 0 && labels[i]) out[target] = labels[i]
    }
    return out
}

function makeBlankKey(): KleKey {
    return {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation_x: 0,
        rotation_y: 0,
        rotation_angle: 0,
        decal: false,
        labels: [],
    }
}

function deserializeKle(rows: unknown[]): KleKey[] {
    const current = makeBlankKey()
    let clusterX = 0
    let clusterY = 0
    let align = 4
    const keys: KleKey[] = []

    for (let r = 0; r < rows.length; r++) {
        const row = rows[r]
        if (!Array.isArray(row)) continue
        for (let k = 0; k < row.length; k++) {
            const item = row[k]
            if (typeof item === 'string') {
                const newKey: KleKey = {
                    x: current.x,
                    y: current.y,
                    width: current.width,
                    height: current.height,
                    rotation_x: current.rotation_x,
                    rotation_y: current.rotation_y,
                    rotation_angle: current.rotation_angle,
                    decal: current.decal,
                    labels: reorderLabels(item.split('\n'), align),
                }
                keys.push(newKey)
                current.x += current.width
                current.width = 1
                current.height = 1
                current.decal = false
            } else if (item && typeof item === 'object') {
                const it = item as Record<string, unknown>
                if (typeof it.r === 'number') current.rotation_angle = it.r
                if (typeof it.rx === 'number') {
                    current.rotation_x = it.rx
                    clusterX = it.rx
                    current.x = clusterX
                    current.y = clusterY
                }
                if (typeof it.ry === 'number') {
                    current.rotation_y = it.ry
                    clusterY = it.ry
                    current.x = clusterX
                    current.y = clusterY
                }
                if (typeof it.a === 'number') align = it.a
                if (typeof it.x === 'number') current.x += it.x
                if (typeof it.y === 'number') current.y += it.y
                if (typeof it.w === 'number') current.width = it.w
                if (typeof it.h === 'number') current.height = it.h
                if (typeof it.d === 'boolean') current.decal = it.d
            }
        }
        current.y += 1
        current.x = current.rotation_x
    }
    return keys
}

export function parseKeyboardDef(def: RawKeyboardDef): ParsedKeyboardDef {
    const kleKeys = deserializeKle(def.layouts.keymap)
    const layoutKeys: PhysicalLayoutKey[] = []
    const rowColMap: { row: number; col: number }[] = []
    const encoderSlots: EncoderSlot[] = []
    const encoderIndices: number[] = []

    // Renderer divides PhysicalLayoutKey x/y/w/h/r/rx/ry by 100 (centi-units,
    // matching ZMK's native protocol). KLE values are float u-units, so scale ×100.
    const SCALE = 100
    for (const key of kleKeys) {
        const tag = key.labels[0] ?? ''
        const isEncoder = key.labels[4] === 'e'
        if (isEncoder) {
            const [idxStr] = tag.split(',')
            const idx = Number.parseInt(idxStr ?? '', 10)
            if (!Number.isFinite(idx)) continue
            if (!encoderIndices.includes(idx)) {
                encoderIndices.push(idx)
                encoderSlots.push({
                    x: key.x * SCALE,
                    y: key.y * SCALE,
                })
            }
            continue
        }
        if (key.decal) continue
        if (!tag.includes(',')) continue
        const [rStr, cStr] = tag.split(',')
        const row = Number.parseInt(rStr, 10)
        const col = Number.parseInt(cStr, 10)
        if (!Number.isFinite(row) || !Number.isFinite(col)) continue
        if (row < 0 || row >= def.matrix.rows) continue
        if (col < 0 || col >= def.matrix.cols) continue
        const layoutKey: PhysicalLayoutKey = {
            x: key.x * SCALE,
            y: key.y * SCALE,
            w: key.width * SCALE,
            h: key.height * SCALE,
        }
        if (key.rotation_angle) layoutKey.r = key.rotation_angle * SCALE
        if (key.rotation_x) layoutKey.rx = key.rotation_x * SCALE
        if (key.rotation_y) layoutKey.ry = key.rotation_y * SCALE
        layoutKeys.push(layoutKey)
        rowColMap.push({ row, col })
    }

    return {
        name: def.name ?? 'Keyboard',
        rows: def.matrix.rows,
        cols: def.matrix.cols,
        layoutKeys,
        rowColMap,
        encoderSlots,
        encoderIndices,
        customKeycodes: def.customKeycodes ?? [],
        raw: def,
    }
}
