import { normalizeRect, rotatePoint } from './geometry'
import type { Artboard, Point, Rect, ResizeHandle, WireElement } from './types'

/** Screen px within which an edge or center snaps to another element's line. */
export const ALIGN_SNAP_PX = 6

/** Alignment guide in world space: a vertical (`x`) or horizontal (`y`) segment. */
export type SnapGuide = { axis: 'x' | 'y'; pos: number; from: number; to: number }

/** Lines farther apart than this (world px) are not considered aligned. */
const ALIGNED_EPS = 0.5

/** Visible box of an element in artboard-local space (no hit-test padding). */
export function alignBox(
  el: Pick<WireElement, 'x' | 'y' | 'w' | 'h' | 'rotation'>,
): Rect {
  const box = normalizeRect(el.x, el.y, el.w, el.h)
  const rot = el.rotation || 0
  if (!rot) return box
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ].map((p) => rotatePoint(p, c, rot))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** World-space boxes to align against: the artboard and its elements, minus `excludeIds`. */
export function alignTargets(
  board: Artboard,
  elements: WireElement[],
  excludeIds: Set<string>,
): Rect[] {
  const targets: Rect[] = [{ x: board.x, y: board.y, w: board.width, h: board.height }]
  for (const el of elements) {
    if (el.artboardId !== board.id || excludeIds.has(el.id)) continue
    const box = alignBox(el)
    targets.push({ ...box, x: box.x + board.x, y: box.y + board.y })
  }
  return targets
}

const xLines = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w]
const yLines = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h]

/** Smallest offset (within `threshold`) that puts one of `lines` on a target line. */
function nearestOffset(lines: number[], targetLines: number[], threshold: number): number | null {
  let best: number | null = null
  for (const m of lines) {
    for (const t of targetLines) {
      const d = t - m
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d
    }
  }
  return best
}

/** Offset per axis that aligns an edge or center of `box` with a target, or null. */
export function findAlignOffset(
  box: Rect,
  targets: Rect[],
  threshold: number,
): { x: number | null; y: number | null } {
  return {
    x: nearestOffset(xLines(box), targets.flatMap(xLines), threshold),
    y: nearestOffset(yLines(box), targets.flatMap(yLines), threshold),
  }
}

/**
 * Snap the edges a resize handle drags onto nearby target lines. The opposite edges
 * stay put; an edge snap that would shrink the box below the minimum is skipped.
 * With `aspect`, only the edge that drives the resize snaps and the other side follows.
 */
export function snapResizeEdges(
  box: Rect,
  handle: ResizeHandle,
  targets: Rect[],
  threshold: number,
  { minW, minH, aspect }: { minW: number; minH: number; aspect?: number },
): Rect {
  let { x, y, w, h } = box
  const tx = targets.flatMap(xLines)
  const ty = targets.flatMap(yLines)
  const widthDrives = handle.includes('e') || handle.includes('w')
  if (!aspect || widthDrives) {
    if (handle.includes('e')) {
      const d = nearestOffset([x + w], tx, threshold)
      if (d !== null && w + d >= minW) w = Math.round(x + w + d) - x
    } else if (handle.includes('w')) {
      const d = nearestOffset([x], tx, threshold)
      if (d !== null && w - d >= minW) {
        const right = x + w
        x = Math.round(x + d)
        w = right - x
      }
    }
  }
  if (!aspect || !widthDrives) {
    if (handle.includes('s')) {
      const d = nearestOffset([y + h], ty, threshold)
      if (d !== null && h + d >= minH) h = Math.round(y + h + d) - y
    } else if (handle.includes('n')) {
      const d = nearestOffset([y], ty, threshold)
      if (d !== null && h - d >= minH) {
        const bottom = y + h
        y = Math.round(y + d)
        h = bottom - y
      }
    }
  }
  if (aspect && widthDrives) {
    const nh = Math.round(w / aspect)
    if (handle.includes('n')) y = y + h - nh
    h = nh
  } else if (aspect) {
    w = Math.round(h * aspect)
  }
  return { x, y, w, h }
}

/** Snap a point (world space) onto nearby target lines; axes without a match stay null. */
export function findPointAlignOffset(
  point: Point,
  targets: Rect[],
  threshold: number,
): { x: number | null; y: number | null } {
  return findAlignOffset({ x: point.x, y: point.y, w: 0, h: 0 }, targets, threshold)
}

/** Zero-size boxes so points (e.g. pen anchors) act as alignment targets. */
export function pointTargets(points: Point[], offset: Point): Rect[] {
  return points.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y, w: 0, h: 0 }))
}

/** Guides for every line of `box` that sits on a target line, spanning both boxes. */
export function alignGuides(rect: Rect, targets: Rect[]): SnapGuide[] {
  const box = normalizeRect(rect.x, rect.y, rect.w, rect.h)
  const guides: SnapGuide[] = []
  const collect = (
    axis: 'x' | 'y',
    lines: (r: Rect) => number[],
    span: (r: Rect) => [number, number],
  ) => {
    const [boxFrom, boxTo] = span(box)
    for (const m of new Set(lines(box))) {
      let from = boxFrom
      let to = boxTo
      let hit = false
      for (const t of targets) {
        if (!lines(t).some((v) => Math.abs(v - m) <= ALIGNED_EPS)) continue
        const [a, b] = span(t)
        from = Math.min(from, a)
        to = Math.max(to, b)
        hit = true
      }
      if (hit) guides.push({ axis, pos: m, from, to })
    }
  }
  collect('x', xLines, (r) => [r.y, r.y + r.h])
  collect('y', yLines, (r) => [r.x, r.x + r.w])
  return guides
}
