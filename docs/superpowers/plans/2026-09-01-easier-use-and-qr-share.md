# Easier to Use, and a Shareable Payment Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app remember your basket instead of starting on a demo, let you attach a payment QR, and share a summary image carrying it.

**Architecture:** Three pure lib modules (`storage.js`, `image.js`, `shareCard.js`) hold all the new logic and carry the tests. Vue components stay thin, keeping the existing props-down/events-up convention. The share card is drawn with the plain 2D canvas API — no new dependency.

**Tech Stack:** Vue 3.5 (Composition API, `<script setup>`), Vite 6, Vitest 3 + jsdom, `@vue/test-utils`, Tailwind CSS v4. **No new runtime dependencies.**

**Spec:** `docs/superpowers/specs/2026-09-01-easier-use-and-qr-share-design.md`

## Global Constraints

- **No new dependencies.** `package.json` gains nothing.
- **Code style:** no semicolons, single quotes, 2-space indent, 100-column width (`.prettierrc`). Match the surrounding files.
- **All money is integer cents** until it reaches `rm()`. Never do ringgit arithmetic.
- **Components never mutate props.** Emit `update`, let the parent apply it.
- **The existing 59 tests must stay green.** `solver.js`, `plan.js`, `money.js` and `CopySummaryButton.vue` are not to be modified.
- **Semantic class hooks** (`.item-row`, `.card`, `.persons`, …) are part of each component's test contract. New components get the same treatment.
- **localStorage keys:** `shopee-splitter/state` and `shopee-splitter/qr`, schema `v: 1`.
- **QR images are stored as PNG, never JPEG** — JPEG ringing can stop a scanner reading QR modules.
- **The share card uses a fixed light palette**, never the app's dark theme.
- Run `npm test` before every commit. Run `npm run lint` before the final commit of each task.

## Two corrections to the spec

Found while writing this plan; the tasks below carry the fix.

1. **`options` drops `deliveryCents`.** The spec gave `layoutCard` options of `{ deliveryCents, qrImage, qrPayee }`, reasoning by analogy with `buildSummary`. But the compact card shows names, amounts, total and flat rate — no delivery breakdown — so `deliveryCents` would be an unused parameter. Options are `{ qrImage, qrPayee }`, plus `qrElement` on `renderCardPngDataUrl` for the already-decoded image.

2. **No explicit `dirty` flag is needed.** The spec called for one to gate persistence until the user's first edit. A Vue `watch` without `immediate: true` does not fire on setup, so the save watcher already achieves exactly this. A separate flag would be dead state.

3. **`dismissExampleNote()` is dropped.** The spec listed it among the composable's actions. But the note reads *"Clear items to enter your own"*, and both Clear items and any edit at all already clear it — so a separate dismiss control would be a second way to do what the note is telling you to do. If it turns out to be wanted, it is a one-line action on `isExample`.

---

## Task 1: `storage.js` — versioned localStorage with validation

**Files:**
- Create: `src/lib/storage.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Consumes: `MAX_ORDERS` from `src/lib/solver.js`, `DEFAULT_DELIVERY_FEE` from `src/lib/defaults.js`
- Produces:
  - `STATE_KEY: string`, `QR_KEY: string`, `SCHEMA_VERSION: number`
  - `loadState(): null | { items, vouchers, deliveryVouchers, deliveryFee, chosenOrderCount }` — rows are objects of strings; `null` means "treat as a first visit"
  - `saveState(state): boolean` — `false` when it could not persist
  - `loadQr(): null | { image: string, payee: string }`
  - `saveQr(qr): boolean` — `saveQr(null)` removes the key

- [ ] **Step 1: Write the failing tests**

Create `test/storage.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  STATE_KEY, QR_KEY, SCHEMA_VERSION,
  loadState, saveState, loadQr, saveQr
} from '../src/lib/storage.js'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

const validState = {
  items: [{ name: 'Teh Ais', who: 'Ali', price: '4.50', qty: '2' }],
  vouchers: [{ min: '48', off: '13' }],
  deliveryVouchers: [{ min: '25', off: '6.30' }],
  deliveryFee: '6.30',
  chosenOrderCount: 2
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('loadState', () => {
  it('round-trips a saved state', () => {
    expect(saveState(validState)).toBe(true)
    expect(loadState()).toEqual(validState)
  })

  it('returns null when nothing is stored', () => {
    expect(loadState()).toBeNull()
  })

  it('returns null on unparseable JSON', () => {
    localStorage.setItem(STATE_KEY, '{not json')
    expect(loadState()).toBeNull()
  })

  it('returns null on a schema version it does not know', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...validState, v: SCHEMA_VERSION + 1 }))
    expect(loadState()).toBeNull()
  })

  it('returns null when the record is not an object', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify([1, 2, 3]))
    expect(loadState()).toBeNull()
  })

  // The example belongs to a true first visit. Having it reappear after a
  // storage glitch would be baffling, so malformed items give a blank row.
  it('falls back to one blank row, not the example, when items are malformed', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...validState, v: SCHEMA_VERSION, items: 'nope' }))
    expect(loadState().items).toEqual([{ name: '', who: '', price: '', qty: '1' }])
  })

  it('drops non-object entries and coerces every field to a string', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      ...validState, v: SCHEMA_VERSION,
      items: [null, 'x', { name: 'Kopi', who: null, price: 3.9, qty: 2 }]
    }))
    expect(loadState().items).toEqual([{ name: 'Kopi', who: '', price: '3.9', qty: '2' }])
  })

  it('truncates absurd arrays', () => {
    const items = Array.from({ length: 250 }, () => ({ name: 'x', who: '', price: '1', qty: '1' }))
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...validState, v: SCHEMA_VERSION, items }))
    expect(loadState().items).toHaveLength(200)
  })

  it('rejects an out-of-range chosenOrderCount', () => {
    localStorage.setItem(STATE_KEY,
      JSON.stringify({ ...validState, v: SCHEMA_VERSION, chosenOrderCount: 99 }))
    expect(loadState().chosenOrderCount).toBe(0)
  })

  it('rejects a negative delivery fee', () => {
    localStorage.setItem(STATE_KEY,
      JSON.stringify({ ...validState, v: SCHEMA_VERSION, deliveryFee: '-5' }))
    expect(loadState().deliveryFee).toBe('6.30')
  })
})

describe('saveState', () => {
  it('reports false when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(saveState(validState)).toBe(false)
  })

  it('reports false when there is no localStorage at all', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(saveState(validState)).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('loadQr', () => {
  it('round-trips a QR', () => {
    expect(saveQr({ image: PNG, payee: 'Amin' })).toBe(true)
    expect(loadQr()).toEqual({ image: PNG, payee: 'Amin' })
  })

  // A stored remote URL would make the app fetch an address it never chose.
  it('rejects an image that is not inline data', () => {
    localStorage.setItem(QR_KEY,
      JSON.stringify({ v: SCHEMA_VERSION, image: 'https://evil.example/qr.png', payee: 'x' }))
    expect(loadQr()).toBeNull()
  })

  it('trims and caps the payee name', () => {
    saveQr({ image: PNG, payee: '  ' + 'a'.repeat(60) + '  ' })
    expect(loadQr().payee).toBe('a'.repeat(40))
  })

  it('removes the key when saved as null', () => {
    saveQr({ image: PNG, payee: 'Amin' })
    expect(saveQr(null)).toBe(true)
    expect(loadQr()).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/storage.test.js`
Expected: FAIL — `Failed to resolve import "../src/lib/storage.js"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/storage.js`:

```js
import { MAX_ORDERS } from './solver.js'
import { DEFAULT_DELIVERY_FEE } from './defaults.js'

// Two keys, not one. The QR is around 100 KB and the basket changes on every
// keystroke - a single key would rewrite the QR blob on each character typed.
export const STATE_KEY = 'shopee-splitter/state'
export const QR_KEY = 'shopee-splitter/qr'
export const SCHEMA_VERSION = 1

// Corrupt-data guards, not product limits.
const MAX_ITEMS = 200
const MAX_VOUCHERS = 50
const MAX_PAYEE = 40

const ITEM_FIELDS = ['name', 'who', 'price', 'qty']
const VOUCHER_FIELDS = ['min', 'off']

const str = value => String(value ?? '')
const blankItem = () => ({ name: '', who: '', price: '', qty: '1' })

// Private browsing, a disabled store and a full quota all land here, and all
// mean the same thing: the app works, it just does not remember.
function readKey (key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeKey (key, value) {
  try {
    if (value === null) globalThis.localStorage.removeItem(key)
    else globalThis.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function parseRecord (raw) {
  if (!raw) return null
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (data.v !== SCHEMA_VERSION) return null
  return data
}

function normaliseRows (value, fields, cap) {
  if (!Array.isArray(value)) return null
  return value
    .filter(row => row && typeof row === 'object' && !Array.isArray(row))
    .slice(0, cap)
    .map(row => Object.fromEntries(fields.map(field => [field, str(row[field])])))
}

export function loadState () {
  const data = parseRecord(readKey(STATE_KEY))
  if (!data) return null

  const items = normaliseRows(data.items, ITEM_FIELDS, MAX_ITEMS)
  const vouchers = normaliseRows(data.vouchers, VOUCHER_FIELDS, MAX_VOUCHERS)
  const deliveryVouchers = normaliseRows(data.deliveryVouchers, VOUCHER_FIELDS, MAX_VOUCHERS)

  const fee = Number(data.deliveryFee)
  const count = data.chosenOrderCount

  return {
    // A malformed field falls back on its own, and items fall back to a blank
    // row rather than the example basket.
    items: items && items.length > 0 ? items : [blankItem()],
    vouchers: vouchers ?? [],
    deliveryVouchers: deliveryVouchers ?? [],
    deliveryFee: Number.isFinite(fee) && fee >= 0 ? str(data.deliveryFee) : DEFAULT_DELIVERY_FEE,
    chosenOrderCount: Number.isInteger(count) && count >= 0 && count <= MAX_ORDERS ? count : 0
  }
}

export function saveState (state) {
  return writeKey(STATE_KEY, {
    v: SCHEMA_VERSION,
    items: state.items,
    vouchers: state.vouchers,
    deliveryVouchers: state.deliveryVouchers,
    deliveryFee: state.deliveryFee,
    chosenOrderCount: state.chosenOrderCount
  })
}

export function loadQr () {
  const data = parseRecord(readKey(QR_KEY))
  if (!data) return null
  // Only inline data is accepted. A remote URL here would make the app fetch an
  // address chosen by whoever wrote the storage entry.
  if (typeof data.image !== 'string' || !data.image.startsWith('data:image/')) return null
  return { image: data.image, payee: str(data.payee).trim().slice(0, MAX_PAYEE) }
}

export function saveQr (qr) {
  if (qr === null) return writeKey(QR_KEY, null)
  return writeKey(QR_KEY, {
    v: SCHEMA_VERSION,
    image: qr.image,
    payee: str(qr.payee).trim().slice(0, MAX_PAYEE)
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/storage.test.js`
Expected: PASS, 16 tests

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: all previous tests still pass; no lint errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.js test/storage.test.js
git commit -m "feat: versioned localStorage with per-field validation"
```

---

## Task 2: Persist and hydrate in `useSplitter`

**Files:**
- Modify: `src/composables/useSplitter.js`
- Test: `test/components.test.js` (append a `useSplitter persistence` describe block)

**Interfaces:**
- Consumes: `loadState`, `saveState` from Task 1
- Produces: `useSplitter()` additionally returns `isExample: Ref<boolean>`, `persistFailed: Ref<boolean>`, `clearItems()`, `loadExample()`

- [ ] **Step 1: Write the failing tests**

First widen the existing vitest import at the top of `test/components.test.js` —
it currently pulls in only `describe, it, expect, vi`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
```

Then append to the same file:

```js
import { useSplitter } from '../src/composables/useSplitter.js'
import { STATE_KEY, SCHEMA_VERSION } from '../src/lib/storage.js'
import { effectScope } from 'vue'

describe('useSplitter persistence', () => {
  // The composable registers watchers, so it needs an owning scope to run in.
  function withSplitter (fn) {
    const scope = effectScope()
    const result = scope.run(() => fn(useSplitter()))
    scope.stop()
    return result
  }

  beforeEach(() => localStorage.clear())

  it('seeds the example and flags it on a first visit', () => {
    withSplitter(s => {
      expect(s.isExample.value).toBe(true)
      expect(s.items.value[0].name).toBe('Nasi Lemak Ayam')
    })
  })

  it('hydrates from storage instead, and does not flag an example', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      v: SCHEMA_VERSION,
      items: [{ name: 'Kopi O', who: '', price: '3.90', qty: '1' }],
      vouchers: [], deliveryVouchers: [], deliveryFee: '5.00', chosenOrderCount: 0
    }))
    withSplitter(s => {
      expect(s.isExample.value).toBe(false)
      expect(s.items.value).toEqual([{ name: 'Kopi O', who: '', price: '3.90', qty: '1' }])
    })
  })

  // Otherwise a first-time visitor who reloads without touching anything would
  // have the example saved as if it were their own.
  it('writes nothing until the first edit', async () => {
    withSplitter(async s => {
      await nextTick()
      expect(localStorage.getItem(STATE_KEY)).toBeNull()
    })
  })

  it('clears the example flag on any edit', async () => {
    await withSplitter(async s => {
      s.updateItem(0, 'price', '9.99')
      await nextTick()
      expect(s.isExample.value).toBe(false)
    })
  })

  it('clearItems leaves one blank row and keeps the vouchers', () => {
    withSplitter(s => {
      const voucherCount = s.vouchers.value.length
      s.clearItems()
      expect(s.items.value).toEqual([{ name: '', who: '', price: '', qty: '1' }])
      expect(s.vouchers.value).toHaveLength(voucherCount)
    })
  })

  it('loadExample restores the demo basket', () => {
    withSplitter(s => {
      s.clearItems()
      s.loadExample()
      expect(s.items.value).toHaveLength(5)
      expect(s.items.value[0].name).toBe('Nasi Lemak Ayam')
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/components.test.js -t "useSplitter persistence"`
Expected: FAIL — `s.isExample is undefined`

- [ ] **Step 3: Write the implementation**

In `src/composables/useSplitter.js`, add the import:

```js
import { loadState, saveState } from '../lib/storage.js'
```

Add next to `SOLVE_DEBOUNCE_MS`:

```js
const PERSIST_DEBOUNCE_MS = 400
```

Replace the five state declarations at the top of `useSplitter()` with:

```js
  const stored = loadState()
  const isExample = ref(stored === null)
  const persistFailed = ref(false)

  const deliveryFee = ref(stored?.deliveryFee ?? DEFAULT_DELIVERY_FEE)
  const items = ref(stored?.items ?? DEFAULT_ITEMS.map(item => ({ ...item })))
  const vouchers = ref(stored?.vouchers ?? DEFAULT_VOUCHERS.map(voucher => ({ ...voucher })))
  const deliveryVouchers = ref(
    stored?.deliveryVouchers ?? DEFAULT_DELIVERY_VOUCHERS.map(voucher => ({ ...voucher }))
  )

  // 0 means "whatever is cheapest"; anything else is a plan the user picked.
  const chosenOrderCount = ref(stored?.chosenOrderCount ?? 0)
  const solving = ref(false)
```

Add after the existing solve watcher:

```js
  // Persistence is deliberately on its own timer rather than sharing the solve
  // debounce - solving and saving have different cadences.
  //
  // A watch does not fire on setup, so nothing is written until the user
  // actually edits something. That is what stops a first-time visitor who
  // reloads without touching anything from having the example basket saved as
  // if it were their own.
  let persistTimer = null

  watch([items, vouchers, deliveryVouchers, deliveryFee, chosenOrderCount], () => {
    isExample.value = false
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      persistFailed.value = !saveState({
        items: items.value,
        vouchers: vouchers.value,
        deliveryVouchers: deliveryVouchers.value,
        deliveryFee: deliveryFee.value,
        chosenOrderCount: chosenOrderCount.value
      })
    }, PERSIST_DEBOUNCE_MS)
  }, { deep: true })
```

Extend the existing `onScopeDispose` to clear both timers:

```js
  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
    if (persistTimer) clearTimeout(persistTimer)
  })
```

Add the two actions beside `removeItem`:

```js
  // Items change every order; the voucher list rarely does. Clearing keeps the
  // vouchers, the delivery fee and the QR.
  function clearItems () {
    items.value = [blankItem()]
  }

  function loadExample () {
    items.value = DEFAULT_ITEMS.map(item => ({ ...item }))
    vouchers.value = DEFAULT_VOUCHERS.map(voucher => ({ ...voucher }))
    deliveryVouchers.value = DEFAULT_DELIVERY_VOUCHERS.map(voucher => ({ ...voucher }))
    deliveryFee.value = DEFAULT_DELIVERY_FEE
  }
```

Add to the returned object — `isExample` and `persistFailed` under `// state`, `clearItems` and `loadExample` under `// actions`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/components.test.js -t "useSplitter persistence"`
Expected: PASS, 6 tests

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: all green

- [ ] **Step 6: Commit**

```bash
git add src/composables/useSplitter.js test/components.test.js
git commit -m "feat: remember the basket, and stop reseeding the example"
```

---

## Task 3: Clear items, load example, and the example note

**Files:**
- Modify: `src/components/ItemsEditor.vue`
- Modify: `src/App.vue`
- Test: `test/components.test.js` (extend the existing `ItemsEditor` describe block)

**Interfaces:**
- Consumes: `isExample`, `persistFailed`, `clearItems`, `loadExample` from Task 2
- Produces: `ItemsEditor` gains prop `isExample: Boolean` and emits `clear` and `load-example`

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe('ItemsEditor', ...)` block in `test/components.test.js`:

```js
  it('shows the example note only when the basket is the example', () => {
    expect(mount(ItemsEditor, { props }).find('.example-note').exists()).toBe(false)
    const seeded = mount(ItemsEditor, { props: { ...props, isExample: true } })
    expect(seeded.find('.example-note').exists()).toBe(true)
  })

  it('offers Clear items only when there is something to clear', () => {
    const empty = [{ name: '', who: '', price: '', qty: '1' }]
    const blank = mount(ItemsEditor, { props: { ...props, items: empty, unitCount: 0, foodTotal: 0 } })
    expect(blank.find('.clear').exists()).toBe(false)
    expect(mount(ItemsEditor, { props }).find('.clear').exists()).toBe(true)
  })

  it('emits clear and load-example', async () => {
    const wrapper = mount(ItemsEditor, { props })
    await wrapper.find('.clear').trigger('click')
    await wrapper.find('.example').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.emitted('load-example')).toHaveLength(1)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/components.test.js -t "ItemsEditor"`
Expected: FAIL — `.example-note` and `.clear` do not exist

- [ ] **Step 3: Write the implementation**

In `src/components/ItemsEditor.vue`, insert directly after the `<h2 class="card-title">` block:

```html
    <p
      v-if="isExample"
      class="example-note mb-2.5 rounded-[10px] bg-accent-soft px-3 py-2.5 text-[13px] text-accent"
    >
      This is an example basket — <strong>Clear items</strong> to enter your own.
    </p>
```

Insert directly after `<p class="hint">{{ summary }}</p>`:

```html
    <div class="tools mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <button
        v-if="hasContent"
        class="clear cursor-pointer text-muted underline underline-offset-2 hover:text-accent"
        type="button"
        @click="emit('clear')"
      >
        Clear items
      </button>
      <button
        class="example cursor-pointer text-muted underline underline-offset-2 hover:text-accent"
        type="button"
        @click="emit('load-example')"
      >
        Load example
      </button>
    </div>
```

In the `<script setup>`, add the prop, the emits, and the computed:

```js
const props = defineProps({
  items: { type: Array, required: true },
  unitCount: { type: Number, required: true },
  foodTotal: { type: Number, required: true },
  payerCount: { type: Number, default: 0 },
  isExample: { type: Boolean, default: false }
})

const emit = defineEmits(['update', 'add', 'remove', 'clear', 'load-example'])

// A Clear button over an already-empty basket is noise.
const hasContent = computed(() =>
  props.items.some(item => item.name || item.who || item.price)
)
```

In `src/App.vue`, extend the `ItemsEditor` usage:

```html
        <ItemsEditor
          :items="items"
          :unit-count="unitCount"
          :food-total="foodTotal"
          :payer-count="payerCount"
          :is-example="isExample"
          @update="updateItem"
          @add="addItem"
          @remove="removeItem"
          @clear="clearItems"
          @load-example="loadExample"
        />
```

Add `isExample`, `persistFailed`, `clearItems` and `loadExample` to the destructured `useSplitter()` call.

Add beneath the status paragraph in the output column:

```html
        <p
          v-if="persistFailed"
          class="persist-warn mx-0.5 mb-3.5 text-xs text-warn"
        >
          Couldn't save on this device — your basket will not be remembered.
        </p>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/components.test.js -t "ItemsEditor"`
Expected: PASS

- [ ] **Step 5: Verify it in the browser**

Run: `npm run dev` and open http://localhost:5175

Check: the example note shows on a fresh profile; typing a price makes it vanish; Clear items empties the basket but leaves the vouchers; Load example restores it; a reload brings back what you left.

- [ ] **Step 6: Run the full suite and lint, then commit**

```bash
npm test && npm run lint
git add src/components/ItemsEditor.vue src/App.vue test/components.test.js
git commit -m "feat: clear items, load example, and label the seeded basket"
```

---

## Task 4: `image.js` — downscale an uploaded QR

**Files:**
- Create: `src/lib/image.js`
- Test: `test/image.test.js`

**Interfaces:**
- Produces:
  - `QR_MAX_EDGE: 512`, `MAX_UPLOAD_BYTES: number`
  - `fitWithin(width, height, maxEdge): { width, height }` — pure, never upscales
  - `downscaleToDataUrl(file, maxEdge?): Promise<string>` — a `data:image/png;base64,…` URL; rejects with a user-facing `Error`

**Note on test coverage:** only `fitWithin` is unit tested. `downscaleToDataUrl` depends on `URL.createObjectURL` and real image decoding, neither of which jsdom implements — mocking them would test the mock, not the code. It is verified in the browser in Task 5 instead.

- [ ] **Step 1: Write the failing tests**

Create `test/image.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { fitWithin, QR_MAX_EDGE } from '../src/lib/image.js'

describe('fitWithin', () => {
  it('scales a landscape image by its longest edge', () => {
    expect(fitWithin(1000, 500, 512)).toEqual({ width: 512, height: 256 })
  })

  it('scales a portrait image by its longest edge', () => {
    expect(fitWithin(500, 1000, 512)).toEqual({ width: 256, height: 512 })
  })

  it('scales a square image', () => {
    expect(fitWithin(1024, 1024, 512)).toEqual({ width: 512, height: 512 })
  })

  // Blowing a small QR up to 512 would add nothing but bytes and blur.
  it('never upscales', () => {
    expect(fitWithin(300, 200, 512)).toEqual({ width: 300, height: 200 })
  })

  it('passes through an image already at the limit', () => {
    expect(fitWithin(512, 512, 512)).toEqual({ width: 512, height: 512 })
  })

  it('returns zeroes for a degenerate size', () => {
    expect(fitWithin(0, 100, 512)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(NaN, NaN, 512)).toEqual({ width: 0, height: 0 })
  })

  it('defaults the QR edge to 512', () => {
    expect(QR_MAX_EDGE).toBe(512)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/image.test.js`
Expected: FAIL — `Failed to resolve import "../src/lib/image.js"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/image.js`:

```js
// A phone screenshot runs to a couple of megabytes against a localStorage
// budget of around five. Downscaling on import is what makes keeping the QR in
// the browser viable at all.
export const QR_MAX_EDGE = 512
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export function fitWithin (width, height, maxEdge) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function loadImage (file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image.'))
    }
    image.src = url
  })
}

export async function downscaleToDataUrl (file, maxEdge = QR_MAX_EDGE) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('That is not an image file.')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('That image is too big. A screenshot of the QR is plenty.')
  }

  const image = await loadImage(file)
  const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, maxEdge)
  if (width === 0) throw new Error('Could not read that image.')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, width, height)

  // PNG, never JPEG. JPEG ringing around the high-contrast edges of QR modules
  // can stop a scanner reading it - lossless matters more than bytes here.
  return canvas.toDataURL('image/png')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/image.test.js`
Expected: PASS, 7 tests

- [ ] **Step 5: Run the full suite and lint, then commit**

```bash
npm test && npm run lint
git add src/lib/image.js test/image.test.js
git commit -m "feat: downscale an uploaded QR to a storable PNG"
```

---

## Task 5: `PaymentQr.vue` — upload, preview, remove

**Files:**
- Create: `src/components/PaymentQr.vue`
- Modify: `src/composables/useSplitter.js`
- Modify: `src/App.vue`
- Test: `test/components.test.js` (new `PaymentQr` describe block)

**Interfaces:**
- Consumes: `downscaleToDataUrl` from Task 4; `loadQr`, `saveQr` from Task 1
- Produces:
  - `PaymentQr` props `image: String`, `payee: String`; emits `update(field, value)` where `field` is `'image'` or `'payee'`
  - `useSplitter()` additionally returns `qrImage: Ref<string>`, `qrPayee: Ref<string>`, `setQr(field, value)`

- [ ] **Step 1: Write the failing tests**

Add to `test/components.test.js`:

```js
import PaymentQr from '../src/components/PaymentQr.vue'

describe('PaymentQr', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo='

  it('invites an upload when there is no QR yet', () => {
    const wrapper = mount(PaymentQr, { props: { image: '', payee: '' } })
    expect(wrapper.find('.qr-preview').exists()).toBe(false)
    expect(wrapper.find('.qr-drop').exists()).toBe(true)
  })

  it('previews a stored QR and offers to remove it', async () => {
    const wrapper = mount(PaymentQr, { props: { image: PNG, payee: 'Amin' } })
    expect(wrapper.find('.qr-preview').attributes('src')).toBe(PNG)
    await wrapper.find('.qr-remove').trigger('click')
    expect(wrapper.emitted('update')).toEqual([['image', '']])
  })

  it('reports a payee edit upward instead of mutating the prop', async () => {
    const wrapper = mount(PaymentQr, { props: { image: PNG, payee: '' } })
    await wrapper.find('.qr-payee').setValue('Amin')
    expect(wrapper.emitted('update')).toEqual([['payee', 'Amin']])
  })

  it('says plainly that the QR never leaves the browser', () => {
    const wrapper = mount(PaymentQr, { props: { image: '', payee: '' } })
    expect(wrapper.text()).toContain('never uploaded')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/components.test.js -t "PaymentQr"`
Expected: FAIL — cannot resolve `PaymentQr.vue`

- [ ] **Step 3: Create the component**

Create `src/components/PaymentQr.vue`:

```html
<template>
  <section class="card qr-card">
    <h2 class="card-title">
      Your payment QR
    </h2>

    <div
      v-if="!image"
      class="qr-drop flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px]
             border border-dashed border-line p-5 text-center hover:border-accent"
      @click="picker?.click()"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <span class="text-sm font-semibold text-accent">Add your DuitNow or TNG QR</span>
      <span class="text-xs text-muted">Drop a screenshot here, or tap to choose one</span>
    </div>

    <div
      v-else
      class="flex items-start gap-3"
    >
      <img
        class="qr-preview h-24 w-24 rounded-[10px] border border-line bg-white object-contain p-1"
        :src="image"
        alt="Your payment QR"
      >
      <div class="flex flex-col gap-1.5">
        <button
          class="qr-replace cursor-pointer text-xs text-muted underline underline-offset-2
                 hover:text-accent"
          type="button"
          @click="picker?.click()"
        >
          Replace
        </button>
        <button
          class="qr-remove cursor-pointer text-xs text-muted underline underline-offset-2
                 hover:text-accent"
          type="button"
          @click="emit('update', 'image', '')"
        >
          Remove
        </button>
      </div>
    </div>

    <input
      ref="picker"
      class="hidden"
      type="file"
      accept="image/*"
      @change="onPick"
    >

    <label class="field mt-3 block">
      <span class="mb-1.5 block text-xs text-muted">Who to pay (shown under the QR)</span>
      <input
        class="qr-payee"
        type="text"
        maxlength="40"
        placeholder="Your name"
        :value="payee"
        @input="emit('update', 'payee', $event.target.value)"
      >
    </label>

    <p
      v-if="error"
      class="qr-error mt-2.5 text-xs text-warn"
    >
      {{ error }}
    </p>
    <p class="hint">
      Saved in this browser only, and never uploaded. Attach it to the summary so
      whoever owes you can scan and pay.
    </p>
  </section>
</template>

<script setup>
import { ref, useTemplateRef } from 'vue'
import { downscaleToDataUrl } from '../lib/image.js'

defineProps({
  image: { type: String, default: '' },
  payee: { type: String, default: '' }
})

const emit = defineEmits(['update'])

const picker = useTemplateRef('picker')
const error = ref('')

async function accept (file) {
  error.value = ''
  try {
    emit('update', 'image', await downscaleToDataUrl(file))
  } catch (problem) {
    error.value = problem.message
  }
}

function onPick (event) {
  const file = event.target.files?.[0]
  // Reset the input so picking the same file twice still fires a change.
  event.target.value = ''
  if (file) accept(file)
}

function onDrop (event) {
  const file = event.dataTransfer?.files?.[0]
  if (file) accept(file)
}
</script>
```

- [ ] **Step 4: Wire the QR into `useSplitter`**

Extend the storage import in `src/composables/useSplitter.js`:

```js
import { loadState, saveState, loadQr, saveQr } from '../lib/storage.js'
```

Add beside the other state:

```js
  const storedQr = loadQr()
  const qrImage = ref(storedQr?.image ?? '')
  const qrPayee = ref(storedQr?.payee ?? '')
```

Add a second persist watcher, on its own timer:

```js
  // The QR lives under its own key on its own watcher. It is around 100 KB, and
  // folding it into the state record would rewrite that blob on every keystroke.
  let qrTimer = null

  watch([qrImage, qrPayee], () => {
    if (qrTimer) clearTimeout(qrTimer)
    qrTimer = setTimeout(() => {
      qrTimer = null
      persistFailed.value = qrImage.value
        ? !saveQr({ image: qrImage.value, payee: qrPayee.value })
        : !saveQr(null)
    }, PERSIST_DEBOUNCE_MS)
  })
```

Extend `onScopeDispose` to also clear `qrTimer`.

Add the action:

```js
  function setQr (field, value) {
    if (field === 'image') qrImage.value = value
    else qrPayee.value = value
  }
```

Return `qrImage`, `qrPayee` and `setQr`.

- [ ] **Step 5: Mount it in `App.vue`**

Import `PaymentQr` and place it after the `voucher-pair` div, still inside `column-inputs`:

```html
        <PaymentQr
          :image="qrImage"
          :payee="qrPayee"
          @update="setQr"
        />
```

Destructure `qrImage`, `qrPayee` and `setQr` from `useSplitter()`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run test/components.test.js -t "PaymentQr"`
Expected: PASS, 4 tests

- [ ] **Step 7: Verify the upload path in the browser**

Run: `npm run dev`

jsdom cannot decode images, so this is the only place `downscaleToDataUrl` gets
exercised. Check: dropping a QR screenshot shows a preview; a large photo is
accepted and stored downscaled; a non-image file shows "That is not an image
file."; Remove clears it; a reload brings the QR back.

- [ ] **Step 8: Run the full suite and lint, then commit**

```bash
npm test && npm run lint
git add src/components/PaymentQr.vue src/composables/useSplitter.js src/App.vue test/components.test.js
git commit -m "feat: attach a payment QR, stored in the browser only"
```

---

## Task 6: `shareCard.js` — lay out and draw the payment card

**Files:**
- Create: `src/lib/shareCard.js`
- Test: `test/shareCard.test.js`

**Interfaces:**
- Consumes: `rm`, `plural`, `people` from `src/lib/money.js`
- Produces:
  - `CARD_WIDTH: 720`, `CARD_SCALE: 2`, `CARD_PAD: 40`, `CARD_ROW_PITCH: 44`, `CARD_COLORS: object`
  - `layoutCard(plan, options): { width, height, blocks }` — pure; `options` is `{ qrImage, qrPayee }`
  - `truncateToWidth(text, maxWidth, measure): string` — pure; `measure` is injected so it is testable without a canvas
  - `drawCard(layout, ctx, qrElement)` — draws; `qrElement` is an already-decoded `HTMLImageElement` or `null`
  - `renderCardPngDataUrl(plan, options): string` — **synchronous**; `options` adds `qrElement`
  - `dataUrlToBlob(dataUrl): Blob` — **synchronous**

- [ ] **Step 1: Write the failing tests**

Create `test/shareCard.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  CARD_WIDTH, CARD_ROW_PITCH,
  layoutCard, truncateToWidth, dataUrlToBlob
} from '../src/lib/shareCard.js'

const plan = (personCount = 2) => ({
  orderCount: 3,
  grandTotal: 13260,
  flatRate: 26.52,
  persons: Array.from({ length: personCount }, (_, i) => ({
    label: `Person ${i + 1}`,
    pays: 3140
  }))
})

const kinds = layout => layout.blocks.map(block => block.kind)

describe('layoutCard', () => {
  it('lays the card out in reading order when there is no QR', () => {
    expect(kinds(layoutCard(plan(2)))).toEqual([
      'title', 'rule', 'row', 'row', 'rule', 'total', 'flat', 'footer'
    ])
  })

  it('adds the QR and its caption only when a QR is stored', () => {
    const layout = layoutCard(plan(2), { qrImage: 'data:image/png;base64,x', qrPayee: 'Amin' })
    expect(kinds(layout)).toEqual([
      'title', 'rule', 'row', 'row', 'rule', 'total', 'flat', 'qr', 'caption', 'footer'
    ])
    expect(layout.blocks.find(b => b.kind === 'caption').text).toBe('Scan to pay Amin')
  })

  it('falls back to a caption without a name', () => {
    const layout = layoutCard(plan(1), { qrImage: 'data:image/png;base64,x' })
    expect(layout.blocks.find(b => b.kind === 'caption').text).toBe('Scan to pay')
  })

  it('grows by exactly one row pitch per extra payer', () => {
    expect(layoutCard(plan(6)).height - layoutCard(plan(5)).height).toBe(CARD_ROW_PITCH)
  })

  it('is a fixed width, and every block sits inside the card', () => {
    const layout = layoutCard(plan(4), { qrImage: 'data:image/png;base64,x' })
    expect(layout.width).toBe(CARD_WIDTH)
    layout.blocks.forEach(block => {
      expect(block.y).toBeGreaterThanOrEqual(0)
      expect(block.y).toBeLessThan(layout.height)
    })
  })

  it('formats amounts as ringgit and titles the order count', () => {
    const layout = layoutCard(plan(1))
    expect(layout.blocks.find(b => b.kind === 'title').text).toBe('Shopee order split · 3 orders')
    expect(layout.blocks.find(b => b.kind === 'row').amount).toBe('RM31.40')
    expect(layout.blocks.find(b => b.kind === 'total').amount).toBe('RM132.60')
  })
})

describe('truncateToWidth', () => {
  // Ten pixels a character, so the arithmetic in these cases is obvious.
  const measure = text => text.length * 10

  it('leaves text that fits alone', () => {
    expect(truncateToWidth('Ali', 100, measure)).toBe('Ali')
  })

  it('leaves text that fits exactly alone', () => {
    expect(truncateToWidth('Abcdefghij', 100, measure)).toBe('Abcdefghij')
  })

  it('trims to the longest prefix that still fits with an ellipsis', () => {
    expect(truncateToWidth('Abcdefghijk', 100, measure)).toBe('Abcdefghi…')
  })

  it('gives back nothing when there is no room', () => {
    expect(truncateToWidth('Ali', 0, measure)).toBe('')
  })
})

describe('dataUrlToBlob', () => {
  it('decodes base64 synchronously, keeping the type', () => {
    const blob = dataUrlToBlob('data:image/png;base64,aGVsbG8=')
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/shareCard.test.js`
Expected: FAIL — `Failed to resolve import "../src/lib/shareCard.js"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/shareCard.js`:

```js
import { rm, plural, people } from './money.js'

export const CARD_WIDTH = 720
export const CARD_SCALE = 2
export const CARD_PAD = 40
export const CARD_ROW_PITCH = 44

const TITLE_SIZE = 30
const ROW_SIZE = 21
const TOTAL_SIZE = 26
const FLAT_SIZE = 17
const QR_SIZE = 320
const CAPTION_SIZE = 18
const FOOTER_SIZE = 15
const GAP = 18

// The image lands in someone else's chat, so it has to read the same whatever
// the sender's OS theme is. This palette is deliberately not the app's - it
// never flips to dark.
export const CARD_COLORS = {
  bg: '#ffffff',
  ink: '#1c1c1e',
  muted: '#6b7280',
  line: '#e4e4ea',
  accent: '#ee4d2d'
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/**
 * Pure: works out where everything goes without touching a canvas, so the whole
 * layout is testable and only the drawing calls are not.
 */
export function layoutCard (plan, options = {}) {
  const { qrImage = '', qrPayee = '' } = options
  const blocks = []
  let y = CARD_PAD

  blocks.push({
    kind: 'title',
    y,
    text: `Shopee order split · ${plural(plan.orderCount, 'order')}`
  })
  y += TITLE_SIZE + GAP

  blocks.push({ kind: 'rule', y })
  y += GAP

  plan.persons.forEach(person => {
    blocks.push({ kind: 'row', y, label: person.label, amount: rm(person.pays) })
    y += CARD_ROW_PITCH
  })

  y += 6
  blocks.push({ kind: 'rule', y })
  y += GAP + 8

  blocks.push({ kind: 'total', y, label: 'TOTAL', amount: rm(plan.grandTotal) })
  y += TOTAL_SIZE + 14

  blocks.push({
    kind: 'flat',
    y,
    text: `or RM${plan.flatRate.toFixed(2)} each (${people(plan.persons.length)} paying)`
  })
  y += FLAT_SIZE + 10

  // The QR is an enhancement, not a requirement - without one the card still
  // says who owes what.
  if (qrImage) {
    y += 28
    blocks.push({ kind: 'qr', y, x: (CARD_WIDTH - QR_SIZE) / 2, size: QR_SIZE })
    y += QR_SIZE + 18
    blocks.push({ kind: 'caption', y, text: qrPayee ? `Scan to pay ${qrPayee}` : 'Scan to pay' })
    y += CAPTION_SIZE + 10
  }

  y += 22
  blocks.push({ kind: 'footer', y, text: 'Split with Shopee Order Splitter' })
  y += FOOTER_SIZE

  return { width: CARD_WIDTH, height: Math.ceil(y + CARD_PAD), blocks }
}

/**
 * `measure` is injected rather than taken from a canvas, so this can be tested
 * with arithmetic instead of a rendering context.
 */
export function truncateToWidth (text, maxWidth, measure) {
  if (maxWidth <= 0) return ''
  if (measure(text) <= maxWidth) return text

  // Largest prefix that still fits once the ellipsis is added.
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (measure(text.slice(0, mid) + '…') <= maxWidth) low = mid
    else high = mid - 1
  }
  return low > 0 ? text.slice(0, low) + '…' : '…'
}

export function drawCard (layout, ctx, qrElement = null) {
  const left = CARD_PAD
  const right = layout.width - CARD_PAD
  const centre = layout.width / 2

  ctx.fillStyle = CARD_COLORS.bg
  ctx.fillRect(0, 0, layout.width, layout.height)
  ctx.textBaseline = 'top'

  layout.blocks.forEach(block => {
    if (block.kind === 'title') {
      ctx.font = `700 ${TITLE_SIZE}px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillStyle = CARD_COLORS.ink
      ctx.fillText(block.text, left, block.y)
      return
    }

    if (block.kind === 'rule') {
      ctx.fillStyle = CARD_COLORS.line
      ctx.fillRect(left, block.y, right - left, 1)
      return
    }

    if (block.kind === 'row' || block.kind === 'total') {
      const isTotal = block.kind === 'total'
      ctx.font = `${isTotal ? 700 : 400} ${isTotal ? TOTAL_SIZE : ROW_SIZE}px ${FONT}`

      ctx.textAlign = 'right'
      ctx.fillStyle = isTotal ? CARD_COLORS.accent : CARD_COLORS.ink
      ctx.fillText(block.amount, right, block.y)

      // A long name must not run under the amount.
      const room = right - left - ctx.measureText(block.amount).width - 24
      ctx.textAlign = 'left'
      ctx.fillStyle = CARD_COLORS.ink
      ctx.fillText(
        truncateToWidth(block.label, room, text => ctx.measureText(text).width),
        left,
        block.y
      )
      return
    }

    if (block.kind === 'qr') {
      if (!qrElement) return
      // A quiet zone in white, in case the QR image is tightly cropped.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(block.x - 10, block.y - 10, block.size + 20, block.size + 20)
      ctx.drawImage(qrElement, block.x, block.y, block.size, block.size)
      return
    }

    if (block.kind === 'flat') {
      ctx.font = `400 ${FLAT_SIZE}px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillStyle = CARD_COLORS.muted
      ctx.fillText(block.text, left, block.y)
      return
    }

    if (block.kind === 'caption') {
      ctx.font = `600 ${CAPTION_SIZE}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.fillStyle = CARD_COLORS.ink
      ctx.fillText(block.text, centre, block.y)
      return
    }

    if (block.kind === 'footer') {
      ctx.font = `400 ${FOOTER_SIZE}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.fillStyle = CARD_COLORS.muted
      ctx.fillText(block.text, centre, block.y)
    }
  })
}

/**
 * Synchronous on purpose. Safari drops clipboard and share permissions across an
 * await, so the whole render-and-deliver path has to stay inside the click
 * gesture - which rules out `toBlob`.
 */
export function renderCardPngDataUrl (plan, options = {}) {
  const layout = layoutCard(plan, options)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width * CARD_SCALE
  canvas.height = layout.height * CARD_SCALE

  const ctx = canvas.getContext('2d')
  ctx.scale(CARD_SCALE, CARD_SCALE)
  drawCard(layout, ctx, options.qrElement ?? null)

  return canvas.toDataURL('image/png')
}

// Synchronous for the same reason.
export function dataUrlToBlob (dataUrl) {
  const [header, base64] = dataUrl.split(',')
  const type = header.match(/data:([^;]+)/)?.[1] ?? 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/shareCard.test.js`
Expected: PASS, 11 tests

- [ ] **Step 5: Run the full suite and lint, then commit**

```bash
npm test && npm run lint
git add src/lib/shareCard.js test/shareCard.test.js
git commit -m "feat: lay out and draw the shareable payment card"
```

---

## Task 7: `ShareActions.vue` — share, copy, or save the card

**Files:**
- Create: `src/components/ShareActions.vue`
- Modify: `src/App.vue`
- Test: `test/components.test.js` (new `ShareActions` describe block)

**Interfaces:**
- Consumes: `renderCardPngDataUrl`, `dataUrlToBlob` from Task 6; `CopySummaryButton.vue` unchanged
- Produces: `ShareActions` props `plan: Object`, `text: String`, `qrImage: String`, `qrPayee: String`

- [ ] **Step 1: Write the failing tests**

Add to `test/components.test.js`:

```js
import ShareActions from '../src/components/ShareActions.vue'

describe('ShareActions', () => {
  const plan = {
    orderCount: 2,
    grandTotal: 5000,
    flatRate: 25,
    persons: [{ label: 'Ali', pays: 2500 }, { label: 'Siti', pays: 2500 }]
  }
  const props = { plan, text: 'summary', qrImage: '', qrPayee: '' }

  afterEach(() => vi.unstubAllGlobals())

  it('offers to share when the browser can share files', async () => {
    vi.stubGlobal('navigator', { share: () => {}, canShare: () => true })
    const wrapper = mount(ShareActions, { props })
    await nextTick()
    expect(wrapper.find('.share-image').text()).toBe('Share summary image')
  })

  it('names the QR in the label once one is attached', async () => {
    vi.stubGlobal('navigator', { share: () => {}, canShare: () => true })
    const wrapper = mount(ShareActions, {
      props: { ...props, qrImage: 'data:image/png;base64,x' }
    })
    await nextTick()
    expect(wrapper.find('.share-image').text()).toBe('Share summary + QR')
  })

  it('falls back to copying when sharing is unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: { write: () => {} } })
    vi.stubGlobal('ClipboardItem', class {})
    const wrapper = mount(ShareActions, { props })
    await nextTick()
    expect(wrapper.find('.share-image').text()).toBe('Copy summary image')
  })

  it('falls back to saving when neither is available', async () => {
    vi.stubGlobal('navigator', {})
    const wrapper = mount(ShareActions, { props })
    await nextTick()
    expect(wrapper.find('.share-image').text()).toBe('Save summary image')
  })

  it('keeps the plain-text copy alongside the image', () => {
    const wrapper = mount(ShareActions, { props })
    expect(wrapper.find('.copy').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/components.test.js -t "ShareActions"`
Expected: FAIL — cannot resolve `ShareActions.vue`

- [ ] **Step 3: Create the component**

Create `src/components/ShareActions.vue`:

```html
<template>
  <div class="share flex flex-col gap-2.5">
    <button
      class="share-image w-full cursor-pointer rounded-xl bg-accent p-3.5 font-bold text-white
             active:opacity-85"
      type="button"
      @click="onImage"
    >
      {{ imageLabel }}
    </button>

    <CopySummaryButton :text="text" />

    <p
      v-if="note"
      class="share-note text-center text-xs text-muted"
    >
      {{ note }}
    </p>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { renderCardPngDataUrl, dataUrlToBlob } from '../lib/shareCard.js'
import CopySummaryButton from './CopySummaryButton.vue'

const props = defineProps({
  plan: { type: Object, required: true },
  text: { type: String, required: true },
  qrImage: { type: String, default: '' },
  qrPayee: { type: String, default: '' }
})

// What the label promises. The actual click re-probes and falls through, since
// canShare for files depends on the file's type.
const tier = ref('download')
const note = ref('')

onMounted(() => {
  if (typeof navigator === 'undefined') return
  if (navigator.share && navigator.canShare) tier.value = 'share'
  else if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') tier.value = 'copy'
})

const imageLabel = computed(() => {
  const what = props.qrImage ? 'summary + QR' : 'summary image'
  if (tier.value === 'share') return `Share ${what}`
  if (tier.value === 'copy') return `Copy ${what}`
  return `Save ${what}`
})

// Decoded ahead of time so the click handler stays synchronous.
const qrElement = ref(null)

watch(() => props.qrImage, source => {
  if (!source) {
    qrElement.value = null
    return
  }
  const image = new Image()
  image.onload = () => { qrElement.value = image }
  image.src = source
}, { immediate: true })

function filename () {
  return `shopee-split-${new Date().toISOString().slice(0, 10)}.png`
}

function download (file) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  URL.revokeObjectURL(url)
  note.value = 'Saved to your downloads.'
}

function onImage () {
  note.value = ''

  let file
  try {
    const dataUrl = renderCardPngDataUrl(props.plan, {
      qrImage: props.qrImage,
      qrPayee: props.qrPayee,
      qrElement: qrElement.value
    })
    file = new File([dataUrlToBlob(dataUrl)], filename(), { type: 'image/png' })
  } catch {
    note.value = 'Could not build the image. Copy the text instead.'
    return
  }

  // Each tier is entered from inside the click gesture - Safari drops share and
  // clipboard permissions across an await - and falls through on failure.
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch(() => {})
    return
  }

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    navigator.clipboard
      .write([new ClipboardItem({ 'image/png': file })])
      .then(() => { note.value = 'Image copied — paste it into your chat.' })
      .catch(() => download(file))
    return
  }

  download(file)
}
</script>
```

- [ ] **Step 4: Swap it into `App.vue`**

Replace the `CopySummaryButton` usage with:

```html
          <ShareActions
            :plan="plan"
            :text="summary"
            :qr-image="qrImage"
            :qr-payee="qrPayee"
          />
```

Replace the `CopySummaryButton` import with `ShareActions`. `CopySummaryButton` is still used — by `ShareActions`, not by `App`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/components.test.js -t "ShareActions"`
Expected: PASS, 5 tests

- [ ] **Step 6: Verify the card in the browser**

Run: `npm run dev`

Check: with no QR, the card renders and says who owes what; with a QR, it appears
under the total with "Scan to pay «name»"; the downloaded PNG is white-on-dark-text
even with the OS in dark mode; a very long person name is ellipsised rather than
overlapping the amount; **scan the QR out of the generated image with a phone to
confirm it still reads.**

- [ ] **Step 7: Run the full suite and lint, then commit**

```bash
npm test && npm run lint
git add src/components/ShareActions.vue src/App.vue test/components.test.js
git commit -m "feat: share the summary as an image carrying your payment QR"
```

---

## Task 8: README as the front door, internals to `docs/`

**Files:**
- Create: `docs/how-it-works.md`
- Modify: `README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Move the internals out**

Create `docs/how-it-works.md` containing, **verbatim from the current README**, these
sections in this order:

1. `## How the search works` (through the partition table and the integer-cents paragraph)
2. `## Layout` (the `src/` tree and the notes on `VoucherEditor`, `useSplitter`, the debounce, and props-down/events-up)
3. `## Styling`
4. `## Responsive layout`

Give the file this heading and lead-in above them:

```markdown
# How it works

The design notes behind Shopee Order Splitter — the search, the layout, and the
styling. For how to *use* the app, see the [README](../README.md).
```

Demote each moved `##` heading to keep one `#` at the top of the file.

- [ ] **Step 2: Rewrite the README**

Replace `README.md` entirely with:

````markdown
# Shopee Order Splitter

Shopee vouchers have minimum spends, so one big food order usually only gets to
use one of them. Splitting the same basket into several orders lets you stack
more — but every order pays its own delivery fee, and past a point those fees
cost more than the extra vouchers save.

This works out where that line falls: the cheapest way to split your basket,
which voucher goes on which order, and what everyone owes you.

Everything runs in your browser. Nothing is uploaded, and there is no account.

## Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. That is it.

To use a different port, put `VITE_APP_PORT=5175` in a `.env` file.

## How to use it

**1. Enter your items.** Name, who ordered it, the price, and how many. Only the
price really matters — the rest makes the result easier to read.

Naming is how the app knows who owes what. Give two rows the same name and they
become one payment. Leave a name blank and that row is billed on its own.

**2. Add your vouchers.** Each one is a minimum spend and an amount off. These
are your *item* vouchers — the discount codes that apply to the food subtotal.

**3. Add your delivery vouchers and the delivery fee.** Free-shipping vouchers
sit in a separate slot, so one order can use an item voucher and a delivery
voucher together. Anything at or above the delivery fee means free delivery.

**4. Read the plan.** You get the grand total first, then each order: what goes
in it, which voucher it uses, and what it costs. Under that, what each person
owes — or a flat rate if you would rather keep it simple.

**5. Compare the splits.** The table shows what one, two, three… orders would
cost. The cheapest is tagged. **Tap any row to switch to that plan** — sometimes
one fewer order is a couple of ringgit more and a lot less hassle.

Watch for the **So close** warning. It means an order is a ringgit or two short
of a voucher you are holding, and moving one item could pay for itself.

**6. Add your payment QR.** Drop a screenshot of your DuitNow or TNG QR into the
*Your payment QR* card and type your name. It is saved in your browser and never
uploaded.

**7. Share it.** *Share summary + QR* builds one image — who owes what, the
total, and your QR — and hands it to your phone's share sheet, your clipboard,
or your downloads, whichever your browser supports. Send it to the group chat
and everyone can scan and pay.

There is also *Copy summary for WhatsApp*, which copies the full order-by-order
breakdown as plain text.

## Your basket is remembered

Your items, vouchers, delivery fee and QR are saved on your device, so coming
back next week means editing last week's basket rather than starting over. Your
voucher list in particular rarely changes.

The first time you open it you get an example basket, labelled as one. **Clear
items** wipes the items and keeps your vouchers — which is the usual weekly
rhythm. **Load example** brings the demo back.

## Things worth knowing

- **Rows with no price are ignored.** They are almost always an empty row you
  have not filled in, and counting one as a person who owes nothing would
  distort both the head count and the flat rate.
- **Shares add up exactly.** Everyone pays `their share of the food / total ×
  grand total`, rounded to the cent, and the last person absorbs the remainder —
  unless that would take them below zero, in which case the biggest payer
  absorbs it.
- **Units move between orders individually.** That is what makes the vouchers
  stack, so one person's items can land in different orders while they still owe
  a single amount.
- **The seeded delivery vouchers are placeholders.** Replace them with the ones
  you actually hold.
- **`dist/` needs to be served.** Module scripts are CORS-blocked on `file://`,
  so the built output will not run by double-clicking it. Use `npm run preview`,
  or host it.

## Privacy

There is no server. Your basket and your QR are held in your own browser's
local storage and never sent anywhere. Clearing your browser data clears them.

The share image is built in the page, on your device. It goes only where you
send it.

## Development

```bash
npm run dev       # http://localhost:5173
npm test          # the full suite
npm run test:watch
npm run lint
npm run build     # -> dist/
npm run preview   # serve the built output
```

```
src/
  lib/            pure logic, no Vue — all of it unit tested
    solver.js       partitioning + voucher assignment
    plan.js         turns a split into orders, shares, near misses, summary text
    shareCard.js    lays out and draws the shareable payment card
    storage.js      versioned localStorage, with validation
    image.js        downscales an uploaded QR
    money.js        cents <-> RM
    defaults.js     the example basket
  composables/
    useSplitter.js  state, debounced solve, debounced save, derived results
  components/       one concern each, props down / events up
```

**[How it works →](docs/how-it-works.md)** — the search, the layout, the styling.
````

- [ ] **Step 3: Check every link and command**

Run: `npm run dev` and confirm the port the README states matches what Vite prints
on a clone with no `.env`. Confirm `docs/how-it-works.md` resolves from the README
and that its link back to `../README.md` resolves too.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/how-it-works.md
git commit -m "docs: lead with how to use it, move the internals to docs/"
```

---

## Final verification

- [ ] `npm test` — every test passes, including the original 59
- [ ] `npm run lint` — clean
- [ ] `npm run build` — succeeds
- [ ] `npm run preview` — a fresh profile shows the labelled example; edit, reload, and your basket is still there
- [ ] Attach a QR, share the image, and **scan it off the generated PNG with a phone**
- [ ] Toggle the OS to dark mode and confirm the shared image is still light
