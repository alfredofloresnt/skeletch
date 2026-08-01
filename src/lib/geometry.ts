import { GRID_SIZE, MIN_SIZE } from './constants'
import { pointInPathShape } from './pathGeometry'
import type { Point, Rect, ResizeHandle, WireElement } from './types'

export function snap(value: number, enabled: boolean, grid = GRID_SIZE): number {
  if (!enabled) return value
  return Math.round(value / grid) * grid
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function uid(prefix = 'el'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function normalizeRect(x: number, y: number, w: number, h: number): Rect {
  const nx = w < 0 ? x + w : x
  const ny = h < 0 ? y + h : y
  return { x: nx, y: ny, w: Math.abs(w), h: Math.abs(h) }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  )
}

type BoxLike = Pick<WireElement, 'type' | 'x' | 'y' | 'w' | 'h'> & {
  strokeWidth?: number
  z?: number
  pathClosed?: boolean
  pathVertices?: WireElement['pathVertices']
}

export function getBounds(elements: BoxLike[]): Rect | null {
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
export function lineAwareBox(el: BoxLike): Rect {
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

type RotatableBox = BoxLike & { rotation?: number }

export function pointInElement(px: number, py: number, el: RotatableBox): boolean {
  const rot = el.rotation || 0
  let x = px
  let y = py
  if (rot) {
    const local = toElementLocal({ x: px, y: py }, el)
    x = local.x
    y = local.y
  }

  const box = lineAwareBox(el)
  if (el.type === 'circle') {
    const cx = el.x + el.w / 2
    const cy = el.y + el.h / 2
    const rx = el.w / 2
    const ry = el.h / 2
    if (rx <= 0 || ry <= 0) return false
    const dx = (x - cx) / rx
    const dy = (y - cy) / ry
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
    const a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / denom
    const b = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / denom
    const c = 1 - a - b
    return a >= 0 && b >= 0 && c >= 0
  }
  if (el.type === 'path' && el.pathVertices?.length) {
    return pointInPathShape(
      x - el.x,
      y - el.y,
      el.pathVertices,
      Boolean(el.pathClosed),
      el.strokeWidth || 2,
      el.w,
      el.h,
    )
  }
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h
}

type ResizeTarget = Pick<WireElement, 'type' | 'x' | 'y' | 'w' | 'h'>

export function applyResize(
  el: ResizeTarget,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  { snapOn, keepAspect }: { snapOn: boolean; keepAspect: boolean },
): Rect {
  let { x, y, w, h } = el
  const aspect = el.w / Math.max(el.h, 1)

  const apply = (nx: number, ny: number, nw: number, nh: number): Rect => {
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

export function screenToWorld(
  clientX: number,
  clientY: number,
  stageRect: DOMRect,
  pan: Point,
  zoom: number,
): Point {
  return {
    x: (clientX - stageRect.left - pan.x) / zoom,
    y: (clientY - stageRect.top - pan.y) / zoom,
  }
}

export function sortByZ<T extends { z: number }>(elements: T[]): T[] {
  return [...elements].sort((a, b) => a.z - b.z)
}

export type CornerHandle = 'nw' | 'ne' | 'se' | 'sw'

/** Uniform corner radius from pointer position relative to a corner. */
export function cornerRadiusFromPointer(
  local: Point,
  bounds: Rect,
  corner: CornerHandle,
): number {
  const maxR = Math.max(0, Math.min(bounds.w, bounds.h) / 2)
  let dx = 0
  let dy = 0
  switch (corner) {
    case 'nw':
      dx = local.x - bounds.x
      dy = local.y - bounds.y
      break
    case 'ne':
      dx = bounds.x + bounds.w - local.x
      dy = local.y - bounds.y
      break
    case 'se':
      dx = bounds.x + bounds.w - local.x
      dy = bounds.y + bounds.h - local.y
      break
    case 'sw':
      dx = local.x - bounds.x
      dy = bounds.y + bounds.h - local.y
      break
  }
  return clamp(Math.min(dx, dy), 0, maxR)
}

export function normalizeDegrees(deg: number): number {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function elementCenter(el: Pick<WireElement, 'type' | 'x' | 'y' | 'w' | 'h'>): Point {
  if (el.type === 'line') {
    return { x: el.x + el.w / 2, y: el.y + el.h / 2 }
  }
  return { x: el.x + el.w / 2, y: el.y + el.h / 2 }
}

export function rotatePoint(p: Point, center: Point, deg: number): Point {
  if (!deg) return p
  const rad = degToRad(deg)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = p.x - center.x
  const dy = p.y - center.y
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

/** Map artboard-local point into the element's unrotated local frame. */
export function toElementLocal(
  p: Point,
  el: Pick<WireElement, 'type' | 'x' | 'y' | 'w' | 'h' | 'rotation'>,
): Point {
  const c = elementCenter(el)
  return rotatePoint(p, c, -(el.rotation || 0))
}

export function angleOfPoint(center: Point, p: Point): number {
  return (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI
}

/** Rotate elements around a center: translate centers + add delta to each rotation. */
export function applyRotationAroundCenter<T extends WireElement>(
  origins: T[],
  center: Point,
  deltaDeg: number,
): T[] {
  if (!deltaDeg) return origins.map((el) => ({ ...el }))
  return origins.map((el) => {
    const c = elementCenter(el)
    const next = rotatePoint(c, center, deltaDeg)
    return {
      ...el,
      x: el.x + (next.x - c.x),
      y: el.y + (next.y - c.y),
      rotation: normalizeDegrees((el.rotation || 0) + deltaDeg),
    }
  })
}

export function boundsCenter(bounds: Rect): Point {
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
}

/** Axis-aligned bounds of a possibly rotated element (artboard-local). */
export function rotatedAabb(el: Pick<WireElement, 'type' | 'x' | 'y' | 'w' | 'h' | 'rotation' | 'strokeWidth'>): Rect {
  const box = lineAwareBox(el)
  const rot = el.rotation || 0
  if (!rot) return box
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ].map((p) => rotatePoint(p, c, rot))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of corners) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const

/** CSS resize cursor remapped by element rotation. */
export function resizeCursorForHandle(handle: ResizeHandle, rotationDeg = 0): string {
  const base: Record<ResizeHandle, number> = {
    e: 0,
    se: 45,
    s: 90,
    sw: 135,
    w: 180,
    nw: 225,
    n: 270,
    ne: 315,
  }
  const angle = (((base[handle] + rotationDeg) % 180) + 180) % 180
  const idx = Math.round(angle / 45) % 4
  return RESIZE_CURSORS[idx]
}

/** Curved-arrow rotate cursor (SVG data URL), oriented per handle + rotation. */
export function rotateCursorForHandle(handle: ResizeHandle, rotationDeg = 0): string {
  const base: Record<ResizeHandle, number> = {
    e: 0,
    se: 45,
    s: 90,
    sw: 135,
    w: 180,
    nw: 225,
    n: 270,
    ne: 315,
  }
  const angle = Math.round((base[handle] + rotationDeg) / 45) * 45
  return rotateCursorDataUrl(angle)
}

function rotateCursorDataUrl(angleDeg: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g fill="none" stroke="#1f6feb" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" transform="rotate(${angleDeg} 16 16)">
    <path d="M10 14a6 6 0 1 1 2.2 5.2"/>
    <path d="M10 14V9.5M10 14h4.5"/>
  </g>
</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, crosshair`
}

export function isCornerHandle(handle: ResizeHandle): handle is CornerHandle {
  return handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw'
}
