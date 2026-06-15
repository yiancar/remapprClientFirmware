// pattern-check: skip pure CanonVial text (de)serializers, no abstraction (moved out of the builder UI)
// Text <-> data conversion for a config's Vial security identity (CanonVial):
// the 8-byte keyboard UID and the row/col unlock combo. Lives in the firmware
// layer next to CanonVial (types.ts) because the shapes (8 bytes 0–255, [row,col]
// pairs) are Vial-domain facts emitted to the vial keymap's config.h, not UI.

/** Format a UID byte array as space-separated `0xNN` hex (empty string if none). */
export function uidToHex(uid?: number[]): string {
    return (uid ?? [])
        .map(
            (b) =>
                '0x' + (b & 0xff).toString(16).toUpperCase().padStart(2, '0'),
        )
        .join(' ')
}

/** Parse 8 hex/decimal bytes from free text; undefined unless exactly 8 valid. */
export function parseUid(s: string): number[] | undefined {
    const bytes = s
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((t) => Number(t))
    return bytes.length === 8 &&
        bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)
        ? bytes
        : undefined
}

/** A fresh random 8-byte keyboard UID. */
export function randomUid(): number[] {
    return Array.from({ length: 8 }, () => Math.floor(Math.random() * 256))
}

/** Format an unlock combo as space-separated `row,col` pairs. */
export function unlockToText(keys?: [number, number][]): string {
    return (keys ?? []).map(([r, c]) => `${r},${c}`).join(' ')
}

/** Parse "r,c r,c …" into matrix positions, dropping malformed entries. */
export function parseUnlock(s: string): [number, number][] {
    return s
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p.split(',').map(Number) as [number, number])
        .filter(
            ([r, c]) =>
                Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0,
        )
}
