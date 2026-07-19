# @remappr/firmware

Remappr **client firmware** layer, extracted from the Remappr app into a standalone,
publishable package. Framework-agnostic and **transport-agnostic**: it owns the canonical
keymap config, the keycode catalog, and the per-firmware protocol / codec / service /
adapter / compiler logic for every supported firmware. Concrete device IO (Electron IPC,
WebHID/WebSerial, node-hid) lives in the consuming app and is injected via the `Transport`
bytes-stream contract — it is **not** part of this package.

Used by:
- the main Remappr desktop app (embeds the builder + drives devices),
- `@remappr/builder` (the keymap builder),
- `remapprBackend` (imports `@remappr/firmware/config` for `ConfigKeymap` types + schemas).

## Install

```sh
pnpm add @remappr/firmware
```

Scoped to GitHub Packages — consumers need an `.npmrc`:

```
@remappr:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`@yiancar/zmk-studio-ts-client` is a **peer dependency** (the extended ZMK transport and lighting contract).

## Usage

```ts
import { registerBuiltinFirmwares, getAdapters, pickAdapter } from '@remappr/firmware'
import { parseKeymap, getCompiler } from '@remappr/firmware/config'

// Register every built-in firmware's adapter + compiler once at boot.
registerBuiltinFirmwares()

// Compile a canonical config to firmware artifacts.
const { config } = parseKeymap(jsonSource)
const out = getCompiler('zmk').compile(config)
```

## Adding a firmware

The firmware system is a **registry/plugin architecture** (Strategy + Registry):

- **Built-in:** add a new folder (codec/protocol/service/adapter/compiler), register it in
  `src/builtins.ts`, extend `BuiltinTarget` in `src/config/types.ts`, bump the version.
  Every consuming app picks it up on upgrade — **zero app-code change**.
- **External / third-party:** implement `FirmwareAdapter` + `KeymapCompiler` in your own
  module and call `registerAdapter()` / `registerCompiler()` at boot. No edit here.
  `Target` is `BuiltinTarget | (string & {})`, so external targets type-check.

## Subpath exports

`@remappr/firmware` (root), `/config`, `/catalog`, `/codec`, `/types`, `/service`,
`/lighting`, `/registry`, `/zmk`, `/qmk`, `/qmk-vial`, `/keychron`, `/mock`, plus deeper
paths (`/zmk/codec`, `/mock/codec`, `/qmk/viaRegistry`, …). These mirror the old
`@firmware/*` import specifiers so consumers migrate with a find/replace.

> **Side effects are intentional:** importing a firmware barrel or `/config` registers its
> adapter/compiler in the global registries. Do **not** set `sideEffects: false` for this package.

## Scripts

| Script | What |
|---|---|
| `pnpm build` | Bundle ESM + `.d.ts` to `dist/` (tsup), copy raw `.json` |
| `pnpm dev` | Watch build (for symlinked local dev) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (461 tests) |
