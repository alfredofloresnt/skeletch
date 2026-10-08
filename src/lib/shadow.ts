import type { ElementShadow } from './types'
import { sanitizeColor } from './variables'

export const DEFAULT_SHADOW: ElementShadow = {
  x: 0,
  y: 4,
  blur: 12,
  color: '#000000',
  opacity: 0.25,
}

function finite(n: unknown, fallback: number): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : fallback
}

/** Valid shadows only; undefined when there are none so saved files stay lean. */
export function sanitizeShadows(raw: unknown): ElementShadow[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const shadows = raw
    .filter((s): s is Partial<ElementShadow> => Boolean(s) && typeof s === 'object')
    .map((s) => {
      const color = sanitizeColor(String(s.color ?? DEFAULT_SHADOW.color))
      return {
        x: finite(s.x, DEFAULT_SHADOW.x),
        y: finite(s.y, DEFAULT_SHADOW.y),
        blur: Math.max(0, finite(s.blur, DEFAULT_SHADOW.blur)),
        color: color === 'transparent' ? DEFAULT_SHADOW.color : color,
        opacity: Math.min(1, Math.max(0, finite(s.opacity, DEFAULT_SHADOW.opacity))),
      }
    })
  return shadows.length ? shadows : undefined
}

export function shadowRgba(color: string, opacity: number): string {
  const hex = sanitizeColor(color)
  const n = /^#[0-9a-f]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : 0
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`
}

/**
 * CSS / canvas `filter` value for the element's shadows, or undefined when it has none.
 * drop-shadow follows the visible shape (circles, triangles, paths, text glyphs). Offsets are
 * counter-rotated by `rotation` so a rotated element still casts its shadow in artboard space.
 */
export function shadowFilter(
  shadows: ElementShadow[] | undefined,
  rotation = 0,
): string | undefined {
  if (!shadows?.length) return undefined
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const round = (n: number) => Math.round(n * 100) / 100
  return shadows
    .map((s) => {
      const lx = round(s.x * cos + s.y * sin)
      const ly = round(-s.x * sin + s.y * cos)
      return `drop-shadow(${lx}px ${ly}px ${s.blur}px ${shadowRgba(s.color, s.opacity)})`
    })
    .join(' ')
}
