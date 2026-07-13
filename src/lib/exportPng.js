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

function paintShape(ctx, el) {
  ctx.save()
  ctx.globalAlpha = el.opacity ?? 1

  if (el.type === 'text') {
    ctx.fillStyle = el.fill || '#1a1a1a'
    ctx.font = `${el.fontSize || 16}px "IBM Plex Mono", ui-monospace, monospace`
    ctx.textBaseline = 'top'
    const align = el.textAlign || 'left'
    ctx.textAlign = align === 'middle' ? 'center' : align
    let tx = el.x
    if (align === 'middle') tx = el.x + el.w / 2
    if (align === 'right') tx = el.x + el.w
    ctx.fillText(el.text || 'Text', tx, el.y + 4, el.w)
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
    ctx.beginPath()
    ctx.ellipse(
      el.x + el.w / 2,
      el.y + el.h / 2,
      el.w / 2,
      el.h / 2,
      0,
      0,
      Math.PI * 2,
    )
    if (el.fill && el.fill !== 'transparent') {
      ctx.fillStyle = el.fill
      ctx.fill()
    }
    if (el.strokeWidth > 0) {
      ctx.strokeStyle = el.stroke || '#1a1a1a'
      ctx.lineWidth = el.strokeWidth
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  // rect + image
  roundRect(ctx, el.x, el.y, el.w, el.h, el.cornerRadius || 0)
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill
    ctx.fill()
  }
  if (el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke || '#1a1a1a'
    ctx.lineWidth = el.strokeWidth
    ctx.stroke()
  }

  if (el.type === 'image') {
    ctx.beginPath()
    ctx.moveTo(el.x, el.y)
    ctx.lineTo(el.x + el.w, el.y + el.h)
    ctx.moveTo(el.x + el.w, el.y)
    ctx.lineTo(el.x, el.y + el.h)
    ctx.strokeStyle = el.stroke || '#1a1a1a'
    ctx.lineWidth = el.strokeWidth || 2
    ctx.stroke()
  }

  ctx.restore()
}

export function exportArtboardPng(artboard, elements) {
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
