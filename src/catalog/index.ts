// Pattern check: no GoF pattern (-) — rejected — barrel file re-exporting catalog public surface for @firmware/catalog consumers.
//
// Adding a new keycode end-to-end:
//   1. Authoritative HID page (keyboard/consumer/AC/AL/media/contact):
//      append the entry to the matching hid-pages/*.json file. The
//      slugified Name becomes its canonical id (e.g. "Keyboard Foo"
//      → key.keyboard_foo). Override label/medium/long via
//      hid-pages/overrides.json keyed by HID page + usage id.
//   2. Firmware / non-HID concept (wireless, mouse, RGB, magic, …):
//      append a CatalogEntry to the matching *_ENTRIES array in
//      static-entries.ts. Pick an `id` prefix routed by pages.ts
//      PREFIX_TO_PAGE so the picker tab renders it.
//   3. Spec name aliases (ZMK + QMK + KC_*/QK_*): add a row to
//      EXTERNAL_NAMES in external-names.ts. If the entry has no spec
//      analogue (internal helper, MIDI bank index, joystick button
//      index), add its id to EXTERNAL_NAMES_ALLOWLIST.
//   4. Codec round-trip:
//      - HID-routed entries (page 7 / page 12) are auto-encoded by
//        zmkCodec / mockCodec via HID_USAGE_BY_CANONICAL.
//      - QMK-routed entries (wireless, RGB, magic, etc.) need a hex
//        in src/firmware/qmk/keycodes-hex.ts QMK_HEX_BY_CANONICAL.
//   5. Tests: catalog.test.ts asserts unique ids, page coverage,
//      external-name presence, alias uniqueness, codec orphan-free.
//      Run `pnpm vitest run src/firmware/catalog`.
export type {
    CanonicalKeyId,
    CatalogEntry,
    CatalogPage,
    KeyCatalog,
} from './types'
export {
    AC_ENTRIES,
    AL_ENTRIES,
    CATALOG,
    CONSUMER_ENTRIES,
    CONTACT_ENTRIES,
    HID_USAGE_BY_CANONICAL,
    KEYBOARD_ENTRIES,
    MEDIA_ENTRIES,
} from './entries'
export type { HidUsage } from './entries'
export { CATALOG_PAGES, groupForId } from './pages'
