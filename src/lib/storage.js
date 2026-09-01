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
