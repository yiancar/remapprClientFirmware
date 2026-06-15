// Pattern check: Adapter (Tier 1) — extended — backs src/firmware/adapter.ts FirmwareAdapter; translates ZMK GetBehaviorDetailsResponse → neutral ActionType.
import type {
    BehaviorParameterValueDescription,
    GetBehaviorDetailsResponse,
} from '@zmkfirmware/zmk-studio-ts-client/behaviors'
import type { ActionSlot, ActionSlotKind, ActionType } from '@firmware/types'
import { hidUsagePageAndIdFromUsage } from '@/lib/actions/hidUsages'

const MODIFIER_DISPLAY_NAME = 'Modifier'

function describeSlotKind(
    behaviorDisplayName: string,
    descriptions: BehaviorParameterValueDescription[],
): ActionSlotKind {
    if (behaviorDisplayName === MODIFIER_DISPLAY_NAME) return 'modifier'
    if (descriptions.some((d) => d.hidUsage)) return 'hid'
    if (descriptions.some((d) => d.layerId)) return 'layer'
    if (descriptions.some((d) => d.range)) return 'number'
    if (descriptions.some((d) => d.constant !== undefined)) return 'enum'
    return 'enum'
}

function buildSlot(
    label: string,
    behaviorDisplayName: string,
    descriptions: BehaviorParameterValueDescription[],
): ActionSlot | undefined {
    if (!descriptions || descriptions.length === 0) return undefined
    const onlyNil =
        descriptions.length === 1 &&
        descriptions[0].nil !== undefined &&
        descriptions[0].constant === undefined
    if (onlyNil) return undefined

    const kind = describeSlotKind(behaviorDisplayName, descriptions)
    const namedLabel = descriptions[0]?.name?.toString().trim()
    const slot: ActionSlot = {
        label: namedLabel && namedLabel.length > 0 ? namedLabel : label,
        kind,
    }

    const range = descriptions.find((d) => d.range)?.range
    if (range) slot.range = { min: range.min, max: range.max }

    const enumValues = descriptions
        .filter((d) => d.constant !== undefined)
        .map((d) => ({ value: d.constant as number, label: d.name }))
    if (enumValues.length > 0) slot.values = enumValues

    return slot
}

export function behaviorToActionType(
    behavior: GetBehaviorDetailsResponse,
): ActionType {
    const slots: ActionSlot[] = []
    const meta = behavior.metadata?.[0]
    if (meta) {
        const p1 = buildSlot('param1', behavior.displayName, meta.param1)
        if (p1) slots.push(p1)
        const p2 = buildSlot('param2', behavior.displayName, meta.param2)
        if (p2) slots.push(p2)
    }
    if (slots.length === 2) {
        slots[0] = { ...slots[0], label: 'Hold' }
        slots[1] = { ...slots[1], label: 'Tap' }
    }
    return {
        id: String(behavior.id),
        displayName: behavior.displayName,
        slots,
    }
}

export function behaviorsToActionTypes(
    behaviors: Record<number, GetBehaviorDetailsResponse>,
): ActionType[] {
    return Object.values(behaviors).map(behaviorToActionType)
}

export function validateSlotValue(
    layerIds: number[],
    value: number | undefined,
    descriptions?: BehaviorParameterValueDescription[],
): boolean {
    if (value === undefined) {
        return (
            descriptions === undefined ||
            descriptions.length === 0 ||
            !!descriptions[0].nil
        )
    }
    const matching = descriptions?.find((v) => {
        if (v.constant !== undefined) return v.constant === value
        if (v.range) return value >= v.range.min && value <= v.range.max
        if (v.hidUsage) {
            const [page, id] = hidUsagePageAndIdFromUsage(value)
            return page !== 0 && id !== 0
        }
        if (v.layerId) return layerIds.includes(value)
        if (v.nil) return value === 0
        return false
    })
    return (
        !!matching ||
        (value === 0 && (!descriptions || descriptions.length === 0))
    )
}
