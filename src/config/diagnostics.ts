// Pattern check: no GoF pattern (-) — rejected — plain Diagnostic data type + a small mutable collector; no abstraction needed.
//
// Diagnostics are the first-class output of validation + compilation. A
// `path` mirrors Zod's issue-path style (array of object keys / array
// indices) so editor + download surfaces can jump straight to the offending
// binding. `warn` = compiled output dropped a firmware-unsupported feature to
// a no-op; `error` = the config can't be compiled as written.

export type DiagnosticLevel = 'error' | 'warn'

export type DiagnosticPath = (string | number)[]

export interface Diagnostic {
    level: DiagnosticLevel
    message: string
    path: DiagnosticPath
}

/** Dotted, Zod-style rendering of a path: ['layers', 0, 'bindings', 3] -> "layers.0.bindings.3". */
export function formatPath(path: DiagnosticPath): string {
    return path.join('.')
}

/** Accumulates diagnostics during a validate/compile pass. */
export class DiagnosticBag {
    private readonly items: Diagnostic[] = []

    error(message: string, path: DiagnosticPath = []): void {
        this.items.push({ level: 'error', message, path })
    }

    warn(message: string, path: DiagnosticPath = []): void {
        this.items.push({ level: 'warn', message, path })
    }

    push(d: Diagnostic): void {
        this.items.push(d)
    }

    get all(): readonly Diagnostic[] {
        return this.items
    }

    get errors(): Diagnostic[] {
        return this.items.filter((d) => d.level === 'error')
    }

    get warnings(): Diagnostic[] {
        return this.items.filter((d) => d.level === 'warn')
    }

    hasErrors(): boolean {
        return this.items.some((d) => d.level === 'error')
    }
}
