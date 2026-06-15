/**
 * Namespaced logger factory.
 *
 * Default policy: dev = log everything to console, prod = silent.
 * Used in both main + renderer (Electron), so the dev check covers
 * `import.meta.env.DEV` (Vite/electron-vite injected) and
 * `process.env.NODE_ENV !== 'production'` (Node fallback).
 *
 * Single seam means future Sentry / file-based transport is one
 * edit here — no callers change.
 */

type LogFn = (...args: unknown[]) => void

export interface Logger {
    debug: LogFn
    info: LogFn
    warn: LogFn
    error: LogFn
}

const noop: LogFn = () => {}

const isDev = ((): boolean => {
    try {
        // Vite / electron-vite inject import.meta.env at build time.
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            return import.meta.env.DEV === true
        }
    } catch {
        /* ignore — `import.meta` may not exist in plain Node */
    }
    return (
        typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
    )
})()

export function createLogger(namespace: string): Logger {
    if (!isDev) {
        return { debug: noop, info: noop, warn: noop, error: noop }
    }
    const prefix = `[${namespace}]`
    return {
        debug: (...args) => console.debug(prefix, ...args),
        info: (...args) => console.log(prefix, ...args),
        warn: (...args) => console.warn(prefix, ...args),
        error: (...args) => console.error(prefix, ...args),
    }
}

/**
 * Silence native console.* in production builds. Call once at each entry
 * point (Electron main + renderer). Pre-existing console.* calls scattered
 * across the codebase go quiet in shipped builds without per-file refactor.
 *
 * Dev (electron-vite dev / vite dev) keeps full logging.
 */
export function silenceConsoleInProduction(): void {
    if (isDev) return
    console.log = noop
    console.info = noop
    console.debug = noop
    console.warn = noop
    console.error = noop
}
