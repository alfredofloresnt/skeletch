import { getBounds, uid } from './geometry'
import type {
  AtomicType,
  CustomComponentDef,
  LayoutPart,
  TextAlign,
  VerticalAlign,
  WireElement,
} from './types'

const ATOMIC: AtomicType[] = ['rect', 'circle', 'triangle', 'line', 'text', 'image']

/** `selected` should already be expanded for groups (full atom list). */
export function selectionToParts(selected: WireElement[]): LayoutPart[] | null {
  if (!selected.length) return null

  const boardIds = new Set(selected.map((el) => el.artboardId))
  if (boardIds.size !== 1) return null

  const bounds = getBounds(selected)
  if (!bounds || bounds.w < 1 || bounds.h < 1) return null

  return selected.map((el) =>
    sanitizePart({
      type: el.type,
      name: el.name,
      x: el.x - bounds.x,
      y: el.y - bounds.y,
      w: el.w,
      h: el.h,
      rotation: el.rotation || 0,
      fill: el.fill,
      stroke: el.stroke,
      strokeWidth: el.strokeWidth,
      opacity: el.opacity,
      cornerRadius: el.cornerRadius,
      text: el.text,
      fontSize: el.fontSize,
      textAlign: el.textAlign,
      verticalAlign: el.verticalAlign,
    }),
  )
}

export function canSaveSelection(selected: WireElement[]): boolean {
  return selectionToParts(selected) !== null
}

function sanitizePart(part: LayoutPart): LayoutPart {
  if (!ATOMIC.includes(part.type)) {
    throw new Error(`Invalid part type: ${part.type}`)
  }
  return {
    type: part.type,
    name: part.name,
    x: Number(part.x) || 0,
    y: Number(part.y) || 0,
    w: Number(part.w) || 0,
    h: Number(part.h) || 0,
    rotation: Number(part.rotation) || 0,
    fill: part.fill,
    stroke: part.stroke,
    strokeWidth: part.strokeWidth,
    opacity: part.opacity,
    cornerRadius: part.cornerRadius ?? 0,
    text: part.text,
    fontSize: part.fontSize,
    textAlign: (part.textAlign || 'left') as TextAlign,
    verticalAlign: (part.verticalAlign || 'top') as VerticalAlign,
  }
}

function sanitizeComponent(raw: Partial<CustomComponentDef>): CustomComponentDef | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null
  if (!Array.isArray(raw.parts) || !raw.parts.length) return null
  try {
    return {
      id: raw.id,
      name: raw.name.trim(),
      parts: raw.parts.map((p) => sanitizePart(p)),
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    }
  } catch {
    return null
  }
}

/** Sanitize components embedded in a .wireframe document. */
export function sanitizeComponents(raw: unknown): CustomComponentDef[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((c) => sanitizeComponent(c as Partial<CustomComponentDef>))
    .filter((c): c is CustomComponentDef => Boolean(c))
}

export function addComponent(
  components: CustomComponentDef[],
  parts: LayoutPart[],
  name: string,
): CustomComponentDef[] {
  const now = new Date().toISOString()
  const next: CustomComponentDef = {
    id: uid('cmp'),
    name: name.trim() || `Component ${components.length + 1}`,
    parts: parts.map((p) => sanitizePart(p)),
    createdAt: now,
    updatedAt: now,
  }
  return [...components, next]
}

export function removeComponent(
  components: CustomComponentDef[],
  id: string,
): CustomComponentDef[] {
  return components.filter((c) => c.id !== id)
}

export function renameComponent(
  components: CustomComponentDef[],
  id: string,
  name: string,
): CustomComponentDef[] {
  const trimmed = name.trim()
  if (!trimmed) return components
  return components.map((c) =>
    c.id === id
      ? { ...c, name: trimmed, updatedAt: new Date().toISOString() }
      : c,
  )
}

export function nextComponentDefaultName(components: CustomComponentDef[]): string {
  return `Component ${components.length + 1}`
}
