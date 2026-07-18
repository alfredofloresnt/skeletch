export type AtomicType =
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'line'
  | 'text'
  | 'image'

export type ComposedKind =
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
  width: number
  height: number
}

/** Partial layout atom before ids / z are assigned. */
export interface LayoutPart {
  type: AtomicType
  x: number
  y: number
  w: number
  h: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  cornerRadius?: number
  text?: string
  fontSize?: number
  textAlign?: TextAlign
  verticalAlign?: VerticalAlign
  name?: string
}

export interface WireElement extends LayoutPart {
  id: string
  z: number
  name?: string
  groupId?: string | null
  groupName?: string
  groupKind?: string
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
  artboard: Artboard
  presetId: string
  snapOn: boolean
  elements: WireElement[]
}

export interface ActionMenuItem {
  id: string
  label: string
  disabled?: boolean
  onSelect: () => void
}
