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
