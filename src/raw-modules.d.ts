// Vite's `?raw` import suffix returns a module's file contents as a string.
// `vite/client` declares the generic `*?raw` for the renderer build, but the
// node tsconfig (which type-checks src/firmware) doesn't reference those types —
// so the mock service's seed import needs this scoped declaration too.
declare module '*.json?raw' {
    const src: string
    export default src
}
