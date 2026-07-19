// ZMK adapter capability probe: new firmware exposes RGB; older Studio firmware
// remains fully connectable with the optional facade absent.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
    LightingCapabilities,
    Notification,
    Request,
    RequestResponse,
    RpcConnection,
} from '@yiancar/zmk-studio-ts-client'
import type { Transport } from '@firmware/transport'

const rpc = vi.hoisted(() => ({
    call: vi.fn(),
    check: vi.fn(),
    createConnection: vi.fn(),
    discard: vi.fn(),
    getState: vi.fn(),
    save: vi.fn(),
    setPreview: vi.fn(),
    tryCapabilities: vi.fn(),
}))

vi.mock('@yiancar/zmk-studio-ts-client', () => ({
    call_rpc: rpc.call,
    check_lighting_unsaved_changes: rpc.check,
    create_rpc_connection: rpc.createConnection,
    discard_lighting_changes: rpc.discard,
    get_lighting_state: rpc.getState,
    LightingTarget: {
        LIGHTING_TARGET_UNDERGLOW: 1,
    },
    save_lighting_changes: rpc.save,
    set_lighting_preview_state: rpc.setPreview,
    try_get_lighting_capabilities: rpc.tryCapabilities,
}))

// ZmkKeyboardService needs these generated enums at runtime. Keep this adapter
// unit test independent of Node ESM's inability to resolve ts-proto's
// extensionless `protobufjs/minimal` import; build/typecheck exercise the real
// published modules separately.
vi.mock('@yiancar/zmk-studio-ts-client/keymap', () => ({
    SaveChangesErrorCode: {
        SAVE_CHANGES_ERR_NO_SPACE: 0,
        SAVE_CHANGES_ERR_NOT_SUPPORTED: 1,
    },
}))

vi.mock('@yiancar/zmk-studio-ts-client/core', () => ({
    LockState: {
        ZMK_STUDIO_CORE_LOCK_STATE_LOCKED: 0,
        ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED: 1,
    },
}))

import { zmkAdapter } from './adapter'

function makeConnection(): RpcConnection {
    return {
        label: 'ZMK test',
        request_response_readable: new ReadableStream<RequestResponse>(),
        request_writable: new WritableStream<Request>(),
        notification_readable: new ReadableStream<Notification>(),
        current_request: 0,
    }
}

function makeTransport(): Transport {
    return {
        label: 'ZMK test',
        readable: new ReadableStream<Uint8Array>(),
        writable: new WritableStream<Uint8Array>(),
        abortController: new AbortController(),
    }
}

const capabilities: LightingCapabilities = {
    target: 1 as LightingCapabilities['target'],
    supportsOnOff: true,
    hue: { min: 0, max: 359, step: 1 },
    saturation: { min: 0, max: 100, step: 1 },
    brightness: { min: 0, max: 100, step: 1 },
    speed: { min: 1, max: 5, step: 1 },
    effects: [{ id: 0, displayName: 'Solid' }],
}

describe('zmk/adapter — optional lighting capability', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        rpc.createConnection.mockImplementation(() => makeConnection())
        rpc.call.mockResolvedValue({
            core: { getDeviceInfo: { name: 'ZMK test' } },
        })
    })

    it('keeps older Studio firmware connectable without RGB', async () => {
        rpc.tryCapabilities.mockResolvedValue(undefined)
        const transport = makeTransport()

        await expect(
            zmkAdapter.canHandle(transport, { transportKind: 'serial' }),
        ).resolves.toMatchObject({ ok: true })
        const service = await zmkAdapter.connect(
            transport,
            new AbortController().signal,
        )

        expect(rpc.tryCapabilities).toHaveBeenCalledWith(
            expect.anything(),
            1,
        )
        expect(service.rgb).toBeUndefined()
        await service.disconnect()
    })

    it('exposes RGB when underglow capabilities are advertised', async () => {
        rpc.tryCapabilities.mockResolvedValue(capabilities)
        const transport = makeTransport()

        await zmkAdapter.canHandle(transport, { transportKind: 'serial' })
        const service = await zmkAdapter.connect(
            transport,
            new AbortController().signal,
        )

        expect(service.rgb?.effectCatalog?.kind).toBe('zmk_underglow')
        await service.disconnect()
    })
})
