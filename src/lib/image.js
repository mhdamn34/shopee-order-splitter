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
