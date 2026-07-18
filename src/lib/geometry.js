import { GRID_SIZE, MIN_SIZE } from './constants'

export function snap(value, enabled, grid = GRID_SIZE) {
  if (!enabled) return value
  return Math.round(value / grid) * grid
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function uid(prefix = 'el') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function normalizeRect(x, y, w, h) {
  const nx = w < 0 ? x + w : x
  const ny = h < 0 ? y + h : y
  return { x: nx, y: ny, w: Math.abs(w), h: Math.abs(h) }
}

export function rectsIntersect(a, b) {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  )
}

export function getBounds(elements) {
  if (!elements.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    const { x, y, w, h } = lineAwareBox(el)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Bounding box used for hit-testing / selection (lines use stroke padding). */
export function lineAwareBox(el) {
  if (el.type !== 'line') {
    return { x: el.x, y: el.y, w: el.w, h: el.h }
  }
  const { x, y, w, h } = normalizeRect(el.x, el.y, el.w, el.h)
  const pad = Math.max(6, (el.strokeWidth || 2) + 4)
  return {
    x: x - pad,
    y: y - pad,
    w: Math.max(w, 1) + pad * 2,
    h: Math.max(h, 1) + pad * 2,
  }
}

export function pointInElement(px, py, el) {
  const box = lineAwareBox(el)
  if (el.type === 'circle') {
    const cx = el.x + el.w / 2
    const cy = el.y + el.h / 2
    const rx = el.w / 2
    const ry = el.h / 2
    if (rx <= 0 || ry <= 0) return false
    const dx = (px - cx) / rx
    const dy = (py - cy) / ry
    return dx * dx + dy * dy <= 1
  }
  if (el.type === 'triangle') {
    // Upward triangle: top center, bottom-left, bottom-right
    const x1 = el.x + el.w / 2
    const y1 = el.y
    const x2 = el.x
    const y2 = el.y + el.h
    const x3 = el.x + el.w
    const y3 = el.y + el.h
    const denom = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
    if (!denom) return false
    const a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / denom
    const b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / denom
    const c = 1 - a - b
    return a >= 0 && b >= 0 && c >= 0
  }
  return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h
}

export function applyResize(el, handle, dx, dy, { snapOn, keepAspect }) {
  let { x, y, w, h } = el
  const aspect = el.w / Math.max(el.h, 1)

  const apply = (nx, ny, nw, nh) => {
    if (keepAspect && el.type !== 'line') {
      if (handle.includes('e') || handle.includes('w')) {
        nh = nw / aspect
        if (handle.includes('n')) ny = y + h - nh
      } else {
        nw = nh * aspect
        if (handle.includes('w')) nx = x + w - nw
      }
    }
    nw = Math.max(MIN_SIZE, nw)
    nh = el.type === 'line' ? nh : Math.max(MIN_SIZE, nh)
    return {
      x: snap(nx, snapOn),
      y: snap(ny, snapOn),
      w: snap(nw, snapOn),
      h: snap(nh, snapOn),
    }
  }

  switch (handle) {
    case 'nw':
      return apply(x + dx, y + dy, w - dx, h - dy)
    case 'n':
      return apply(x, y + dy, w, h - dy)
    case 'ne':
      return apply(x, y + dy, w + dx, h - dy)
    case 'e':
      return apply(x, y, w + dx, h)
    case 'se':
      return apply(x, y, w + dx, h + dy)
    case 's':
      return apply(x, y, w, h + dy)
    case 'sw':
      return apply(x + dx, y, w - dx, h + dy)
    case 'w':
      return apply(x + dx, y, w - dx, h)
    default:
      return { x, y, w, h }
  }
}

export function screenToWorld(clientX, clientY, stageRect, pan, zoom) {
  return {
    x: (clientX - stageRect.left - pan.x) / zoom,
    y: (clientY - stageRect.top - pan.y) / zoom,
  }
}

export function sortByZ(elements) {
  return [...elements].sort((a, b) => a.z - b.z)
}
