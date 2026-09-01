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
