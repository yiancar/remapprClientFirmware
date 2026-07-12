# Remappr keymap JSON — v2 reference

The keymap JSON is what the builder emits and what the `remappr` compiler turns
into an RMBC blob for the firmware. **v2** is the ergonomic, hand-authorable
surface. It is loaded through a lossless down-migration into the internal v1
surface (`src/config/migrate.ts`), so a v2 document and its verbose v1 spelling
compile to the **exact same bytes** — v2 adds no new wire capability, only easier
authoring.

A document is v2 when its root has `"version": 2` (or `"schemaVersion": 2`).
Anything else is treated as v1 and passes through untouched. Defaults are never
serialized — omit any field you are happy to leave at the firmware default.

> Status: this file tracks what the migration currently accepts. Sections marked
> _(planned)_ are reserved surface not yet wired.

## Skeleton

```jsonc
{
  "version": 2,
  "kind": "remappr.keymap",
  "meta": { "name": "My Board" },
  "defaults": { "tappingTermMs": 180 },
  "layers": [ { "name": "base", "keys": [ /* … */ ] } ]
}
```

`keyboard` geometry is optional: omit it and the position count is taken from the
longest layer's `keys` array (the builder supplies real geometry).

## Layers and the `keys` array

Each layer lists its bindings under `keys` (v1 called this `bindings`; both are
accepted). A binding is a **string** (a key or a compact action) or an
**object** (an explicit action or a tap-hold).

### Bare keys and modified keys

```jsonc
"A", "Space", "␣",            // a key (name, alias, or glyph)
"Ctrl+C", "LGui+Tab"          // a key with modifiers
```

### Keyword actions

| String | Action |
|---|---|
| `___` / `trans` | transparent (fall through) |
| `xxx` / `none` | inert (block fall-through) |
| `capsword` | caps-word |
| `repeat` | repeat last key |
| `altrepeat` | alternate-repeat |
| `bootloader`, `reset`, `softoff` | device actions |
| `graveescape` | grave / escape morph |
| `layerlock` | layer lock |

### `verb:arg` actions

| String | Action |
|---|---|
| `layer:nav` | momentary layer `nav` |
| `layer:game:toggle` | toggle layer (modes: `momentary`, `toggle`, `to`, `sticky`) |
| `mo:nav` / `tog:game` / `to:base` / `sl:sym` | layer mode shorthands |
| `sticky:LShift` (`sk:`) | one-shot modifier / key |
| `macro:email` | run macro `email` |
| `macro:greet(A)` | run one-param macro `greet` with arg `A` |
| `td:esc-caps` | tap-dance `esc-caps` |
| `mm:shift-del` | mod-morph `shift-del` |
| `ht:home-row(LGui,A)` | custom hold-tap `home-row` (hold `LGui`, tap `A`) |
| `mouse:left` | pointer button |
| `move:up` / `scroll:down` | pointer move / scroll |
| `key:<token>` | explicit keypress (escape hatch) |

An unknown verb is left as a raw string so validation reports it against the
real key token rather than silently dropping it.

### Tap-hold objects

```jsonc
{ "tap": "F", "hold": "LGui" }                       // hold a modifier
{ "tap": "Space", "hold": "layer:nav", "term": 200 } // hold a layer, custom term
```

`hold` accepts a friendly modifier name (`LGui` → `LEFT_GUI`) or `layer:<name>`.
Optional `term`/`tappingTermMs`, `quickTap`/`quickTapMs`, `flavor`, `resolve`.

## Behavior definitions (dictionaries)

Definitions are dictionaries keyed by id (v1 used `{ id, … }` arrays; both work).

### Macros

```jsonc
"macros": {
  "email": [ "text:me@example.com", "wait:50", "Enter" ],
  "greet": [ "H", "param", "!" ]
}
```

Step strings: a bare key = a tap; `tap:`/`press:`/`release:<key>`; `wait:<ms>`;
`text:<literal>`; `taptime:<ms>`; `param`; `pause`. Object steps also accepted.
Wrap a step list in `{ "steps": [...], "params": 1 }` to set param arity.

### Tap dances

```jsonc
"tapDances": {
  "esc-caps": { "1": "Esc", "2": "capsword", "timing": { "tappingTermMs": 200 } }
}
```

Numeric keys are tap counts; each value is an action string/object.

### Mod-morphs

```jsonc
"modMorphs": {
  "shift-del": { "on": ["LShift","RShift"], "base": "Backspace",
                 "morphed": "Delete", "keepMods": ["LShift"] }
}
```

### Custom hold-taps

```jsonc
"holdTaps": {
  "home-row": {
    "flavor": "balanced",
    "timing": { "tappingTermMs": 220, "quickTapMs": 150, "requirePriorIdleMs": 125 },
    "flags":  { "retroTap": true, "holdTriggerOnRelease": true },
    "positions": [13, 14, 15, 16]
  }
}
```

`holdTriggerOnRelease` requires a firmware build that carries the flag; older
firmware ignores it. The two inner behaviors default to key-presses.

## Combos and conditional layers

```jsonc
"combos": [ { "keys": [0, 5], "do": "Esc", "timeoutMs": 30, "layers": ["base"] } ],
"conditionalLayers": [ { "if": ["nav", "sym"], "then": "adjust" } ]
```

Combo `keys` are position indices; `do` is the action. _(Key-name resolution in
combos is planned.)_

## Reserved / planned sections

- `node` — per-personality node config (keyboard/mouse/joystick/dongle). _(planned)_
- `firmware` — per-target settings namespaces. _(planned)_
- `board` — build-time board/matrix/storage for the DT/Kconfig generator. _(planned)_
- `lighting.perKey` — per-key colors emitted to the RGB table. _(planned)_
