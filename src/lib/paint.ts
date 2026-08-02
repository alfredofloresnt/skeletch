import { sanitizeColor } from './variables'

export type PaintMode = 'solid' | 'linear' | 'radial'

export type ColorStop = {
  color: string
  /** 0..1 */
  offset: number
}

export type SolidPaint = {
  mode: 'solid'
  color: string
}

export type LinearPaint = {
  mode: 'linear'
  /** CSS degrees: 0 = up, clockwise. */
  angle: number
  stops: [ColorStop, ColorStop]
}

export type RadialPaint = {
  mode: 'radial'
  stops: [ColorStop, ColorStop]
}

export type Paint = SolidPaint | LinearPaint | RadialPaint

const LINEAR_RE =
  /^linear-gradient\(\s*([+-]?\d*\.?\d+)deg\s*,\s*(.+)\s*\)$/i
const RADIAL_RE = /^radial-gradient\(\s*circle(?:\s+at\s+50%\s+50%)?\s*,\s*(.+)\s*\)$/i
const STOP_RE = /^(#[0-9a-fA-F]{3,8}|transparent)\s+(\d*\.?\d+)%$/i

function parseStops(body: string): [ColorStop, ColorStop] | null {
  const parts = body.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const a = parseStop(parts[0])
  const b = parseStop(parts[parts.length - 1])
  if (!a || !b) return null
  return [a, b]
}

function parseStop(raw: string): ColorStop | null {
  const m = raw.trim().match(STOP_RE)
  if (!m) return null
  const color = m[1].toLowerCase() === 'transparent' ? 'transparent' : sanitizeColor(m[1])
  const offset = Math.min(1, Math.max(0, Number(m[2]) / 100))
  return { color, offset }
}

export function isGradient(value: string | null | undefined): boolean {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return v.startsWith('linear-gradient(') || v.startsWith('radial-gradient(')
}

export function isTransparentPaint(value: string | null | undefined): boolean {
  return !value || value === 'transparent'
}

export function isVisiblePaint(value: string | null | undefined): boolean {
  return Boolean(value) && value !== 'transparent'
}

export function parsePaint(value: string | null | undefined): Paint {
  if (!value || value === 'transparent') {
    return { mode: 'solid', color: value || 'transparent' }
  }
  const trimmed = value.trim()
  const linear = trimmed.match(LINEAR_RE)
  if (linear) {
    const stops = parseStops(linear[2])
    if (stops) {
      return {
        mode: 'linear',
        angle: ((Number(linear[1]) % 360) + 360) % 360,
        stops,
      }
    }
  }
  const radial = trimmed.match(RADIAL_RE)
  if (radial) {
    const stops = parseStops(radial[1])
    if (stops) return { mode: 'radial', stops }
  }
  if (isGradient(trimmed)) {
    // Unrecognized gradient syntax — fall back to a neutral solid.
    return { mode: 'solid', color: '#1a1a1a' }
  }
  return { mode: 'solid', color: sanitizeColor(trimmed) }
}

function formatStop(stop: ColorStop): string {
  const pct = Math.round(stop.offset * 100)
  return `${stop.color} ${pct}%`
}

export function serializePaint(paint: Paint): string {
  if (paint.mode === 'solid') return paint.color
  if (paint.mode === 'linear') {
    const angle = Math.round(paint.angle)
    return `linear-gradient(${angle}deg, ${formatStop(paint.stops[0])}, ${formatStop(paint.stops[1])})`
  }
  return `radial-gradient(circle, ${formatStop(paint.stops[0])}, ${formatStop(paint.stops[1])})`
}

export function paintMode(value: string | null | undefined): PaintMode {
  return parsePaint(value).mode
}

export function paintLabel(value: string | null | undefined): string {
  const paint = parsePaint(value)
  if (paint.mode === 'linear') return 'Linear'
  if (paint.mode === 'radial') return 'Radial'
  if (paint.color === 'transparent') return 'Transparent'
  return paint.color
}

export function solidColorFromPaint(value: string | null | undefined, fallback = '#1a1a1a'): string {
  const paint = parsePaint(value)
  if (paint.mode === 'solid') {
    return paint.color === 'transparent' ? fallback : paint.color
  }
  const c = paint.stops[0].color
  return c === 'transparent' ? fallback : c
}

export function defaultGradientFromColor(
  mode: 'linear' | 'radial',
  color: string,
): Paint {
  const start = color === 'transparent' ? '#ffffff' : sanitizeColor(color)
  const end = '#1a1a1a'
  const stops: [ColorStop, ColorStop] = [
    { color: start, offset: 0 },
    { color: end, offset: 1 },
  ]
  if (mode === 'linear') return { mode: 'linear', angle: 180, stops }
  return { mode: 'radial', stops }
}

export function convertPaintMode(value: string | null | undefined, mode: PaintMode): string {
  const current = parsePaint(value)
  if (mode === 'solid') {
    if (current.mode === 'solid') return current.color === 'transparent' ? '#1a1a1a' : current.color
    return solidColorFromPaint(value)
  }
  if (current.mode === mode) return serializePaint(current)
  if (current.mode !== 'solid') {
    if (mode === 'linear') {
      return serializePaint({
        mode: 'linear',
        angle: current.mode === 'linear' ? current.angle : 180,
        stops: current.stops,
      })
    }
    return serializePaint({ mode: 'radial', stops: current.stops })
  }
  return serializePaint(defaultGradientFromColor(mode, current.color))
}

/** First usable solid color (for contexts that cannot paint gradients). */
export function toSolidCssColor(value: string | null | undefined, fallback = '#1a1a1a'): string {
  if (!isVisiblePaint(value)) return 'transparent'
  if (isGradient(value)) return solidColorFromPaint(value, fallback)
  return value!
}

type Box = { x: number; y: number; w: number; h: number }

/** CSS angle (0=up, clockwise) → line endpoints covering the box. */
export function linearGradientPoints(angleDeg: number, box: Box): {
  x1: number
  y1: number
  x2: number
  y2: number
} {
  const { x, y, w, h } = box
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = (angleDeg * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const half = Math.abs(w * dx) + Math.abs(h * dy)
  const len = half / 2 || 0.5
  return {
    x1: cx - dx * len,
    y1: cy - dy * len,
    x2: cx + dx * len,
    y2: cy + dy * len,
  }
}

export function canvasPaintStyle(
  ctx: CanvasRenderingContext2D,
  value: string | null | undefined,
  box: Box,
): string | CanvasGradient {
  const paint = parsePaint(value)
  if (paint.mode === 'solid') return paint.color === 'transparent' ? 'rgba(0,0,0,0)' : paint.color

  if (paint.mode === 'linear') {
    const pts = linearGradientPoints(paint.angle, box)
    const g = ctx.createLinearGradient(pts.x1, pts.y1, pts.x2, pts.y2)
    g.addColorStop(paint.stops[0].offset, paint.stops[0].color)
    g.addColorStop(paint.stops[1].offset, paint.stops[1].color)
    return g
  }

  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const r = Math.max(box.w, box.h) / 2
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(r, 0.5))
  g.addColorStop(paint.stops[0].offset, paint.stops[0].color)
  g.addColorStop(paint.stops[1].offset, paint.stops[1].color)
  return g
}

/** SVG gradient endpoints in objectBoundingBox units (0..1). */
export function svgLinearPoints(angleDeg: number): {
  x1: string
  y1: string
  x2: string
  y2: string
} {
  const pts = linearGradientPoints(angleDeg, { x: 0, y: 0, w: 1, h: 1 })
  const n = (v: number) => String(Number(v.toFixed(4)))
  return {
    x1: n(pts.x1),
    y1: n(pts.y1),
    x2: n(pts.x2),
    y2: n(pts.y2),
  }
}

/** Resolve a paint value to an SVG fill/stroke attribute (`none`, color, or url(#id)). */
export function svgPaintAttr(
  value: string | null | undefined,
  gradientId: string,
): string {
  if (!isVisiblePaint(value)) return 'none'
  if (isGradient(value)) return `url(#${gradientId})`
  return value!
}

export function cssBackgroundPaint(value: string | null | undefined): string | undefined {
  if (!isVisiblePaint(value)) return 'transparent'
  return value!
}
