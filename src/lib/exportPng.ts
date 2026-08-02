import { DEFAULTS } from './constants'
import { drawImageCover, loadHtmlImage } from './fillImage'
import { canvasPaintStyle, isVisiblePaint, toSolidCssColor } from './paint'
import { pathVerticesToD } from './pathGeometry'
import type { Artboard, WireElement } from './types'

type ImageCache = Map<string, HTMLImageElement>

function hasVisibleStroke(el: Pick<WireElement, 'stroke' | 'strokeWidth'>): boolean {
  const sw = el.strokeWidth || 0
  return sw > 0 && isVisiblePaint(el.stroke)
}

function paintFillImage(
  ctx: CanvasRenderingContext2D,
  el: WireElement,
  images: ImageCache,
  clip: () => void,
): void {
  const src = el.fillImage
  if (!src) return
  const img = images.get(src)
  if (!img) return
  ctx.save()
  clip()
  ctx.clip()
  drawImageCover(ctx, img, el.x, el.y, el.w, el.h)
  ctx.restore()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r || 0, w / 2, h / 2)
  ctx.beginPath()
  if (radius <= 0) {
    ctx.rect(x, y, w, h)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** Match CSS word-break: break-word — wrap on spaces, then mid-word if needed. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of String(text).split('\n')) {
    if (!paragraph) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width <= maxWidth) {
        line = next
        continue
      }
      if (line) lines.push(line)
      if (ctx.measureText(word).width <= maxWidth) {
        line = word
        continue
      }
      let chunk = ''
      for (const ch of word) {
        const trial = chunk + ch
        if (chunk && ctx.measureText(trial).width > maxWidth) {
          lines.push(chunk)
          chunk = ch
        } else {
          chunk = trial
        }
      }
      line = chunk
    }
    if (line) lines.push(line)
  }
  return lines
}

function paintText(ctx: CanvasRenderingContext2D, el: WireElement): void {
  const fontSize = el.fontSize || 16
  const lineHeight = fontSize * 1.2
  const maxW = Math.max(el.w, 1)
  const maxH = Math.max(el.h, 1)
  const ta = el.textAlign || 'left'
  const align: CanvasTextAlign = ta === 'middle' ? 'center' : ta

  ctx.fillStyle = toSolidCssColor(el.fill, '#1a1a1a')
  ctx.font = `${fontSize}px "IBM Plex Mono", ui-monospace, monospace`
  ctx.textBaseline = 'top'
  ctx.textAlign = align

  let tx = el.x
  if (align === 'center') tx = el.x + maxW / 2
  if (align === 'right') tx = el.x + maxW

  ctx.save()
  ctx.beginPath()
  ctx.rect(el.x, el.y, maxW, maxH)
  ctx.clip()

  const lines = wrapLines(ctx, el.text || 'Text', maxW)
  const blockH = lines.length * lineHeight
  const vAlign = el.verticalAlign || 'top'
  let y = el.y
  if (vAlign === 'middle') y = el.y + Math.max(0, (maxH - blockH) / 2)
  if (vAlign === 'bottom') y = el.y + Math.max(0, maxH - blockH)

  for (const line of lines) {
    if (y >= el.y + maxH) break
    ctx.fillText(line, tx, y)
    y += lineHeight
  }
  ctx.restore()
}

/** CSS border-box: fill outer box, stroke fully inside. */
function paintBorderBoxShape(
  ctx: CanvasRenderingContext2D,
  el: WireElement,
  shape: 'circle' | 'rect',
  images: ImageCache,
): void {
  const sw = el.strokeWidth || 0
  const fill = el.fill
  const strokeVisible = hasVisibleStroke(el)
  const box = { x: el.x, y: el.y, w: el.w, h: el.h }

  if (shape === 'circle') {
    const cx = el.x + el.w / 2
    const cy = el.y + el.h / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, el.w / 2, el.h / 2, 0, 0, Math.PI * 2)
    if (isVisiblePaint(fill) && !el.fillImage) {
      ctx.fillStyle = canvasPaintStyle(ctx, fill, box)
      ctx.fill()
    }
    paintFillImage(ctx, el, images, () => {
      ctx.beginPath()
      ctx.ellipse(cx, cy, el.w / 2, el.h / 2, 0, 0, Math.PI * 2)
    })
    if (strokeVisible) {
      const rx = Math.max(0, el.w / 2 - sw / 2)
      const ry = Math.max(0, el.h / 2 - sw / 2)
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.strokeStyle = canvasPaintStyle(ctx, el.stroke, box)
      ctx.lineWidth = sw
      ctx.stroke()
    }
    return
  }

  const r = el.cornerRadius || 0
  roundRect(ctx, el.x, el.y, el.w, el.h, r)
  if (isVisiblePaint(fill) && !el.fillImage) {
    ctx.fillStyle = canvasPaintStyle(ctx, fill, box)
    ctx.fill()
  }
  paintFillImage(ctx, el, images, () => roundRect(ctx, el.x, el.y, el.w, el.h, r))
  if (strokeVisible) {
    const inset = sw / 2
    const iw = el.w - sw
    const ih = el.h - sw
    if (iw > 0 && ih > 0) {
      const ir = Math.max(0, r - inset)
      roundRect(ctx, el.x + inset, el.y + inset, iw, ih, ir)
      ctx.strokeStyle = canvasPaintStyle(ctx, el.stroke, box)
      ctx.lineWidth = sw
      ctx.stroke()
    }
  }
}

/** Match WireElement image: fill + radius, then ImagePlaceholder SVG (inset ~1%). */
function paintImage(ctx: CanvasRenderingContext2D, el: WireElement, images: ImageCache): void {
  const d = DEFAULTS.image
  const r = el.cornerRadius || 0
  const fill = el.fill ?? d.fill
  const box = { x: el.x, y: el.y, w: el.w, h: el.h }
  if (isVisiblePaint(fill) && !el.fillImage) {
    roundRect(ctx, el.x, el.y, el.w, el.h, r)
    ctx.fillStyle = canvasPaintStyle(ctx, fill, box)
    ctx.fill()
  }

  paintFillImage(ctx, el, images, () => roundRect(ctx, el.x, el.y, el.w, el.h, r))

  if (el.fillImage) return

  const sw = el.strokeWidth ?? d.strokeWidth
  const stroke = el.stroke ?? d.stroke
  if (!hasVisibleStroke({ stroke, strokeWidth: sw })) return

  const x1 = el.x + el.w * 0.01
  const y1 = el.y + el.h * 0.01
  const x2 = el.x + el.w * 0.99
  const y2 = el.y + el.h * 0.99

  ctx.save()
  if (r > 0) {
    roundRect(ctx, el.x, el.y, el.w, el.h, r)
    ctx.clip()
  }
  ctx.strokeStyle = toSolidCssColor(stroke)
  ctx.lineWidth = sw
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.moveTo(x2, y1)
  ctx.lineTo(x1, y2)
  ctx.stroke()
  ctx.restore()
}

function paintShape(ctx: CanvasRenderingContext2D, el: WireElement, images: ImageCache): void {
  ctx.save()
  ctx.globalAlpha = el.opacity ?? 1

  const rot = el.rotation || 0
  if (rot && el.type !== 'line') {
    const cx = el.x + el.w / 2
    const cy = el.y + el.h / 2
    ctx.translate(cx, cy)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.translate(-cx, -cy)
  }

  if (el.type === 'text') {
    paintText(ctx, el)
    ctx.restore()
    return
  }

  if (el.type === 'line') {
    if (rot) {
      const cx = el.x + el.w / 2
      const cy = el.y + el.h / 2
      ctx.translate(cx, cy)
      ctx.rotate((rot * Math.PI) / 180)
      ctx.translate(-cx, -cy)
    }
    if (hasVisibleStroke(el)) {
      const x1 = el.x
      const y1 = el.y
      const x2 = el.x + el.w
      const y2 = el.y + el.h
      ctx.strokeStyle = canvasPaintStyle(ctx, el.stroke, {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.max(Math.abs(el.w), 1),
        h: Math.max(Math.abs(el.h), 1),
      })
      ctx.lineWidth = el.strokeWidth || 2
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  if (el.type === 'circle') {
    paintBorderBoxShape(ctx, el, 'circle', images)
    ctx.restore()
    return
  }

  if (el.type === 'triangle') {
    const sw = el.strokeWidth || 0
    const fill = el.fill
    const box = { x: el.x, y: el.y, w: el.w, h: el.h }
    const x1 = el.x + el.w / 2
    const y1 = el.y
    const x2 = el.x
    const y2 = el.y + el.h
    const x3 = el.x + el.w
    const y3 = el.y + el.h
    const trianglePath = () => {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.lineTo(x3, y3)
      ctx.closePath()
    }
    trianglePath()
    if (isVisiblePaint(fill) && !el.fillImage) {
      ctx.fillStyle = canvasPaintStyle(ctx, fill, box)
      ctx.fill()
    }
    paintFillImage(ctx, el, images, trianglePath)
    if (hasVisibleStroke(el)) {
      trianglePath()
      ctx.strokeStyle = canvasPaintStyle(ctx, el.stroke, box)
      ctx.lineWidth = sw
      ctx.lineJoin = 'miter'
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  if (el.type === 'image') {
    paintImage(ctx, el, images)
    ctx.restore()
    return
  }

  if (el.type === 'path') {
    const vertices = el.pathVertices || []
    const d = pathVerticesToD(vertices, Boolean(el.pathClosed))
    if (!d) {
      ctx.restore()
      return
    }
    const sw = el.strokeWidth || 0
    const fill = el.fill
    const sx = el.w / 100
    const sy = el.h / 100
    ctx.translate(el.x, el.y)
    ctx.scale(sx, sy)
    const path = new Path2D(d)
    const localBox = { x: 0, y: 0, w: 100, h: 100 }
    if (el.pathClosed && isVisiblePaint(fill)) {
      ctx.fillStyle = canvasPaintStyle(ctx, fill, localBox)
      ctx.fill(path)
    }
    if (hasVisibleStroke(el)) {
      // Match SVG vectorEffect="non-scaling-stroke"
      const avgScale = (Math.abs(sx) + Math.abs(sy)) / 2
      ctx.strokeStyle = canvasPaintStyle(ctx, el.stroke, localBox)
      ctx.lineWidth = sw / Math.max(avgScale, 0.001)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke(path)
    }
    ctx.restore()
    return
  }

  paintBorderBoxShape(ctx, el, 'rect', images)
  ctx.restore()
}

export async function exportArtboardPng(
  artboard: Artboard,
  elements: WireElement[],
): Promise<void> {
  if (document.fonts?.ready) await document.fonts.ready

  const canvas = document.createElement('canvas')
  canvas.width = artboard.width
  canvas.height = artboard.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const images: ImageCache = new Map()
  await Promise.all(
    elements.map(async (el) => {
      if (!el.fillImage || images.has(el.fillImage)) return
      try {
        images.set(el.fillImage, await loadHtmlImage(el.fillImage))
      } catch {
        /* skip broken image fills */
      }
    }),
  )

  const sorted = [...elements].sort((a, b) => a.z - b.z)
  for (const el of sorted) paintShape(ctx, el, images)

  const slug = (artboard.name || 'artboard')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const link = document.createElement('a')
  link.download = `skeletch-${slug || 'artboard'}-${artboard.width}x${artboard.height}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}
