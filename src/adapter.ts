import type { Transport } from './transport'
import type { KeyboardService } from './service'
import type { DeviceInfo, TransportKind } from './types'

export interface BleDiscovery {
    serviceUuid: string
    charUuid: string
}

export interface HidDiscovery {
    vendorIds?: number[]
    usagePage?: number
    usage?: number
}

export interface Discovery {
    ble?: BleDiscovery
    hid?: HidDiscovery
    serial?: Record<string, never>
}

export type Probe =
    | { ok: true; deviceInfo: DeviceInfo }
    | { ok: false; reason?: string }

export interface ProbeHint {
    transportKind: TransportKind
}

export interface FirmwareAdapter {
    readonly id: string
    readonly displayName: string
    readonly discovery: Discovery

    canHandle(transport: Transport, hint?: ProbeHint): Promise<Probe>

    connect(transport: Transport, signal: AbortSignal): Promise<KeyboardService>
}
