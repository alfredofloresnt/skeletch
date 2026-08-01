import { MIN_SIZE } from './constants'
import type { PathHandle, PathVertex, Point, Rect } from './types'

const PATH_SPACE = 100
const CUBIC_SAMPLES = 12

function handleOrZero(h?: PathHandle): PathHandle {
  return h && Number.isFinite(h.x) && Number.isFinite(h.y) ? h : { x: 0, y: 0 }
}

function cubicPoint(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
): Point {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  const uuu = uu * u
  const ttt = tt * t
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  }
}

function segmentControls(a: PathVertex, b: PathVertex): [Point, Point, Point, Point] {
  const aOut = handleOrZero(a.out)
  const bIn = handleOrZero(b.in)
  return [
    { x: a.x, y: a.y },
    { x: a.x + aOut.x, y: a.y + aOut.y },
    { x: b.x + bIn.x, y: b.y + bIn.y },
    { x: b.x, y: b.y },
  ]
}

/** SVG path `d` from structured vertices (same coordinate space as vertices). */
export function pathVerticesToD(vertices: PathVertex[], closed: boolean): string {
  if (!vertices.length) return ''
  const parts = [`M ${fmt(vertices[0].x)} ${fmt(vertices[0].y)}`]
  const count = closed ? vertices.length : vertices.length - 1
  for (let i = 0; i < count; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % vertices.length]
    const [, c1, c2, p] = segmentControls(a, b)
    parts.push(
      `C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p.x)} ${fmt(p.y)}`,
    )
  }
  if (closed) parts.push('Z')
  return parts.join(' ')
}

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

function expandBounds(bounds: Rect, p: Point): Rect {
  const minX = Math.min(bounds.x, p.x)
  const minY = Math.min(bounds.y, p.y)
  const maxX = Math.max(bounds.x + bounds.w, p.x)
  const maxY = Math.max(bounds.y + bounds.h, p.y)
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Axis-aligned bounds of the stroked path geometry (samples cubics). */
export function boundsOfPath(vertices: PathVertex[], closed: boolean): Rect | null {
  if (!vertices.length) return null
  let bounds: Rect = { x: vertices[0].x, y: vertices[0].y, w: 0, h: 0 }
  for (const v of vertices) {
    bounds = expandBounds(bounds, v)
    const hin = handleOrZero(v.in)
    const hout = handleOrZero(v.out)
    bounds = expandBounds(bounds, { x: v.x + hin.x, y: v.y + hin.y })
    bounds = expandBounds(bounds, { x: v.x + hout.x, y: v.y + hout.y })
  }
  const count = closed ? vertices.length : Math.max(0, vertices.length - 1)
  for (let i = 0; i < count; i++) {
    const [p0, p1, p2, p3] = segmentControls(vertices[i], vertices[(i + 1) % vertices.length])
    for (let s = 1; s < CUBIC_SAMPLES; s++) {
      bounds = expandBounds(bounds, cubicPoint(p0, p1, p2, p3, s / CUBIC_SAMPLES))
    }
  }
  return ensureMinPathBounds(bounds)
}

/** Ensure selectable/resizable box even for flat segments. */
export function ensureMinPathBounds(bounds: Rect): Rect {
  let { x, y, w, h } = bounds
  if (w < MIN_SIZE) {
    x -= (MIN_SIZE - w) / 2
    w = MIN_SIZE
  }
  if (h < MIN_SIZE) {
    y -= (MIN_SIZE - h) / 2
    h = MIN_SIZE
  }
  return { x, y, w, h }
}

export function normalizePathVertices(vertices: PathVertex[], bounds: Rect): PathVertex[] {
  const sx = bounds.w > 0 ? PATH_SPACE / bounds.w : 1
  const sy = bounds.h > 0 ? PATH_SPACE / bounds.h : 1
  return vertices.map((v) => ({
    x: (v.x - bounds.x) * sx,
    y: (v.y - bounds.y) * sy,
    in: v.in ? { x: v.in.x * sx, y: v.in.y * sy } : undefined,
    out: v.out ? { x: v.out.x * sx, y: v.out.y * sy } : undefined,
  }))
}

export function denormalizePathVertices(vertices: PathVertex[], bounds: Rect): PathVertex[] {
  const sx = bounds.w / PATH_SPACE
  const sy = bounds.h / PATH_SPACE
  return vertices.map((v) => ({
    x: bounds.x + v.x * sx,
    y: bounds.y + v.y * sy,
    in: v.in ? { x: v.in.x * sx, y: v.in.y * sy } : undefined,
    out: v.out ? { x: v.out.x * sx, y: v.out.y * sy } : undefined,
  }))
}

/** Refit element box to path geometry and re-normalize vertices into 0..100. */
export function fitPathElement(
  verticesLocal: PathVertex[],
  closed: boolean,
): { bounds: Rect; pathVertices: PathVertex[] } | null {
  const bounds = boundsOfPath(verticesLocal, closed)
  if (!bounds) return null
  return {
    bounds,
    pathVertices: normalizePathVertices(verticesLocal, bounds),
  }
}

export function isNearVertex(p: Point, v: Point, threshold: number): boolean {
  const dx = p.x - v.x
  const dy = p.y - v.y
  return dx * dx + dy * dy <= threshold * threshold
}

/** Snap a point relative to `from` onto the nearest 45° ray. */
export function snapPointTo45(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (!len) return { ...to }
  const angle = Math.atan2(dy, dx)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return {
    x: from.x + Math.cos(snapped) * len,
    y: from.y + Math.sin(snapped) * len,
  }
}

export function sanitizePathVertices(raw: unknown, max = 256): PathVertex[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined
  const out: PathVertex[] = []
  for (const item of raw.slice(0, max)) {
    if (!item || typeof item !== 'object') continue
    const v = item as PathVertex
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) continue
    const next: PathVertex = { x: v.x, y: v.y }
    if (v.in && Number.isFinite(v.in.x) && Number.isFinite(v.in.y)) {
      next.in = { x: v.in.x, y: v.in.y }
    }
    if (v.out && Number.isFinite(v.out.x) && Number.isFinite(v.out.y)) {
      next.out = { x: v.out.x, y: v.out.y }
    }
    out.push(next)
  }
  return out.length ? out : undefined
}

/** Offscreen Path2D hit test in element-local (normalized 0..100) space. */
let hitCtx: CanvasRenderingContext2D | null = null

function getHitCtx(): CanvasRenderingContext2D | null {
  if (hitCtx) return hitCtx
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  hitCtx = canvas.getContext('2d')
  return hitCtx
}

export function pointInPathShape(
  localX: number,
  localY: number,
  vertices: PathVertex[],
  closed: boolean,
  strokeWidth: number,
  boxW: number,
  boxH: number,
): boolean {
  if (!vertices.length) return false
  const ctx = getHitCtx()
  if (!ctx) {
    return localX >= 0 && localX <= boxW && localY >= 0 && localY <= boxH
  }
  const nx = (localX / Math.max(boxW, 1)) * PATH_SPACE
  const ny = (localY / Math.max(boxH, 1)) * PATH_SPACE
  const d = pathVerticesToD(vertices, closed)
  if (!d) return false
  const path = new Path2D(d)
  const avgScale = (Math.max(boxW, 1) / PATH_SPACE + Math.max(boxH, 1) / PATH_SPACE) / 2
  const sw = Math.max(strokeWidth || 2, 6) / Math.max(avgScale, 0.001)
  if (closed && ctx.isPointInPath(path, nx, ny)) return true
  ctx.lineWidth = sw
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  return ctx.isPointInStroke(path, nx, ny)
}
