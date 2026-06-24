// pattern-check: skip — discovery negotiation test fixtures against a fake rpc.
import { describe, expect, it } from 'vitest'
import { discover } from './discovery'
import { Cmd, CommonVerb, Status } from './protocol'
import type { RemapprRpc } from './rpc'

// A 16-byte DEVICE_INFO with the given proto_max (other fields 0).
function deviceInfo(protoMax: number): Uint8Array {
    const d = new Uint8Array(16)
    const dv = new DataView(d.buffer)
    dv.setUint16(0, 1, true) // proto_min
    dv.setUint16(2, protoMax, true) // proto_max
    dv.setUint16(4, 1, true) // schema_version
    return d
}

// Minimal PersonalityMap: role, personality, proto_major, 0 namespaces, hwCaps.
function personalityMap(): Uint8Array {
    return Uint8Array.of(0x02, 0x10, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00)
}

// Minimal GET_LIMITS payload (5×u16 + 2×u8 = 12 bytes).
function limits(): Uint8Array {
    const d = new Uint8Array(12)
    new DataView(d.buffer).setUint16(2, 22, true) // max_sealed_chunk
    return d
}

describe('discover (node-aware)', () => {
    it('uses the direct legacy path for the attached endpoint (target 0)', async () => {
        let plainCmd = -1
        const rpc = {
            callPlain: async (cmd: number) => {
                plainCmd = cmd
                return { cmd, seq: 0, status: Status.OK, data: deviceInfo(1) }
            },
            callUniversalPlain: async () => {
                throw new Error('a v1 direct probe must not use the relay path')
            },
        } as unknown as RemapprRpc

        const res = await discover(rpc)
        expect(plainCmd).toBe(Cmd.GET_DEVICE_INFO)
        expect(res.protoMax).toBe(1)
        expect(res.personality).toBeUndefined()
        expect(res.limits).toBeUndefined()
    })

    it('relays every discovery verb to a node via target_node (§6.2)', async () => {
        const target = 7
        const calls: { verb: number; target: number }[] = []
        const rpc = {
            callPlain: async () => {
                throw new Error('a node probe must not use the direct legacy path')
            },
            callUniversalPlain: async (
                _ns: number,
                verb: number,
                _arg?: Uint8Array,
                opts?: { targetNode?: number },
            ) => {
                calls.push({ verb, target: opts?.targetNode ?? 0 })
                if (verb === Cmd.GET_DEVICE_INFO)
                    return { status: Status.OK, data: deviceInfo(2) }
                if (verb === CommonVerb.GET_PERSONALITY_MAP)
                    return { status: Status.OK, data: personalityMap() }
                if (verb === CommonVerb.GET_LIMITS)
                    return { status: Status.OK, data: limits() }
                return { status: Status.ERR_CMD, data: new Uint8Array() }
            },
        } as unknown as RemapprRpc

        const res = await discover(rpc, { targetNode: target })
        expect(res.protoMax).toBe(2)
        expect(res.personality?.personality).toBe(0x10)
        expect(res.limits?.maxSealedChunk).toBe(22)
        // Every verb carried the node's short-id, in negotiation order.
        expect(calls.map((c) => c.verb)).toEqual([
            Cmd.GET_DEVICE_INFO,
            CommonVerb.GET_PERSONALITY_MAP,
            CommonVerb.GET_LIMITS,
        ])
        expect(calls.every((c) => c.target === target)).toBe(true)
    })

    it('throws when a relayed node is unreachable (GET_DEVICE_INFO ≠ OK)', async () => {
        const rpc = {
            callPlain: async () => {
                throw new Error('unused')
            },
            callUniversalPlain: async () => ({
                status: Status.ERR_STATE,
                data: new Uint8Array(),
            }),
        } as unknown as RemapprRpc
        await expect(discover(rpc, { targetNode: 9 })).rejects.toThrow(
            /GET_DEVICE_INFO/,
        )
    })
})
