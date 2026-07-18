import { DEFAULTS } from './constants'

function roundRect(ctx, x, y, w, h, r) {
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
function wrapLines(ctx, text, maxWidth) {
  const lines = []
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

function paintText(ctx, el) {
  const fontSize = el.fontSize || 16
  const lineHeight = fontSize * 1.2
  const maxW = Math.max(el.w, 1)
  const maxH = Math.max(el.h, 1)
  let align = el.textAlign || 'left'
  if (align === 'middle') align = 'center'

  ctx.fillStyle = el.fill || '#1a1a1a'
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
function paintBorderBoxShape(ctx, el, shape) {
  const sw = el.strokeWidth || 0
  const stroke = el.stroke || '#1a1a1a'
  const fill = el.fill

  if (shape === 'circle') {
    const cx = el.x + el.w / 2
    const cy = el.y + el.h / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, el.w / 2, el.h / 2, 0, 0, Math.PI * 2)
    if (fill && fill !== 'transparent') {
      ctx.fillStyle = fill
      ctx.fill()
    }
    if (sw > 0) {
      const rx = Math.max(0, el.w / 2 - sw / 2)
      const ry = Math.max(0, el.h / 2 - sw / 2)
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.strokeStyle = stroke
      ctx.lineWidth = sw
      ctx.stroke()
    }
    return
  }

  roundRect(ctx, el.x, el.y, el.w, el.h, el.cornerRadius || 0)
  if (fill && fill !== 'transparent') {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (sw > 0) {
    const inset = sw / 2
    const iw = el.w - sw
    const ih = el.h - sw
    if (iw > 0 && ih > 0) {
      const ir = Math.max(0, (el.cornerRadius || 0) - inset)
      roundRect(ctx, el.x + inset, el.y + inset, iw, ih, ir)
      ctx.strokeStyle = stroke
      ctx.lineWidth = sw
      ctx.stroke()
    }
  }
}

/** Match WireElement image: fill + radius, then ImagePlaceholder SVG (inset ~1%). */
function paintImage(ctx, el) {
  const d = DEFAULTS.image
  const r = el.cornerRadius || 0
  const fill = el.fill ?? d.fill
  if (fill && fill !== 'transparent') {
    roundRect(ctx, el.x, el.y, el.w, el.h, r)
    ctx.fillStyle = fill
    ctx.fill()
  }

  const sw = el.strokeWidth ?? d.strokeWidth
  const stroke = el.stroke ?? d.stroke
  const x1 = el.x + el.w * 0.01
  const y1 = el.y + el.h * 0.01
  const x2 = el.x + el.w * 0.99
  const y2 = el.y + el.h * 0.99

  ctx.save()
  if (r > 0) {
    roundRect(ctx, el.x, el.y, el.w, el.h, r)
    ctx.clip()
  }
  ctx.strokeStyle = stroke
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

function paintShape(ctx, el) {
  ctx.save()
  ctx.globalAlpha = el.opacity ?? 1

  if (el.type === 'text') {
    paintText(ctx, el)
    ctx.restore()
    return
  }

  if (el.type === 'line') {
    ctx.strokeStyle = el.stroke || '#1a1a1a'
    ctx.lineWidth = el.strokeWidth || 2
    ctx.beginPath()
    ctx.moveTo(el.x, el.y)
    ctx.lineTo(el.x + el.w, el.y + el.h)
    ctx.stroke()
    ctx.restore()
    return
  }

  if (el.type === 'circle') {
    paintBorderBoxShape(ctx, el, 'circle')
    ctx.restore()
    return
  }

  if (el.type === 'image') {
    paintImage(ctx, el)
    ctx.restore()
    return
  }

  paintBorderBoxShape(ctx, el, 'rect')
  ctx.restore()
}

export async function exportArtboardPng(artboard, elements) {
  if (document.fonts?.ready) await document.fonts.ready

  const canvas = document.createElement('canvas')
  canvas.width = artboard.width
  canvas.height = artboard.height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const sorted = [...elements].sort((a, b) => a.z - b.z)
  for (const el of sorted) paintShape(ctx, el)

  const link = document.createElement('a')
  link.download = `wireframe-${artboard.width}x${artboard.height}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}
