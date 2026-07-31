import { FRAME_PRESETS } from './constants'
import { uid } from './geometry'
import type { Artboard, Point, Rect, WireElement } from './types'

export const ARTBOARD_GAP = 80

export function createArtboard(
  partial: Partial<Artboard> & Pick<Artboard, 'width' | 'height'>,
): Artboard {
  const presetId = partial.presetId || 'custom'
  const preset = FRAME_PRESETS.find((p) => p.id === presetId)
  return {
    id: partial.id || uid('ab'),
    name: partial.name || preset?.label || 'Artboard',
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width,
    height: partial.height,
    presetId,
  }
}

export function defaultArtboard(): Artboard {
  const preset = FRAME_PRESETS.find((p) => p.id === 'desktop') ?? FRAME_PRESETS[0]
  return createArtboard({
    width: preset.width,
    height: preset.height,
    presetId: preset.id,
    name: preset.label,
    x: 0,
    y: 0,
  })
}

/** Place the next artboard to the right of the rightmost board. */
export function nextArtboardPosition(artboards: Artboard[]): Point {
  if (!artboards.length) return { x: 0, y: 0 }
  let maxRight = -Infinity
  let y = artboards[0].y
  for (const ab of artboards) {
    const right = ab.x + ab.width
    if (right > maxRight) {
      maxRight = right
      y = ab.y
    }
  }
  return { x: maxRight + ARTBOARD_GAP, y }
}

export function artboardRect(ab: Artboard): Rect {
  return { x: ab.x, y: ab.y, w: ab.width, h: ab.height }
}

export function pointInArtboard(ab: Artboard, world: Point): boolean {
  return (
    world.x >= ab.x &&
    world.x <= ab.x + ab.width &&
    world.y >= ab.y &&
    world.y <= ab.y + ab.height
  )
}

export function worldToLocal(ab: Artboard, world: Point): Point {
  return { x: world.x - ab.x, y: world.y - ab.y }
}

export function localToWorld(ab: Artboard, local: Point): Point {
  return { x: local.x + ab.x, y: local.y + ab.y }
}

/** Front-to-back: active first, then later array entries on top of earlier ones. */
export function artboardsFrontToBack(
  artboards: Artboard[],
  activeArtboardId: string | null,
): Artboard[] {
  const ordered = [...artboards].reverse()
  if (!activeArtboardId) return ordered
  const active = ordered.find((ab) => ab.id === activeArtboardId)
  if (!active) return ordered
  return [active, ...ordered.filter((ab) => ab.id !== activeArtboardId)]
}

export function artboardAtPoint(
  artboards: Artboard[],
  world: Point,
  activeArtboardId: string | null = null,
): Artboard | null {
  for (const ab of artboardsFrontToBack(artboards, activeArtboardId)) {
    if (pointInArtboard(ab, world)) return ab
  }
  return null
}

export function elementsOnArtboard(
  elements: WireElement[],
  artboardId: string,
): WireElement[] {
  return elements.filter((el) => el.artboardId === artboardId)
}

export function getArtboardMap(artboards: Artboard[]): Map<string, Artboard> {
  return new Map(artboards.map((ab) => [ab.id, ab]))
}

export function elementWorldRect(
  el: WireElement,
  ab: Artboard,
): Rect {
  return {
    x: ab.x + el.x,
    y: ab.y + el.y,
    w: Math.abs(el.w) || 1,
    h: Math.abs(el.h) || 1,
  }
}

/** Union of all artboard rects in world space (for fit-all). */
export function artboardsBounds(artboards: Artboard[]): Rect | null {
  if (!artboards.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ab of artboards) {
    minX = Math.min(minX, ab.x)
    minY = Math.min(minY, ab.y)
    maxX = Math.max(maxX, ab.x + ab.width)
    maxY = Math.max(maxY, ab.y + ab.height)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
