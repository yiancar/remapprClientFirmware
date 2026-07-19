// ZMK Studio lighting facade: capability-driven range/effect translation plus
// an explicit preview transaction (set → save/discard). No preview write touches
// persistent storage; only save() invokes the firmware's persistence command.
import {
    check_lighting_unsaved_changes,
    discard_lighting_changes,
    get_lighting_state,
    save_lighting_changes,
    set_lighting_preview_state,
    type LightingCapabilities,
    type LightingNotification,
    type LightingScalarRange,
    type LightingState,
    type LightingTargetState,
    type RpcConnection,
} from '@yiancar/zmk-studio-ts-client'

import { ProtocolError } from '@firmware/errors'
import type { LightingCatalog } from '@firmware/lighting'
import type { RgbApi, RgbEffectState } from '@firmware/service'

const NORMALIZED_MAX = 255

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function toNormalized(
    value: number,
    range: LightingScalarRange | undefined,
): number {
    if (!range || range.max <= range.min) {
        return clamp(Math.round(value), 0, NORMALIZED_MAX)
    }
    const bounded = clamp(value, range.min, range.max)
    return Math.round(
        ((bounded - range.min) * NORMALIZED_MAX) / (range.max - range.min),
    )
}

function fromNormalized(
    value: number,
    range: LightingScalarRange | undefined,
    fallback: number,
): number {
    if (!range || range.max < range.min) return fallback
    if (range.max === range.min) return range.min

    const raw =
        range.min +
        (clamp(value, 0, NORMALIZED_MAX) / NORMALIZED_MAX) *
            (range.max - range.min)
    const step = range.step > 0 ? range.step : 1
    const stepped = range.min + Math.round((raw - range.min) / step) * step
    return clamp(stepped, range.min, range.max)
}

function requireState(
    targetState: LightingTargetState,
    operation: string,
): LightingState {
    if (!targetState.state) {
        throw new ProtocolError(`ZMK lighting ${operation} returned no state`)
    }
    return targetState.state
}

export interface ZmkRgbController {
    readonly api: RgbApi
    handleNotification(notification: LightingNotification): void
}

export function createZmkRgbController(
    connection: RpcConnection,
    capabilities: LightingCapabilities,
): ZmkRgbController {
    const effectIds = capabilities.effects.map((effect) => effect.id)
    const effectCatalog: LightingCatalog = {
        kind: 'zmk_underglow',
        effects: capabilities.effects.map((effect) => effect.displayName),
        hasColor: !!capabilities.hue && !!capabilities.saturation,
        hasSpeed: !!capabilities.speed,
    }

    let currentState: LightingState | null = null
    let pendingChanges = false
    const pendingListeners = new Set<(pending: boolean) => void>()
    const effectListeners = new Set<(state: RgbEffectState) => void>()

    const markPending = (pending: boolean): void => {
        if (pendingChanges === pending) return
        pendingChanges = pending
        for (const listener of pendingListeners) listener(pending)
    }

    const toRgbEffectState = (state: LightingState): RgbEffectState => {
        const effectIndex = effectIds.indexOf(state.effect)
        const brightness = toNormalized(state.brightness, capabilities.brightness)
        return {
            enabled: capabilities.supportsOnOff ? state.on : undefined,
            mode: effectIndex >= 0 ? effectIndex : 0,
            brightness,
            speed: toNormalized(state.speed, capabilities.speed),
            color: {
                h: toNormalized(state.hue, capabilities.hue),
                s: toNormalized(state.saturation, capabilities.saturation),
                v: brightness,
            },
        }
    }

    const rememberState = (state: LightingState): RgbEffectState => {
        currentState = { ...state }
        const normalized = toRgbEffectState(state)
        for (const listener of effectListeners) listener(normalized)
        return normalized
    }

    const readState = async (): Promise<LightingState> => {
        const targetState = await get_lighting_state(
            connection,
            capabilities.target,
        )
        const state = requireState(targetState, 'get state')
        currentState = { ...state }
        return state
    }

    const api: RgbApi = {
        effectCatalog,
        async getEffect(): Promise<RgbEffectState> {
            return rememberState(await readState())
        },
        async setEffect(state: RgbEffectState): Promise<void> {
            const baseline = currentState ?? (await readState())
            const effect = effectIds[state.mode] ?? baseline.effect
            const preview: LightingState = {
                on: capabilities.supportsOnOff
                    ? (state.enabled ?? baseline.on)
                    : baseline.on,
                hue: fromNormalized(
                    state.color.h,
                    capabilities.hue,
                    baseline.hue,
                ),
                saturation: fromNormalized(
                    state.color.s,
                    capabilities.saturation,
                    baseline.saturation,
                ),
                brightness: fromNormalized(
                    state.brightness,
                    capabilities.brightness,
                    baseline.brightness,
                ),
                effect,
                speed: fromNormalized(
                    state.speed,
                    capabilities.speed,
                    baseline.speed,
                ),
            }
            const result = await set_lighting_preview_state(
                connection,
                capabilities.target,
                preview,
            )
            rememberState(requireState(result, 'set preview state'))
            // A preview identical to the saved baseline is not dirty, so do not
            // guess here. This read is RAM-only and avoids a false Save state
            // without adding any persistent-memory writes.
            markPending(await check_lighting_unsaved_changes(connection))
        },
        async save(): Promise<void> {
            if (!(await save_lighting_changes(connection))) {
                throw new ProtocolError('ZMK lighting save failed')
            }
            markPending(false)
        },
        async discard(): Promise<RgbEffectState> {
            const result = await discard_lighting_changes(connection)
            const state = rememberState(requireState(result, 'discard changes'))
            markPending(false)
            return state
        },
        hasPendingChanges: () => pendingChanges,
        async refreshPendingChanges(): Promise<boolean> {
            const pending = await check_lighting_unsaved_changes(connection)
            markPending(pending)
            return pending
        },
        onPendingChangesChanged(cb): () => void {
            pendingListeners.add(cb)
            return () => pendingListeners.delete(cb)
        },
        onEffectChanged(cb): () => void {
            effectListeners.add(cb)
            return () => effectListeners.delete(cb)
        },
    }

    return {
        api,
        handleNotification(notification): void {
            const changed = notification.stateChanged
            if (
                changed?.target === capabilities.target &&
                changed.state !== undefined
            ) {
                rememberState(changed.state)
            }
            if (notification.unsavedChangesStatusChanged !== undefined) {
                markPending(notification.unsavedChangesStatusChanged)
            }
        },
    }
}
