// Pattern check: Adapter (Tier 1) — applied — wraps RpcTransport byte streams as fixed-payload Raw HID request/response client.
// Pattern check: Observer (Tier 1) — applied — opt-in subscribe() starts background pump that demuxes async push frames (Keychron state-notify) from in-flight responses; pre-subscribe close() releases stream locks for cross-probe transport reuse.

import type { Transport } from '@firmware/transport'
import { TransportError } from '@firmware/errors'

export const DEFAULT_RAW_HID_PAYLOAD_SIZE = 32

export type UnsolicitedListener = (frame: Uint8Array) => void

export interface HidClient {
    send(frame: Uint8Array, timeoutMs?: number): Promise<Uint8Array>

    close(opts?: { abortTransport?: boolean }): Promise<void>

    onClosed(cb: (reason?: unknown) => void): () => void

    /**
     * Register an unsolicited-frame listener. The first call also starts the
     * background read pump that demuxes responses from pushes by command
     * byte. Pre-subscribe close() releases stream locks for the next adapter
     * to attach (probe race); post-subscribe close({abortTransport:true})
     * is required to tear the pump down cleanly.
     */
    subscribe(cb: UnsolicitedListener): () => void
}

export interface HidClientOpts {
    payloadSize?: number
    defaultTimeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 1500
// Hard cap on the partial-frame accumulator. A misbehaving or malicious
// device that streams undersized fragments could otherwise grow `acc`
// without bound and OOM the main process. ZMK Studio's largest single
// frame is the 32-byte raw-HID payload, so 1 MiB is several orders of
// magnitude of safety.
const MAX_ACC_BYTES = 1024 * 1024

export function createHidClientFromTransport(
    transport: Transport,
    opts: HidClientOpts = {},
): HidClient {
    const payloadSize = opts.payloadSize ?? DEFAULT_RAW_HID_PAYLOAD_SIZE
    const defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS

    const reader = transport.readable.getReader()
    const writer = transport.writable.getWriter()

    let queue: Promise<unknown> = Promise.resolve()
    const closedListeners = new Set<(reason?: unknown) => void>()
    const unsolicitedListeners = new Set<UnsolicitedListener>()
    let closed = false
    let acc = new Uint8Array()
    let pumpStarted = false

    let pending: {
        expectedCmd: number
        resolve: (frame: Uint8Array) => void
        reject: (err: Error) => void
    } | null = null

    function fireClosed(reason?: unknown): void {
        if (closed) return
        closed = true
        for (const cb of closedListeners) {
            try {
                cb(reason)
            } catch {
                /* ignore */
            }
        }
    }

    function fireUnsolicited(frame: Uint8Array): void {
        for (const cb of unsolicitedListeners) {
            try {
                cb(frame)
            } catch {
                /* ignore */
            }
        }
    }

    transport.abortController.signal.addEventListener(
        'abort',
        () => fireClosed(transport.abortController.signal.reason),
        { once: true },
    )

    // ---- Idle (pre-subscribe) read path: on-demand framing ----

    async function readFrameIdle(timeoutMs: number): Promise<Uint8Array> {
        const deadline = Date.now() + timeoutMs
        while (acc.length < payloadSize) {
            if (closed) throw new TransportError('Raw HID closed')
            const remaining = deadline - Date.now()
            if (remaining <= 0) {
                throw new TransportError(
                    `Raw HID read timeout after ${timeoutMs}ms`,
                )
            }
            const result = await Promise.race([
                reader.read(),
                new Promise<{ value: undefined; done: false; timeout: true }>(
                    (resolve) =>
                        setTimeout(
                            () =>
                                resolve({
                                    value: undefined,
                                    done: false,
                                    timeout: true,
                                }),
                            remaining,
                        ),
                ),
            ])
            if ('timeout' in result) {
                throw new TransportError(
                    `Raw HID read timeout after ${timeoutMs}ms`,
                )
            }
            const { value, done } = result
            if (done) {
                fireClosed('eof')
                throw new TransportError('Raw HID stream ended')
            }
            if (value && value.length > 0) {
                if (acc.length + value.length > MAX_ACC_BYTES) {
                    fireClosed('acc-overflow')
                    throw new TransportError(
                        `Raw HID accumulator overflow (>${MAX_ACC_BYTES} bytes)`,
                    )
                }
                const merged = new Uint8Array(acc.length + value.length)
                merged.set(acc, 0)
                merged.set(value, acc.length)
                acc = merged
            }
        }
        const out = acc.slice(0, payloadSize)
        acc = acc.slice(payloadSize)
        return out
    }

    // ---- Pump (post-subscribe) read path: continuous demux ----

    async function readPump(): Promise<void> {
        // Drain any frames that idle path already buffered.
        while (acc.length >= payloadSize) {
            const frame = acc.slice(0, payloadSize)
            acc = acc.slice(payloadSize)
            if (pending && frame[0] === pending.expectedCmd) {
                const p = pending
                pending = null
                p.resolve(frame)
            } else {
                fireUnsolicited(frame)
            }
        }
        while (!closed) {
            try {
                const { value, done } = await reader.read()
                if (done) {
                    fireClosed('eof')
                    if (pending) {
                        pending.reject(
                            new TransportError('Raw HID stream ended'),
                        )
                        pending = null
                    }
                    return
                }
                if (value && value.length > 0) {
                    if (acc.length + value.length > MAX_ACC_BYTES) {
                        const overflow = new TransportError(
                            `Raw HID accumulator overflow (>${MAX_ACC_BYTES} bytes)`,
                        )
                        fireClosed('acc-overflow')
                        if (pending) {
                            pending.reject(overflow)
                            pending = null
                        }
                        return
                    }
                    const merged = new Uint8Array(acc.length + value.length)
                    merged.set(acc, 0)
                    merged.set(value, acc.length)
                    acc = merged
                }
                while (acc.length >= payloadSize) {
                    const frame = acc.slice(0, payloadSize)
                    acc = acc.slice(payloadSize)
                    if (pending && frame[0] === pending.expectedCmd) {
                        const p = pending
                        pending = null
                        p.resolve(frame)
                    } else {
                        fireUnsolicited(frame)
                    }
                }
            } catch (err) {
                if (closed) return
                fireClosed(err)
                if (pending) {
                    pending.reject(
                        err instanceof Error ? err : new Error(String(err)),
                    )
                    pending = null
                }
                return
            }
        }
    }

    async function sendPumped(
        payload: Uint8Array,
        deadline: number,
    ): Promise<Uint8Array> {
        return new Promise<Uint8Array>((resolve, reject) => {
            if (closed) {
                reject(new TransportError('Raw HID closed'))
                return
            }
            let timer: ReturnType<typeof setTimeout> | null = null
            pending = {
                expectedCmd: payload[0],
                resolve: (f) => {
                    if (timer) clearTimeout(timer)
                    resolve(f)
                },
                reject: (e) => {
                    if (timer) clearTimeout(timer)
                    reject(e)
                },
            }
            timer = setTimeout(() => {
                if (pending && pending.expectedCmd === payload[0]) {
                    pending = null
                }
                reject(
                    new TransportError(
                        `Raw HID read timeout after ${deadline}ms`,
                    ),
                )
            }, deadline)
            writer.write(payload).catch((err) => {
                if (timer) clearTimeout(timer)
                pending = null
                reject(err instanceof Error ? err : new Error(String(err)))
            })
        })
    }

    async function send(
        frame: Uint8Array,
        timeoutMs?: number,
    ): Promise<Uint8Array> {
        if (closed) throw new TransportError('Raw HID closed')
        let payload = frame
        if (frame.length !== payloadSize) {
            const buf = new Uint8Array(payloadSize)
            buf.set(frame.slice(0, payloadSize), 0)
            payload = buf
        }
        const deadline = timeoutMs ?? defaultTimeoutMs
        const work: Promise<Uint8Array> = queue
            .catch(() => undefined)
            .then(async () => {
                if (closed) throw new TransportError('Raw HID closed')
                if (pumpStarted) {
                    return sendPumped(payload, deadline)
                }
                await writer.write(payload)
                return readFrameIdle(deadline)
            })
        queue = work.catch(() => undefined)
        return work
    }

    async function close(
        closeOpts: { abortTransport?: boolean } = {},
    ): Promise<void> {
        if (closed) return
        fireClosed('close')
        if (pending) {
            pending.reject(new TransportError('Raw HID closed'))
            pending = null
        }
        if (closeOpts.abortTransport) {
            // Aborting the transport ends reader.read() with done; the pump
            // (if started) exits naturally, then locks are safe to release.
            if (!transport.abortController.signal.aborted) {
                transport.abortController.abort('hid-client.close')
            }
            // Give the pump a turn to observe the abort before releasing.
            await Promise.resolve()
        }
        try {
            reader.releaseLock()
        } catch {
            /* lock held by pump or already released */
        }
        try {
            writer.releaseLock()
        } catch {
            /* already released */
        }
    }

    return {
        send,
        close,
        onClosed(cb) {
            if (closed) {
                cb()
                return () => undefined
            }
            closedListeners.add(cb)
            return () => closedListeners.delete(cb)
        },
        subscribe(cb) {
            unsolicitedListeners.add(cb)
            if (!pumpStarted && !closed) {
                pumpStarted = true
                void readPump()
            }
            return () => unsolicitedListeners.delete(cb)
        },
    }
}
