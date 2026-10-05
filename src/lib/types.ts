export type AtomicType =
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'line'
  | 'text'
  | 'image'
  | 'path'

/** Handle offset relative to the vertex, in the same coordinate space. */
export interface PathHandle {
  x: number
  y: number
}

/** Cubic Bézier path vertex (anchors + optional in/out handles). */
export interface PathVertex {
  x: number
  y: number
  /** Incoming handle (toward previous segment). Absent/zero = corner. */
  in?: PathHandle
  /** Outgoing handle (toward next segment). Absent/zero = corner. */
  out?: PathHandle
}

export type ComposedKind =
  | 'image'
  | 'input'
  | 'search'
  | 'button'
  | 'checkbox'
  | 'switch'
  | 'slider'
  | 'dropdown'
  | 'card'
  | 'slideshow'
  | 'grid'

export type PlaceType = AtomicType | ComposedKind

/** Click/drag place target: built-in type or a custom component id. */
export type PlaceTool = PlaceType | { customId: string }

export function isCustomPlace(tool: PlaceTool): tool is { customId: string } {
  return typeof tool === 'object' && tool !== null && 'customId' in tool
}

/** Top-rail shape tools that stay selected and draw via click-drag. */
export type DrawTool = Exclude<AtomicType, 'image' | 'path'>

export function isDrawTool(tool: PlaceTool | null | undefined): tool is DrawTool {
  return (
    tool === 'rect' ||
    tool === 'circle' ||
    tool === 'triangle' ||
    tool === 'line' ||
    tool === 'text'
  )
}

/** Pen tool — multi-click Bézier session, not box-drag. */
export function isPathTool(tool: PlaceTool | null | undefined): tool is 'path' {
  return tool === 'path'
}

/** In-progress pen session (artboard-local vertex coordinates). */
export interface PenDraft {
  artboardId: string
  vertices: PathVertex[]
  cursor: Point | null
  draggingHandle: boolean
}

export type TextAlign = 'left' | 'middle' | 'right'
export type VerticalAlign = 'top' | 'middle' | 'bottom'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Artboard {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  presetId: string
}

/** Partial layout atom before ids / z are assigned. */
export interface LayoutPart {
  type: AtomicType
  x: number
  y: number
  w: number
  h: number
  /** Degrees, clockwise. */
  rotation?: number
  fill?: string
  /** Pasted/uploaded image data URL used as fill (object-fit: cover). */
  fillImage?: string | null
  stroke?: string
  strokeWidth?: number
  opacity?: number
  cornerRadius?: number
  text?: string
  fontSize?: number
  textAlign?: TextAlign
  verticalAlign?: VerticalAlign
  name?: string
  /** Whether the path closes back to the first vertex. */
  pathClosed?: boolean
  /** Path vertices normalized to the element box (0..100). */
  pathVertices?: PathVertex[]
}

export interface WireElement extends LayoutPart {
  id: string
  z: number
  artboardId: string
  name?: string
  groupId?: string | null
  /** Locked elements stay selectable but cannot be moved or resized. */
  locked?: boolean
  groupName?: string
  groupKind?: string
  /** Bound design variable ids (resolved values stay on fill / fontSize / cornerRadius). */
  fillVar?: string | null
  fontSizeVar?: string | null
  cornerRadiusVar?: string | null
}

export type DesignVariableType = 'color' | 'number'

export interface DesignVariable {
  id: string
  name: string
  type: DesignVariableType
  value: string | number
}

export type LayerTreeRow =
  | {
      kind: 'group'
      groupId: string
      name: string
      groupKind: string
      children: WireElement[]
      z: number
    }
  | {
      kind: 'element'
      el: WireElement
      z: number
    }

export interface WireframeDocument {
  format: 'wireframe'
  version: number
  savedAt?: string
  artboards: Artboard[]
  activeArtboardId: string
  snapOn: boolean
  elements: WireElement[]
  variables?: DesignVariable[]
  /** Project-scoped custom components (saved with the .wireframe). */
  components?: CustomComponentDef[]
}

export interface ActionMenuItem {
  id: string
  label: string
  disabled?: boolean
  onSelect: () => void
}

/** Saved reusable component (relative LayoutPart snapshot). */
export interface CustomComponentDef {
  id: string
  name: string
  parts: LayoutPart[]
  createdAt?: string
  updatedAt?: string
}

