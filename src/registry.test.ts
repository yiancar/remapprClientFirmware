// Pattern check: no GoF pattern (-) — rejected — regression test; builds fake
// adapters and asserts pickAdapter's HID VID-specificity ordering, no abstraction.
//
// Regression for "No firmware adapter handled the device" on a Remappr USB
// keyboard: a Transport's byte streams are single-use, so a non-owning adapter's
// probe (VIA's createHidClientFromTransport / ZMK's pipeThrough) can lock or
// abort them before the owning adapter is tried. pickAdapter must probe the
// VID-owning adapter first over HID and never let a guaranteed-miss specific
// adapter probe at all.
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { FirmwareAdapter } from './adapter'
import type { Transport } from './transport'

beforeEach(() => vi.resetModules())

// Fresh registry module per test (module-level `adapters` array starts empty —
// the production glob that auto-registers real adapters is not imported here).
async function freshRegistry(): Promise<typeof import('./registry')> {
    return await import('./registry')
}

function hidTransport(vid: number): Transport {
    return {
        label: `Fake · ${vid.toString(16).padStart(4, '0')}:0001`,
        vid,
        pid: 1,
        abortController: new AbortController(),
        readable: new ReadableStream<Uint8Array>(),
        writable: new WritableStream<Uint8Array>(),
    } as unknown as Transport
}

function bleTransport(firmwareAdapterId: string): Transport {
    return {
        label: 'Fake BLE',
        firmwareAdapterId,
        abortController: new AbortController(),
        readable: new ReadableStream<Uint8Array>(),
        writable: new WritableStream<Uint8Array>(),
    } as unknown as Transport
}

// A generic (usage-page-only, no vendorIds) adapter that DESTROYS the shared
// transport on probe — the real VIA failure mode that used to strand a later
// specific adapter.
function destructiveGeneric(id: string): FirmwareAdapter {
    return {
        id,
        displayName: id,
        discovery: { hid: { usagePage: 0xff60, usage: 0x61 } },
        async canHandle(t: Transport) {
            t.abortController.abort()
            return { ok: false as const, reason: 'not me' }
        },
        async connect() {
            throw new Error('unused')
        },
    }
}

// A VID-specific adapter that only succeeds on a live (un-aborted) transport —
// mirrors Remappr's createRemapprRpc().getReader() throwing on a dead stream.
function vidSpecific(id: string, vid: number): FirmwareAdapter {
    return {
        id,
        displayName: id,
        discovery: { hid: { vendorIds: [vid], usagePage: 0xff00, usage: 1 } },
        async canHandle(t: Transport) {
            if (t.abortController.signal.aborted) {
                return { ok: false as const, reason: 'transport already dead' }
            }
            return { ok: true as const, deviceInfo: { name: id, firmware: id } }
        },
        async connect() {
            throw new Error('unused')
        },
    }
}

describe('pickAdapter — HID VID specificity', () => {
    it('picks the VID-owning adapter ahead of a destructive generic one, even when the generic is registered first', async () => {
        const { registerAdapter, pickAdapter } = await freshRegistry()
        registerAdapter(destructiveGeneric('via-generic'))
        registerAdapter(vidSpecific('remappr-like', 0x1209))

        const t = hidTransport(0x1209)
        const winner = await pickAdapter(t, { transportKind: 'hid' })

        expect(winner?.id).toBe('remappr-like')
        expect(t.abortController.signal.aborted).toBe(false) // generic never probed
    })

    it('does not probe a specific adapter on a foreign-VID device, so the generic handler still wins', async () => {
        const { registerAdapter, pickAdapter } = await freshRegistry()
        // A specific adapter for 0x1209 that would abort if probed, plus a generic
        // handler. On a 0x3434 device the specific one must be skipped entirely.
        registerAdapter({
            ...vidSpecific('remappr-like', 0x1209),
            async canHandle(t: Transport) {
                t.abortController.abort()
                return {
                    ok: false as const,
                    reason: 'wrong vid, should not run',
                }
            },
        })
        registerAdapter({
            id: 'generic-handler',
            displayName: 'generic',
            discovery: { hid: { usagePage: 0xff60, usage: 0x61 } },
            async canHandle(t: Transport) {
                if (t.abortController.signal.aborted) {
                    return { ok: false as const, reason: 'dead' }
                }
                return {
                    ok: true as const,
                    deviceInfo: { name: 'g', firmware: 'g' },
                }
            },
            async connect() {
                throw new Error('unused')
            },
        })

        const t = hidTransport(0x3434)
        const winner = await pickAdapter(t, { transportKind: 'hid' })

        expect(winner?.id).toBe('generic-handler')
        expect(t.abortController.signal.aborted).toBe(false) // specific never probed
    })
})

describe('pickAdapter — transport discovery ownership', () => {
    it('probes only the adapter identified by the opened BLE service', async () => {
        const { registerAdapter, pickAdapter } = await freshRegistry()
        const wrongProbe = vi.fn(async (t: Transport) => {
            t.abortController.abort()
            return { ok: false as const, reason: 'wrong protocol' }
        })
        const ownerProbe = vi.fn(async () => ({
            ok: true as const,
            deviceInfo: { name: 'ZMK', firmware: 'zmk' },
        }))

        registerAdapter({
            id: 'remappr',
            displayName: 'Remappr',
            discovery: { ble: { serviceUuid: 'remappr', charUuid: 'control' } },
            canHandle: wrongProbe,
            async connect() {
                throw new Error('unused')
            },
        })
        registerAdapter({
            id: 'zmk',
            displayName: 'ZMK',
            discovery: { ble: { serviceUuid: 'zmk', charUuid: 'rpc' } },
            canHandle: ownerProbe,
            async connect() {
                throw new Error('unused')
            },
        })

        const transport = bleTransport('zmk')
        const winner = await pickAdapter(transport, { transportKind: 'ble' })

        expect(winner?.id).toBe('zmk')
        expect(ownerProbe).toHaveBeenCalledOnce()
        expect(wrongProbe).not.toHaveBeenCalled()
        expect(transport.abortController.signal.aborted).toBe(false)
    })

    it('does not probe unrelated adapters when the discovered owner is unavailable', async () => {
        const { registerAdapter, pickAdapter } = await freshRegistry()
        const unrelatedProbe = vi.fn(async () => ({
            ok: true as const,
            deviceInfo: { name: 'wrong', firmware: 'wrong' },
        }))
        registerAdapter({
            id: 'unrelated',
            displayName: 'Unrelated',
            discovery: { ble: { serviceUuid: 'other', charUuid: 'other' } },
            canHandle: unrelatedProbe,
            async connect() {
                throw new Error('unused')
            },
        })

        const winner = await pickAdapter(bleTransport('missing'), {
            transportKind: 'ble',
        })

        expect(winner).toBeNull()
        expect(unrelatedProbe).not.toHaveBeenCalled()
    })
})
