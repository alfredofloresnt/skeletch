import { createArtboard } from './artboards'
import type { Artboard, TextAlign, VerticalAlign, WireElement, WireframeDocument } from './types'

export const WIREFRAME_VERSION = 2
export const WIREFRAME_MIME = 'application/x-wireframe+json'

/**
 * Portable document format (.wireframe)
 * v2: artboards[] + activeArtboardId + elements with artboardId
 * v1: singular artboard + presetId (migrated on parse)
 */

export function serializeWireframe({
  artboards,
  activeArtboardId,
  snapOn,
  elements,
}: {
  artboards: Artboard[]
  activeArtboardId: string
  snapOn: boolean
  elements: WireElement[]
}): WireframeDocument {
  return {
    format: 'wireframe',
    version: WIREFRAME_VERSION,
    savedAt: new Date().toISOString(),
    artboards: artboards.map(sanitizeArtboard),
    activeArtboardId,
    snapOn: Boolean(snapOn),
    elements: elements.map((el) => sanitizeElement(el)),
  }
}

function sanitizeArtboard(ab: Artboard): Artboard {
  return {
    id: ab.id,
    name: ab.name || 'Artboard',
    x: Number(ab.x) || 0,
    y: Number(ab.y) || 0,
    width: Number(ab.width),
    height: Number(ab.height),
    presetId: ab.presetId || 'custom',
  }
}

function sanitizeElement(el: WireElement, fallbackArtboardId?: string): WireElement {
  return {
    id: el.id,
    type: el.type,
    name: el.name,
    x: el.x,
    y: el.y,
    w: el.w,
    h: el.h,
    z: el.z,
    artboardId: el.artboardId || fallbackArtboardId || '',
    fill: el.fill,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    opacity: el.opacity,
    cornerRadius: el.cornerRadius ?? 0,
    text: el.text,
    fontSize: el.fontSize,
    textAlign: (el.textAlign || 'left') as TextAlign,
    verticalAlign: (el.verticalAlign || 'top') as VerticalAlign,
    groupId: el.groupId ?? null,
    groupName: el.groupName,
    groupKind: el.groupKind,
  }
}

type ParsedDoc = Omit<WireframeDocument, 'format' | 'version' | 'savedAt'>

export function parseWireframe(raw: string | unknown): ParsedDoc {
  const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>

  if (!data || data.format !== 'wireframe') {
    throw new Error('Not a valid .wireframe file')
  }
  if (typeof data.version !== 'number' || data.version > WIREFRAME_VERSION) {
    throw new Error(`Unsupported .wireframe version: ${data.version}`)
  }
  if (!Array.isArray(data.elements)) {
    throw new Error('Missing elements array')
  }

  if (data.version >= 2 && Array.isArray(data.artboards) && data.artboards.length) {
    const artboards = (data.artboards as Artboard[]).map(sanitizeArtboard)
    const activeArtboardId =
      typeof data.activeArtboardId === 'string' &&
      artboards.some((ab) => ab.id === data.activeArtboardId)
        ? data.activeArtboardId
        : artboards[0].id
    const fallback = artboards[0].id
    return {
      artboards,
      activeArtboardId,
      snapOn: data.snapOn !== false,
      elements: (data.elements as WireElement[]).map((el) => {
        const next = sanitizeElement(el, fallback)
        if (!artboards.some((ab) => ab.id === next.artboardId)) {
          next.artboardId = fallback
        }
        return next
      }),
    }
  }

  // v1 migrate: singular artboard + presetId
  const legacy = data.artboard as { width?: number; height?: number } | undefined
  if (!legacy?.width || !legacy?.height) {
    throw new Error('Missing artboard size')
  }
  const presetId = typeof data.presetId === 'string' ? data.presetId : 'custom'
  const artboard = createArtboard({
    width: Number(legacy.width),
    height: Number(legacy.height),
    presetId,
    x: 0,
    y: 0,
  })
  return {
    artboards: [artboard],
    activeArtboardId: artboard.id,
    snapOn: data.snapOn !== false,
    elements: (data.elements as WireElement[]).map((el) =>
      sanitizeElement(el, artboard.id),
    ),
  }
}

export function downloadWireframe(doc: WireframeDocument, filename?: string): void {
  const json = JSON.stringify(doc, null, 2)
  const blob = new Blob([json], { type: WIREFRAME_MIME })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || defaultFilename(doc)
  link.click()
  URL.revokeObjectURL(url)
}

function defaultFilename(doc: WireframeDocument): string {
  const active =
    doc.artboards.find((ab) => ab.id === doc.activeArtboardId) || doc.artboards[0]
  const stamp = new Date().toISOString().slice(0, 10)
  if (!active) return `skeletch-${stamp}.wireframe`
  return `skeletch-${active.width}x${active.height}-${stamp}.wireframe`
}

export function readWireframeFile(file: File): Promise<ParsedDoc> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(parseWireframe(String(reader.result)))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
