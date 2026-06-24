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
 * Run the discovery negotiation against a connected RPC. Always reads legacy
 * GET_DEVICE_INFO; on a proto-v2 device it additionally reads the universal
 * personality map and limits. A discovery verb that errors is treated as
 * absent (left undefined) rather than failing the whole probe.
 */
export async function discover(rpc: RemapprRpc): Promise<DiscoveryResult> {
    const di = await rpc.callPlain(Cmd.GET_DEVICE_INFO)
    const deviceInfo = parseDeviceInfo(di.data)
    if (deviceInfo.protoMax < 2) {
        return { protoMax: deviceInfo.protoMax, deviceInfo }
    }

    let personality: PersonalityMap | undefined
    let limits: Limits | undefined
    try {
        const pm = await rpc.callUniversalPlain(
            Namespace.COMMON,
            CommonVerb.GET_PERSONALITY_MAP,
        )
        if (pm.status === Status.OK) personality = parsePersonalityMap(pm.data)
    } catch {
        /* universal personality unavailable — leave undefined */
    }
    try {
        const lim = await rpc.callUniversalPlain(
            Namespace.COMMON,
            CommonVerb.GET_LIMITS,
        )
        if (lim.status === Status.OK) limits = parseLimits(lim.data)
    } catch {
        /* universal limits unavailable — leave undefined */
    }

    return { protoMax: deviceInfo.protoMax, deviceInfo, personality, limits }
}
