import { rm, plural, people } from './money.js'

export const CARD_WIDTH = 720
export const CARD_SCALE = 2
export const CARD_PAD = 40
export const CARD_ROW_PITCH = 44
export const CARD_FOOTER_LOGO = 26

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
  blocks.push({
    kind: 'footer',
    y,
    text: 'Split with Shopee Order Splitter',
    logoSize: CARD_FOOTER_LOGO
  })
  // The logo is taller than the footer text, so the taller of the two sets the
  // row height - otherwise the mark runs through the bottom padding.
  y += Math.max(FOOTER_SIZE, CARD_FOOTER_LOGO)

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

export function drawCard (layout, ctx, images = {}) {
  const { qr = null, logo = null } = images
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
      if (!qr) return
      // A quiet zone in white, in case the QR image is tightly cropped.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(block.x - 10, block.y - 10, block.size + 20, block.size + 20)
      ctx.drawImage(qr, block.x, block.y, block.size, block.size)
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
      ctx.fillStyle = CARD_COLORS.muted
      ctx.textAlign = 'left'

      // Logo and text are centred as one unit, so the pair stays balanced
      // whether or not the mark loaded.
      const gap = 10
      const lead = logo ? block.logoSize + gap : 0
      const startX = centre - (lead + ctx.measureText(block.text).width) / 2

      if (logo) ctx.drawImage(logo, startX, block.y, block.logoSize, block.logoSize)
      ctx.fillText(block.text, startX + lead, block.y + (block.logoSize - FOOTER_SIZE) / 2)
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
  drawCard(layout, ctx, { qr: options.qrElement ?? null, logo: options.logoElement ?? null })

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
