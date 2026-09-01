// A phone screenshot runs to a couple of megabytes against a localStorage
// budget of around five. Cropping to the QR and downscaling on import is what
// makes keeping it in the browser viable at all.
export const QR_MAX_EDGE = 512
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// Below this the crop box is too small to grab, and too small to hold a
// readable QR.
export const MIN_CROP_PX = 32

export function fitWithin (width, height, maxEdge) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

// The largest centred square - the best guess at where a QR sits in a
// screenshot, and the starting position for the crop box.
export function initialCropRect (width, height) {
  if (!(width > 0) || !(height > 0)) return { x: 0, y: 0, size: 0 }
  const size = Math.min(width, height)
  return {
    x: Math.round((width - size) / 2),
    y: Math.round((height - size) / 2),
    size
  }
}

/**
 * Keeps a square crop box inside the image and at a usable size. Every drag and
 * resize goes through this, so the box can never leave the picture.
 */
export function clampCropRect (rect, bounds) {
  // A square larger than the shorter edge could not fit at all, and that cap
  // beats the minimum when the source itself is tiny.
  const largest = Math.min(bounds.width, bounds.height)
  const size = Math.min(Math.max(rect.size || 0, MIN_CROP_PX), largest)

  return {
    x: Math.round(Math.min(Math.max(rect.x || 0, 0), bounds.width - size)),
    y: Math.round(Math.min(Math.max(rect.y || 0, 0), bounds.height - size)),
    size: Math.round(size)
  }
}

// Throws with a message meant for the user rather than the console.
export function validateUpload (file) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('That is not an image file.')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('That image is too big. A screenshot of the QR is plenty.')
  }
}

/**
 * Cuts the chosen square out of a decoded image. Never upscales - a small crop
 * stays small rather than being blown up to the limit and blurred.
 */
export function cropToDataUrl (image, rect, maxEdge = QR_MAX_EDGE) {
  const { width: size } = fitWithin(rect.size, rect.size, maxEdge)
  if (size === 0) throw new Error('Could not read that image.')

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, rect.x, rect.y, rect.size, rect.size, 0, 0, size, size)

  // PNG, never JPEG. JPEG ringing around the high-contrast edges of QR modules
  // can stop a scanner reading it - lossless matters more than bytes here.
  return canvas.toDataURL('image/png')
}
