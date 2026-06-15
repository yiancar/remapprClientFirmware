// Pattern check: no GoF pattern (-) — rejected — module-level Map memoization for hot-path O(1) lookup; not Singleton (no encapsulation/lifecycle), no abstraction.
// import { UsagePages } from "./data/HidUsageTables-1.5.json";
// Filtered with `cat src/HidUsageTables-1.5.json | jq '{ UsagePages: [.UsagePages[] | select([.Id] |inside([7, 12]))] }' > src/keyboard-and-consumer-usage-tables.json`
import { UsagePages } from '@/data/keyboard-and-consumer-usage-tables.json'
import HidOverrides from '@firmware/catalog/hid-pages/overrides.json'
import { abbreviateKeyName } from '@/lib/keyAbbreviations'

interface HidLabels {
    short?: string
    med?: string
    long?: string
}

const overrides: Record<string, Record<string, HidLabels>> = HidOverrides

export interface UsageId {
    Id: number
    Name: string
}

export interface UsagePageInfo {
    Id: number
    Name: string
    UsageIds: UsageId[]
}

const pagesById = new Map<number, UsagePageInfo>(
    UsagePages.map((p: UsagePageInfo): [number, UsagePageInfo] => [p.Id, p]),
)

export const hidUsageFromPageAndId = (page: number, id: number): number =>
    (page << 16) + id

export const hidUsagePageAndIdFromUsage = (usage: number): [number, number] => [
    (usage >> 16) & 0xffff,
    usage & 0xffff,
]

export const hid_usage_get_labels = (
    usage_page: number,
    usage_id: number,
): {
    short?: string
    med?: string
    long?: string
} =>
    overrides[usage_page.toString()]?.[usage_id.toString()] || {
        short: pagesById
            .get(usage_page)
            ?.UsageIds?.find((u: UsageId): boolean => u.Id === usage_id)?.Name,
    }

/**
 * Resolve a HID usage to its short display glyph (e.g. "Q", "Tab", "Esc").
 * The single source of truth shared by `HidUsageLabel` (live caps) and the
 * device-preview snapshot (serializable cached legends) so both stay in sync.
 * Strips the leading "Keyboard " noun and abbreviates to `maxLength` chars.
 */
export const usageGlyph = (usage: number, maxLength = 5): string => {
    const [page, id] = hidUsagePageAndIdFromUsage(usage)
    const short = hid_usage_get_labels(page & 0xff, id).short?.replace(
        /^Keyboard /,
        '',
    )
    return short ? abbreviateKeyName(short, maxLength) : ''
}

// Implicit modifiers packed in a HID usage's high byte (bits 24–31). Maps each
// set L/R pair to a friendly name (Ctrl/Shift/Alt/Gui), deduped — feeds the cap's
// chord chips.
const USAGE_MOD_BITS: Array<[number, string]> = [
    [0x01, 'Ctrl'],
    [0x02, 'Shift'],
    [0x04, 'Alt'],
    [0x08, 'Gui'],
    [0x10, 'Ctrl'],
    [0x20, 'Shift'],
    [0x40, 'Alt'],
    [0x80, 'Gui'],
]
export const usageModifierNames = (usage: number): string[] => {
    const flags = (usage >> 24) & 0xff
    if (!flags) return []
    return [
        ...new Set(USAGE_MOD_BITS.filter(([b]) => flags & b).map(([, n]) => n)),
    ]
}
