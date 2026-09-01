import { describe, it, expect } from 'vitest'
import {
  fitWithin, initialCropRect, clampCropRect, validateUpload,
  QR_MAX_EDGE, MIN_CROP_PX, MAX_UPLOAD_BYTES
} from '../src/lib/image.js'

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

describe('initialCropRect', () => {
  it('centres the largest square in a landscape image', () => {
    expect(initialCropRect(1000, 500)).toEqual({ x: 250, y: 0, size: 500 })
  })

  it('centres the largest square in a portrait image', () => {
    expect(initialCropRect(500, 1000)).toEqual({ x: 0, y: 250, size: 500 })
  })

  it('fills a square image exactly', () => {
    expect(initialCropRect(400, 400)).toEqual({ x: 0, y: 0, size: 400 })
  })

  it('rounds to whole pixels on an odd difference', () => {
    const rect = initialCropRect(101, 50)
    expect(Number.isInteger(rect.x)).toBe(true)
    expect(rect.size).toBe(50)
  })

  it('collapses to nothing for a degenerate size', () => {
    expect(initialCropRect(0, 100)).toEqual({ x: 0, y: 0, size: 0 })
    expect(initialCropRect(NaN, NaN)).toEqual({ x: 0, y: 0, size: 0 })
  })
})

describe('clampCropRect', () => {
  const bounds = { width: 400, height: 300 }

  it('leaves a box that already fits alone', () => {
    expect(clampCropRect({ x: 50, y: 50, size: 100 }, bounds)).toEqual({ x: 50, y: 50, size: 100 })
  })

  it('pulls a box back inside the left and top edges', () => {
    expect(clampCropRect({ x: -30, y: -80, size: 100 }, bounds)).toEqual({ x: 0, y: 0, size: 100 })
  })

  it('pulls a box back inside the right and bottom edges', () => {
    expect(clampCropRect({ x: 999, y: 999, size: 100 }, bounds)).toEqual({ x: 300, y: 200, size: 100 })
  })

  // The square can never exceed the shorter edge, or it would not fit at all.
  it('caps the size at the shorter edge', () => {
    expect(clampCropRect({ x: 0, y: 0, size: 9999 }, bounds)).toEqual({ x: 0, y: 0, size: 300 })
  })

  it('refuses to shrink below a usable minimum', () => {
    expect(clampCropRect({ x: 0, y: 0, size: 1 }, bounds).size).toBe(MIN_CROP_PX)
    expect(clampCropRect({ x: 0, y: 0, size: -50 }, bounds).size).toBe(MIN_CROP_PX)
  })

  // A tiny source image is smaller than the minimum; fitting wins over the floor.
  it('lets a tiny image cap the size below the minimum', () => {
    expect(clampCropRect({ x: 0, y: 0, size: 5 }, { width: 10, height: 10 }).size).toBe(10)
  })
})

describe('validateUpload', () => {
  it('accepts an image within the size limit', () => {
    expect(() => validateUpload({ type: 'image/png', size: 1000 })).not.toThrow()
  })

  it('rejects a file that is not an image', () => {
    expect(() => validateUpload({ type: 'application/pdf', size: 10 }))
      .toThrow('That is not an image file.')
  })

  it('rejects a missing file', () => {
    expect(() => validateUpload(null)).toThrow('That is not an image file.')
  })

  it('rejects a file over the upload limit', () => {
    expect(() => validateUpload({ type: 'image/png', size: MAX_UPLOAD_BYTES + 1 }))
      .toThrow(/too big/)
  })
})
