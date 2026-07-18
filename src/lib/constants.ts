import type { AtomicType, ComposedKind, TextAlign, VerticalAlign } from './types'

export const GRID_SIZE = 8

export const FRAME_PRESETS = [
  { id: 'phone', label: 'Phone', width: 390, height: 844 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024 },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
] as const

export type FramePresetId = (typeof FRAME_PRESETS)[number]['id'] | 'custom'

export const ELEMENT_TYPES: { type: AtomicType; label: string }[] = [
  { type: 'rect', label: 'Rectangle' },
  { type: 'circle', label: 'Circle' },
  { type: 'triangle', label: 'Triangle' },
  { type: 'line', label: 'Line' },
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
]

export const COMPOSED_TYPES: { type: ComposedKind; label: string }[] = [
  { type: 'input', label: 'Input' },
  { type: 'search', label: 'Search' },
  { type: 'button', label: 'Button' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'switch', label: 'Switch' },
  { type: 'slider', label: 'Slider' },
  { type: 'dropdown', label: 'Dropdown' },
  { type: 'card', label: 'Card' },
  { type: 'slideshow', label: 'Slideshow' },
  { type: 'grid', label: 'Grid' },
]

type ShapeDefaults = {
  w: number
  h: number
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
  cornerRadius?: number
  text?: string
  fontSize?: number
  textAlign?: TextAlign
  verticalAlign?: VerticalAlign
}

export const DEFAULTS: Record<AtomicType, ShapeDefaults> = {
  rect: {
    w: 160,
    h: 96,
    fill: 'transparent',
    stroke: '#1a1a1a',
    strokeWidth: 2,
    opacity: 1,
    cornerRadius: 0,
  },
  circle: {
    w: 96,
    h: 96,
    fill: 'transparent',
    stroke: '#1a1a1a',
    strokeWidth: 2,
    opacity: 1,
    cornerRadius: 0,
  },
  triangle: {
    w: 96,
    h: 96,
    fill: 'transparent',
    stroke: '#1a1a1a',
    strokeWidth: 2,
    opacity: 1,
  },
  line: {
    w: 160,
    h: 0,
    fill: 'transparent',
    stroke: '#1a1a1a',
    strokeWidth: 2,
    opacity: 1,
  },
  text: {
    w: 160,
    h: 32,
    text: 'Text',
    fontSize: 16,
    textAlign: 'middle',
    verticalAlign: 'middle',
    fill: '#1a1a1a',
    stroke: 'transparent',
    strokeWidth: 0,
    opacity: 1,
  },
  image: {
    w: 160,
    h: 120,
    fill: 'transparent',
    stroke: '#1a1a1a',
    strokeWidth: 2,
    opacity: 1,
    cornerRadius: 0,
  },
}

export const MIN_SIZE = 8
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 3
export const ZOOM_STEP = 0.1
