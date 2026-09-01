# Easier to use, and a shareable payment card

Design for three changes to Shopee Order Splitter:

1. The app remembers your basket, and stops making you clear a demo first.
2. You can attach your own payment QR and share a summary image that carries it.
3. The README becomes a user's front door rather than a design document.

## Why

Two things make the app slower to use than it should be. Every visit starts on a
seeded example basket that has to be cleared by hand, and nothing survives a
refresh - so a voucher list that barely changes from week to week gets retyped
every time.

The third change is new capability rather than a fix. The summary today is plain
text. Pasting it into a group chat tells everyone what they owe but not how to
pay, so settling up still needs a separate message with a QR screenshot. One
image carrying both is one message.

## Scope

In scope: local persistence, first-visit behaviour, a stored payment QR, a
rendered share card, README restructure.

Out of scope: accounts, sync across devices, generating a DuitNow QR from a phone
number (a real DuitNow QR is an EMVCo payload issued by a bank - it cannot be
fabricated client-side), per-person images, changes to the solver.

---

## 1. Persistence and first-visit state

### Storage keys

Two keys, not one:

| Key | Holds | Written |
| --- | --- | --- |
| `shopee-splitter/state` | items, vouchers, delivery vouchers, fee, chosen order count | debounced, 400 ms after an edit |
| `shopee-splitter/qr` | QR data URL + payee name | only when the QR changes |

They are split because the QR is roughly 100 KB and the basket changes on every
keystroke. One key would rewrite the QR blob on each character typed.

### `src/lib/storage.js`

Pure module, no Vue. localStorage is reached only through here.

```js
export const STATE_KEY = 'shopee-splitter/state'
export const QR_KEY = 'shopee-splitter/qr'
export const SCHEMA_VERSION = 1

export function loadState ()        // -> null | normalised state
export function saveState (state)   // -> boolean, false when it could not persist
export function loadQr ()           // -> null | { image, payee }
export function saveQr (qr)         // -> boolean; saveQr(null) removes the key
```

`storage.js` imports `MAX_ORDERS` from `solver.js` to bound `chosenOrderCount`.
That is a pure-lib to pure-lib dependency, and the only one this module has.

`loadState()` returns `null` - meaning "treat as a first visit" - when the record
is unusable: absent, unparseable, not an object, or `v !== SCHEMA_VERSION`.

When the record is usable but a *field* is malformed, that field falls back
individually. Items fall back to **one blank row, never to the example basket** -
the example belongs to a true first visit only, and having it reappear after a
storage glitch would be baffling.

Normalisation rules:

- Every row field is coerced with `String(value ?? '')`.
- Entries that are not objects are dropped.
- Caps as a corrupt-data guard only: 200 items, 50 vouchers per pool. Anything
  beyond is truncated.
- `chosenOrderCount` must be an integer 0..`MAX_ORDERS`, else 0.
- `deliveryFee` must be a string parseable as a non-negative number, else the
  default.

QR validation is stricter, because the value is drawn and displayed:

- `image` must be a string beginning with `data:image/`. Anything else rejects
  the whole QR record. A remote URL must never be accepted, since the app would
  then fetch an attacker-chosen address.
- `payee` is trimmed and capped at 40 characters - it is drawn on a fixed-width
  card, and unbounded text would overflow it.

Every read and write is wrapped in `try/catch`. Private browsing, disabled
storage and `QuotaExceededError` all degrade to "the app works, it just does not
remember". `saveState` and `saveQr` return `false` in that case.

### First visit, and when persistence starts

- `loadState()` returns `null` -> seed from `DEFAULT_*` and set `isExample`.
- `loadState()` returns data -> hydrate, `isExample` stays false.

**Persistence does not begin until the user's first edit.** A `dirty` flag gates
the save watcher. Without this, a first-time visitor who reloads without touching
anything would have the example basket saved as if it were theirs, and the
"this is an example" note would disappear while the demo data stayed.

`isExample` is session-only state. It is set on a first-visit seed and cleared by
any item edit, add, remove, or by Clear items.

`loadExample()` sets `dirty` - the user chose it, so it should persist - but does
*not* set `isExample`. Being told "this is an example" right after deliberately
asking for the example would be noise.

### Controls

- **Clear items** - wipes items to a single blank row. Keeps vouchers, delivery
  fee and QR. This matches the actual workflow: the basket changes every order,
  the voucher list rarely does.
- **Load example** - restores the demo basket. Lives in the items card hint, so
  the example stays reachable after it is cleared.
- When `isExample`, the items card shows a dismissible note: *"This is an example
  basket - Clear items to enter your own."*
- When a save fails, a muted one-line note appears: *"Couldn't save on this
  device."* No modal, no retry.

### `useSplitter.js` additions

State: `qrImage`, `qrPayee`, `isExample`, `persistFailed`.
Actions: `clearItems()`, `loadExample()`, `setQr(field, value)`, `dismissExampleNote()`.

The save watcher is separate from the existing 220 ms solve debounce, at 400 ms.
Solving and persisting have different cadences and should not share a timer.

---

## 2. Payment QR and share card

### Import: `src/lib/image.js`

```js
export const QR_MAX_EDGE = 512
export function fitWithin (width, height, maxEdge)      // pure -> { width, height }
export async function downscaleToDataUrl (file, maxEdge = QR_MAX_EDGE)
```

`fitWithin` never upscales: if both dimensions are already within `maxEdge` it
returns them unchanged.

`downscaleToDataUrl` rejects a file that is not `image/*` or is over 10 MB before
decoding it, then draws it to a canvas at the fitted size.

**Output is PNG, never JPEG.** JPEG ringing around the high-contrast edges of QR
modules can defeat scanners. Lossless matters more than bytes here.

A phone screenshot is commonly around 2 MB against a ~5 MB localStorage budget,
so downscaling on import is what makes storing the QR viable at all.

### `src/components/PaymentQr.vue`

Props `image` and `payee`; emits `update(field, value)`, following the app's
existing props-down/events-up convention.

Contains: a file input accepting `image/*` with drag-and-drop, a preview
thumbnail, Replace and Remove, a payee name field, an error line for rejected
files, and the line *"Saved in this browser only. Never uploaded."*

Global paste-to-upload is deliberately omitted. The QR screenshot is taken on a
phone, so a document-level paste listener would earn little.

Mounted in the inputs column of `App.vue`, below the voucher pair.

### Render: `src/lib/shareCard.js`

```js
export const CARD_WIDTH = 720
export const CARD_SCALE = 2
export function layoutCard (plan, options)          // pure -> { width, height, blocks }
export function truncateToWidth (text, maxWidth, measure)   // pure
export function drawCard (layout, ctx, qrImage)
export function renderCardPngDataUrl (plan, options)        // synchronous
export function dataUrlToBlob (dataUrl)                     // synchronous
```

`options` is `{ deliveryCents, qrImage, qrPayee }`. `deliveryCents` is needed for
the same reason `buildSummary` takes it - the plan does not carry the per-order
fee.

`layoutCard` is pure and returns blocks of `{ kind, y, ... }` where `kind` is one
of `title`, `rule`, `row`, `total`, `flat`, `qr`, `caption`, `footer`. Height and
structure are therefore fully testable without a canvas; only the drawing calls
are not.

Metrics, in logical pixels:

| Element | Size |
| --- | --- |
| card width | 720, padding 40 |
| title | 30px bold |
| person row | 21px, 44px pitch |
| grand total | 26px bold |
| flat rate line | 17px muted |
| QR | 320 x 320, centred, 28px above |
| caption | 18px |
| footer | 15px muted |

Drawn at `CARD_SCALE` 2 for retina. Height is the sum of the blocks, rounded up.

Long person labels are truncated at draw time via `truncateToWidth`, which takes
a `measure` function so it can be tested with a fake rather than a real canvas.

**The card uses a fixed light palette, never the app's dark theme:** bg
`#ffffff`, ink `#1c1c1e`, muted `#6b7280`, line `#e4e4ea`, accent `#ee4d2d`. The
image lands in someone else's chat and must read the same regardless of the
sender's OS setting.

With no QR stored, the `qr` and `caption` blocks are omitted and the card still
renders - the QR is an enhancement, not a requirement.

### Delivery: `src/components/ShareActions.vue`

Composes the existing, already-tested `CopySummaryButton` (text, unchanged)
alongside the new image action.

The image action falls through three tiers:

1. `navigator.share({ files })`, guarded by `navigator.canShare({ files })`
2. `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`
3. `<a download>` named `shopee-split-YYYY-MM-DD.png`

The button label is chosen at mount from a cheap capability probe, and names the
QR only when one is stored: "Share summary + QR" or "Share summary image", and
likewise "Copy image" / "Save image". The *behaviour* re-probes at click
with the real file, since `canShare` for files depends on the file's type, and
falls through to the next tier if the probe or the call fails.

**Rendering is synchronous, using `toDataURL` rather than `toBlob`.** Safari
drops clipboard and share permissions across an `await`, so the whole
render-and-deliver path must stay inside the click gesture. `dataUrlToBlob`
decodes base64 synchronously for the same reason.

---

## 3. README

The README becomes the front door: what it solves, then how to use it. The
solver write-up, the styling notes and the responsive-layout notes move to
`docs/how-it-works.md`, which the README links.

README structure:

1. What it solves - two paragraphs
2. Quick start - install, run, open
3. How to use it - items, vouchers, delivery fee, reading the plan, comparing
   splits, adding your QR, sharing
4. A worked example - the default basket, and why three orders beat two
5. Things worth knowing - the existing behaviour notes
6. Privacy - everything is local, the QR never leaves the browser
7. Development - scripts and the `src/` tree
8. A link to `docs/how-it-works.md`

`docs/how-it-works.md` takes the existing solver, styling and responsive sections
essentially as written. They are good; they are just not what a first-time
visitor needs first.

---

## Testing

The existing 59 tests must stay green. `CopySummaryButton` and the solver are
untouched.

**`test/storage.test.js`** - round-trip save and load; absent key; unparseable
JSON; wrong `v`; non-object record; malformed items falling back to one blank row
rather than the example; over-cap arrays truncated; a QR with a non-`data:` image
rejected; `payee` trimmed and capped; `saveState` returning false when
localStorage throws `QuotaExceededError`; behaviour when `localStorage` is absent
entirely.

**`test/shareCard.test.js`** - `layoutCard` block sequence and total height for a
plan with and without a QR; height grows by exactly one row pitch per extra
payer; `truncateToWidth` with an injected measure, including the exact-fit and
shorter-than-max cases; `dataUrlToBlob` producing the right size and type.

**`test/image.test.js`** - `fitWithin` for landscape, portrait, square,
already-small (no upscale) and zero-dimension inputs.

**`test/components.test.js`** additions - `PaymentQr` emits `update` on upload
and clears on remove; the example note appears only when `isExample`; Clear items
empties items while leaving vouchers intact; `ShareActions` label reflects the
probed capability.

## Files

New: `src/lib/storage.js`, `src/lib/image.js`, `src/lib/shareCard.js`,
`src/components/PaymentQr.vue`, `src/components/ShareActions.vue`,
`docs/how-it-works.md`, `test/storage.test.js`, `test/shareCard.test.js`,
`test/image.test.js`.

Changed: `src/composables/useSplitter.js`, `src/App.vue`,
`src/components/ItemsEditor.vue`, `README.md`, `test/components.test.js`.

Unchanged: `src/lib/solver.js`, `src/lib/plan.js`, `src/lib/money.js`,
`src/components/CopySummaryButton.vue`.
