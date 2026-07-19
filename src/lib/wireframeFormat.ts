import type { Artboard, TextAlign, VerticalAlign, WireElement, WireframeDocument } from './types'

export const WIREFRAME_VERSION = 1
export const WIREFRAME_MIME = 'application/x-wireframe+json'

/**
 * Portable document format (.wireframe)
 * {
 *   format: "wireframe",
 *   version: 1,
 *   artboard: { width, height },
 *   presetId?: string,
 *   snapOn?: boolean,
 *   elements: Element[]
 * }
 */

export function serializeWireframe({
  artboard,
  presetId,
  snapOn,
  elements,
}: {
  artboard: Artboard
  presetId: string
  snapOn: boolean
  elements: WireElement[]
}): WireframeDocument {
  return {
    format: 'wireframe',
    version: WIREFRAME_VERSION,
    savedAt: new Date().toISOString(),
    artboard: {
      width: Number(artboard.width),
      height: Number(artboard.height),
    },
    presetId: presetId || 'custom',
    snapOn: Boolean(snapOn),
    elements: elements.map(sanitizeElement),
  }
}

function sanitizeElement(el: WireElement): WireElement {
  return {
    id: el.id,
    type: el.type,
    name: el.name,
    x: el.x,
    y: el.y,
    w: el.w,
    h: el.h,
    z: el.z,
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

export function parseWireframe(raw: string | unknown): Omit<WireframeDocument, 'format' | 'version' | 'savedAt'> {
  const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<WireframeDocument>

  if (!data || data.format !== 'wireframe') {
    throw new Error('Not a valid .wireframe file')
  }
  if (typeof data.version !== 'number' || data.version > WIREFRAME_VERSION) {
    throw new Error(`Unsupported .wireframe version: ${data.version}`)
  }
  if (!data.artboard?.width || !data.artboard?.height) {
    throw new Error('Missing artboard size')
  }
  if (!Array.isArray(data.elements)) {
    throw new Error('Missing elements array')
  }

  return {
    artboard: {
      width: Number(data.artboard.width),
      height: Number(data.artboard.height),
    },
    presetId: data.presetId || 'custom',
    snapOn: data.snapOn !== false,
    elements: data.elements.map(sanitizeElement),
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
  const { width, height } = doc.artboard
  const stamp = new Date().toISOString().slice(0, 10)
  return `skeletch-${width}x${height}-${stamp}.wireframe`
}

export function readWireframeFile(file: File): Promise<ReturnType<typeof parseWireframe>> {
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
