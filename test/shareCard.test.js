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
