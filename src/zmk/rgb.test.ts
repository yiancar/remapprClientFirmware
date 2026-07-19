// ZMK lighting facade tests: normalized UI values, capability-driven effect IDs,
// preview persistence boundaries, and notification-backed pending state.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
    LightingCapabilities,
    LightingState,
    RpcConnection,
} from '@yiancar/zmk-studio-ts-client'

import { ProtocolError } from '@firmware/errors'

const rpc = vi.hoisted(() => ({
    check: vi.fn(),
    discard: vi.fn(),
    getState: vi.fn(),
    save: vi.fn(),
    setPreview: vi.fn(),
}))

vi.mock('@yiancar/zmk-studio-ts-client', () => ({
    check_lighting_unsaved_changes: rpc.check,
    discard_lighting_changes: rpc.discard,
    get_lighting_state: rpc.getState,
    save_lighting_changes: rpc.save,
    set_lighting_preview_state: rpc.setPreview,
}))

import { createZmkRgbController } from './rgb'

const connection = {} as RpcConnection
const target = 1 as LightingCapabilities['target']
const capabilities: LightingCapabilities = {
    target,
    supportsOnOff: true,
    hue: { min: 0, max: 359, step: 1 },
    saturation: { min: 0, max: 100, step: 1 },
    brightness: { min: 0, max: 100, step: 1 },
    speed: { min: 1, max: 5, step: 1 },
    effects: [
        { id: 10, displayName: 'Solid' },
        { id: 30, displayName: 'Swirl' },
    ],
}
const baseline: LightingState = {
    on: true,
    hue: 180,
    saturation: 50,
    brightness: 25,
    effect: 30,
    speed: 3,
}

describe('zmk/rgb — Studio lighting facade', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        rpc.getState.mockResolvedValue({ target, state: baseline })
        rpc.setPreview.mockImplementation(
            (_connection, _target, state: LightingState) =>
                Promise.resolve({ target, state }),
        )
        rpc.save.mockResolvedValue(true)
        rpc.discard.mockResolvedValue({ target, state: baseline })
        rpc.check.mockResolvedValue(false)
    })

    it('builds its catalog from advertised effects and normalizes ranges', async () => {
        const { api } = createZmkRgbController(connection, capabilities)

        expect(api.effectCatalog).toEqual({
            kind: 'zmk_underglow',
            effects: ['Solid', 'Swirl'],
            hasColor: true,
            hasSpeed: true,
        })
        await expect(api.getEffect!()).resolves.toEqual({
            enabled: true,
            mode: 1,
            brightness: 64,
            speed: 128,
            color: { h: 128, s: 128, v: 64 },
        })
        expect(rpc.getState).toHaveBeenCalledWith(connection, target)
    })

    it('converts normalized edits into an immediate preview without saving', async () => {
        const { api } = createZmkRgbController(connection, capabilities)
        rpc.check.mockResolvedValue(true)
        await api.getEffect!()

        await api.setEffect!({
            enabled: false,
            mode: 0,
            brightness: 255,
            speed: 0,
            color: { h: 255, s: 0, v: 255 },
        })

        expect(rpc.setPreview).toHaveBeenCalledWith(connection, target, {
            on: false,
            hue: 359,
            saturation: 0,
            brightness: 100,
            effect: 10,
            speed: 1,
        })
        expect(rpc.save).not.toHaveBeenCalled()
        expect(api.hasPendingChanges!()).toBe(true)
    })

    it('saves and discards through the lighting transaction only', async () => {
        const { api } = createZmkRgbController(connection, capabilities)
        const pending: boolean[] = []
        api.onPendingChangesChanged!((value) => pending.push(value))
        rpc.check.mockResolvedValue(true)

        await api.setEffect!({
            enabled: true,
            mode: 0,
            brightness: 128,
            speed: 255,
            color: { h: 0, s: 255, v: 128 },
        })
        await api.save()

        expect(rpc.save).toHaveBeenCalledWith(connection)
        expect(api.hasPendingChanges!()).toBe(false)

        await api.setEffect!({
            enabled: false,
            mode: 1,
            brightness: 0,
            speed: 0,
            color: { h: 0, s: 0, v: 0 },
        })
        await expect(api.discard!()).resolves.toMatchObject({
            enabled: true,
            mode: 1,
        })
        expect(rpc.discard).toHaveBeenCalledWith(connection)
        expect(api.hasPendingChanges!()).toBe(false)
        expect(pending).toEqual([true, false, true, false])
    })

    it('preserves false dirty status and follows lighting notifications', async () => {
        const controller = createZmkRgbController(connection, capabilities)
        const pending: boolean[] = []
        const effects: number[] = []
        controller.api.onPendingChangesChanged!((value) =>
            pending.push(value),
        )
        controller.api.onEffectChanged!((state) => effects.push(state.mode))

        await expect(
            controller.api.refreshPendingChanges!(),
        ).resolves.toBe(false)
        controller.handleNotification({
            stateChanged: {
                target,
                state: { ...baseline, effect: 10 },
            },
            unsavedChangesStatusChanged: true,
        })
        controller.handleNotification({
            unsavedChangesStatusChanged: false,
        })

        expect(pending).toEqual([true, false])
        expect(effects).toEqual([0])
    })

    it('surfaces rejected saves and malformed state responses', async () => {
        const { api } = createZmkRgbController(connection, capabilities)
        rpc.save.mockResolvedValue(false)
        await expect(api.save()).rejects.toBeInstanceOf(ProtocolError)

        rpc.getState.mockResolvedValue({ target, state: undefined })
        await expect(api.getEffect!()).rejects.toThrow('returned no state')
    })
})
