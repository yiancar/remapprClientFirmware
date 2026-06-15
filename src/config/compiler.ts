// Pattern check: Strategy (Tier 1) — applied — per-firmware KeymapCompiler swappable behind one interface; mirrors the existing per-firmware KeycodeCodec Strategy (codec.ts). The renderer/download picks a target and compiles uniformly.
//
// A compiler lowers the canonical ConfigKeymap straight to firmware artifacts
// (ExportedFile[]) + diagnostics — no lossy round-trip through the runtime
// KeyAction model. Keycode spellings come from the catalog (names.ts);
// feature gating comes from CAPABILITY_MATRIX (capabilities.ts).

import type { ExportedFile } from '../types'
import { DiagnosticBag, type Diagnostic } from './diagnostics'
import type { ConfigKeymap, Target } from './types'

export interface CompileResult {
    files: ExportedFile[]
    diagnostics: Diagnostic[]
}

export interface KeymapCompiler {
    readonly target: Target
    compile(config: ConfigKeymap): CompileResult
}

// Shared helper for concrete compilers: run an emit fn with a fresh bag.
export function runCompile(
    config: ConfigKeymap,
    emit: (config: ConfigKeymap, diag: DiagnosticBag) => ExportedFile[],
): CompileResult {
    const diag = new DiagnosticBag()
    const files = emit(config, diag)
    return { files, diagnostics: [...diag.all] }
}

// Registry is populated by the concrete compiler modules (avoids an import
// cycle: each compiler imports this file, not the other way around).
const REGISTRY = new Map<Target, KeymapCompiler>()

export function registerCompiler(c: KeymapCompiler): void {
    REGISTRY.set(c.target, c)
}

export function getCompiler(target: Target): KeymapCompiler {
    const c = REGISTRY.get(target)
    if (!c) throw new Error(`No compiler registered for target "${target}"`)
    return c
}

export function hasCompiler(target: Target): boolean {
    return REGISTRY.has(target)
}
