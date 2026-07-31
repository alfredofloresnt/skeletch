import { getBounds, uid } from './geometry'
import type {
  AtomicType,
  ComponentLibrary,
  CustomComponentDef,
  LayoutPart,
  TextAlign,
  VerticalAlign,
  WireElement,
} from './types'

export const COMPONENT_LIBRARY_VERSION = 1
export const COMPONENT_LIBRARY_FORMAT = 'skeletch-components' as const
export const COMPONENT_LIBRARY_KEY = 'skeletch.componentLibrary'
export const COMPONENT_LIBRARY_MIME = 'application/x-skeletch-components+json'

const ATOMIC: AtomicType[] = ['rect', 'circle', 'triangle', 'line', 'text', 'image']

export function emptyLibrary(): ComponentLibrary {
  return {
    format: COMPONENT_LIBRARY_FORMAT,
    version: COMPONENT_LIBRARY_VERSION,
    components: [],
  }
}

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

export function parseLibrary(raw: string | unknown): ComponentLibrary {
  const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<ComponentLibrary>
  if (!data || data.format !== COMPONENT_LIBRARY_FORMAT) {
    throw new Error('Not a valid Skeletch components file')
  }
  if (typeof data.version !== 'number' || data.version > COMPONENT_LIBRARY_VERSION) {
    throw new Error(`Unsupported components version: ${data.version}`)
  }
  if (!Array.isArray(data.components)) {
    throw new Error('Missing components array')
  }
  const components = data.components
    .map((c) => sanitizeComponent(c))
    .filter((c): c is CustomComponentDef => Boolean(c))
  return {
    format: COMPONENT_LIBRARY_FORMAT,
    version: COMPONENT_LIBRARY_VERSION,
    components,
  }
}

export function serializeLibrary(components: CustomComponentDef[]): ComponentLibrary {
  return {
    format: COMPONENT_LIBRARY_FORMAT,
    version: COMPONENT_LIBRARY_VERSION,
    components: components.map((c) => ({
      id: c.id,
      name: c.name,
      parts: c.parts.map((p) => sanitizePart(p)),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  }
}

export function loadLibrary(): CustomComponentDef[] {
  try {
    const raw = localStorage.getItem(COMPONENT_LIBRARY_KEY)
    if (!raw) return []
    return parseLibrary(raw).components
  } catch {
    return []
  }
}

export function persistLibrary(components: CustomComponentDef[]): void {
  try {
    localStorage.setItem(COMPONENT_LIBRARY_KEY, JSON.stringify(serializeLibrary(components)))
  } catch {
    /* quota / private mode */
  }
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

/** Imported ids overwrite local ones; other locals kept. */
export function mergeLibraries(
  local: CustomComponentDef[],
  imported: CustomComponentDef[],
): CustomComponentDef[] {
  const byId = new Map(local.map((c) => [c.id, c]))
  for (const c of imported) byId.set(c.id, c)
  return [...byId.values()]
}

export function downloadLibrary(components: CustomComponentDef[], filename?: string): void {
  const doc = serializeLibrary(components)
  const json = JSON.stringify(doc, null, 2)
  const blob = new Blob([json], { type: COMPONENT_LIBRARY_MIME })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const stamp = new Date().toISOString().slice(0, 10)
  link.download = filename || `skeletch-components-${stamp}.components.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function readLibraryFile(file: File): Promise<CustomComponentDef[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(parseLibrary(String(reader.result)).components)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

export function nextComponentDefaultName(components: CustomComponentDef[]): string {
  return `Component ${components.length + 1}`
}
