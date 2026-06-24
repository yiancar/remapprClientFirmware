// Pattern check: no GoF pattern (-) — rejected — discover() is a short linear
// negotiation (device-info → personality-map → limits); plain async control flow.
//
// §7.7 host discovery state machine. The first call is always the unchanged
// 16-byte legacy GET_DEVICE_INFO (no 0xE2) — that is how proto_max is learned.
// proto_max < 2 means a v1 device: stay on the legacy flat protocol. proto_max
// >= 2 unlocks the universal discovery verbs (GET_PERSONALITY_MAP, GET_LIMITS).

import {
    Cmd,
    CommonVerb,
    type DeviceInfo,
    type Limits,
    Namespace,
    parseDeviceInfo,
    parseLimits,
    parsePersonalityMap,
    type PersonalityMap,
    Status,
    statusName,
} from './protocol'
import type { RemapprRpc } from './rpc'

export interface DiscoveryResult {
    protoMax: number
    deviceInfo: DeviceInfo
    /** Present on proto_max >= 2 (role / personality / hw caps). */
    personality?: PersonalityMap
    /** Present on proto_max >= 2 (chunk + frame + pipelining limits). */
    limits?: Limits
}

/**
 * Run the discovery negotiation against a connected RPC. Reads GET_DEVICE_INFO;
 * on a proto-v2 device it additionally reads the universal personality map and
 * limits. A discovery verb that errors is treated as absent (left undefined)
 * rather than failing the whole probe.
 *
 * `opts.targetNode` (default 0 = the directly-attached endpoint) addresses a node
 * behind a dongle: GET_DEVICE_INFO then rides the universal plaintext relay path
 * (§6.2) instead of the direct legacy frame, and every discovery verb carries the
 * node's short-id as `target_node`.
 */
export async function discover(
    rpc: RemapprRpc,
    opts: { targetNode?: number } = {},
): Promise<DiscoveryResult> {
    const target = opts.targetNode ?? 0

    let diData: Uint8Array
    if (target === 0) {
        diData = (await rpc.callPlain(Cmd.GET_DEVICE_INFO)).data
    } else {
        // Relayed: legacy verbs keep their number under COMMON, so GET_DEVICE_INFO
        // travels universal-framed to the node (§6.2) rather than direct.
        const r = await rpc.callUniversalPlain(
            Namespace.COMMON,
            Cmd.GET_DEVICE_INFO,
            undefined,
            { targetNode: target },
        )
        if (r.status !== Status.OK)
            throw new Error(
                `node 0x${target.toString(16)} GET_DEVICE_INFO → ${statusName(r.status)}`,
            )
        diData = r.data
    }
    const deviceInfo = parseDeviceInfo(diData)
    if (deviceInfo.protoMax < 2) {
        return { protoMax: deviceInfo.protoMax, deviceInfo }
    }

    let personality: PersonalityMap | undefined
    let limits: Limits | undefined
    try {
        const pm = await rpc.callUniversalPlain(
            Namespace.COMMON,
            CommonVerb.GET_PERSONALITY_MAP,
            undefined,
            { targetNode: target },
        )
        if (pm.status === Status.OK) personality = parsePersonalityMap(pm.data)
    } catch {
        /* universal personality unavailable — leave undefined */
    }
    try {
        const lim = await rpc.callUniversalPlain(
            Namespace.COMMON,
            CommonVerb.GET_LIMITS,
            undefined,
            { targetNode: target },
        )
        if (lim.status === Status.OK) limits = parseLimits(lim.data)
    } catch {
        /* universal limits unavailable — leave undefined */
    }

    return { protoMax: deviceInfo.protoMax, deviceInfo, personality, limits }
}
