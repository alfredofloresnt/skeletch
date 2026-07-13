export const GRID_SIZE = 8

export const FRAME_PRESETS = [
  { id: 'phone', label: 'Phone', width: 390, height: 844 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024 },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
]

export const ELEMENT_TYPES = [
  { type: 'rect', label: 'Rectangle', icon: 'rect' },
  { type: 'circle', label: 'Circle', icon: 'circle' },
  { type: 'line', label: 'Line', icon: 'line' },
  { type: 'text', label: 'Text', icon: 'text' },
  { type: 'image', label: 'Image', icon: 'image' },
]

export const COMPOSED_TYPES = [
  { type: 'input', label: 'Input', icon: 'input' },
  { type: 'button', label: 'Button', icon: 'button' },
  { type: 'checkbox', label: 'Checkbox', icon: 'checkbox' },
  { type: 'dropdown', label: 'Dropdown', icon: 'dropdown' },
  { type: 'card', label: 'Card', icon: 'card' },
  { type: 'grid', label: 'Grid', icon: 'grid' },
]

export const DEFAULTS = {
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
    textAlign: 'left',
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
