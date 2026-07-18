import { DEFAULTS } from './constants'
import { getBounds, snap, uid } from './geometry'
import type {
  AtomicType,
  ComposedKind,
  LayoutPart,
  LayerTreeRow,
  PlaceType,
  Rect,
  WireElement,
} from './types'

let nameCounters: Record<string, number> = {}

export function resetNameCounters(): void {
  nameCounters = {}
}

function nextName(type: string): string {
  const label = type.charAt(0).toUpperCase() + type.slice(1)
  nameCounters[type] = (nameCounters[type] || 0) + 1
  return `${label} ${nameCounters[type]}`
}

function atom(type: AtomicType, overrides: Partial<LayoutPart> & Pick<LayoutPart, 'x' | 'y' | 'w' | 'h'>): LayoutPart {
  const d = DEFAULTS[type]
  return {
    type,
    fill: d.fill,
    stroke: d.stroke,
    strokeWidth: d.strokeWidth,
    opacity: d.opacity,
    cornerRadius: d.cornerRadius ?? 0,
    text: d.text,
    fontSize: d.fontSize,
    textAlign: d.textAlign || 'left',
    verticalAlign: d.verticalAlign || 'top',
    ...overrides,
  }
}

/** Relative layouts (origin top-left of composition). */
const COMPOSED_LAYOUTS: Record<ComposedKind, () => LayoutPart[]> = {
  input: () => [
    atom('rect', { x: 0, y: 0, w: 200, h: 40, cornerRadius: 4, name: 'Field' }),
    atom('text', {
      x: 12,
      y: 0,
      w: 176,
      h: 40,
      text: 'Placeholder',
      fontSize: 14,
      textAlign: 'left',
      verticalAlign: 'middle',
      name: 'Label',
    }),
  ],
  search: () => [
    atom('rect', { x: 0, y: 0, w: 220, h: 40, cornerRadius: 20, name: 'Field' }),
    atom('circle', { x: 12, y: 10, w: 14, h: 14, name: 'Icon' }),
    atom('line', { x: 24, y: 24, w: 6, h: 6, name: 'Handle' }),
    atom('text', {
      x: 36,
      y: 0,
      w: 168,
      h: 40,
      text: 'Search…',
      fontSize: 14,
      textAlign: 'left',
      verticalAlign: 'middle',
      name: 'Label',
    }),
  ],
  button: () => [
    atom('rect', { x: 0, y: 0, w: 120, h: 40, cornerRadius: 6, name: 'Bg' }),
    atom('text', {
      x: 0,
      y: 0,
      w: 120,
      h: 40,
      text: 'Button',
      fontSize: 14,
      textAlign: 'middle',
      verticalAlign: 'middle',
      name: 'Label',
    }),
  ],
  checkbox: () => [
    atom('rect', { x: 0, y: 2, w: 20, h: 20, cornerRadius: 2, name: 'Box' }),
    atom('line', { x: 4, y: 12, w: 5, h: 6, name: 'Check1' }),
    atom('line', { x: 9, y: 18, w: 8, h: -10, name: 'Check2' }),
    atom('text', {
      x: 28,
      y: 2,
      w: 100,
      h: 20,
      text: 'Checkbox',
      fontSize: 14,
      textAlign: 'left',
      verticalAlign: 'middle',
      name: 'Label',
    }),
  ],
  switch: () => [
    atom('rect', { x: 0, y: 0, w: 44, h: 24, cornerRadius: 12, name: 'Track' }),
    atom('circle', {
      x: 22,
      y: 2,
      w: 20,
      h: 20,
      fill: '#1a1a1a',
      name: 'Thumb',
    }),
  ],
  slider: () => [
    atom('line', { x: 0, y: 12, w: 160, h: 0, name: 'Track' }),
    atom('circle', {
      x: 104,
      y: 4,
      w: 16,
      h: 16,
      fill: '#1a1a1a',
      name: 'Thumb',
    }),
  ],
  dropdown: () => [
    atom('rect', { x: 0, y: 0, w: 180, h: 40, cornerRadius: 4, name: 'Field' }),
    atom('text', {
      x: 12,
      y: 0,
      w: 120,
      h: 40,
      text: 'Select…',
      fontSize: 14,
      textAlign: 'left',
      verticalAlign: 'middle',
      name: 'Label',
    }),
    atom('line', { x: 152, y: 16, w: 8, h: 8, name: 'Chevron L' }),
    atom('line', { x: 160, y: 24, w: 8, h: -8, name: 'Chevron R' }),
  ],
  card: () => [
    atom('rect', { x: 0, y: 0, w: 220, h: 260, cornerRadius: 8, name: 'Frame' }),
    atom('image', { x: 16, y: 16, w: 188, h: 110, name: 'Media' }),
    atom('text', {
      x: 16,
      y: 140,
      w: 188,
      h: 24,
      text: 'Card title',
      fontSize: 16,
      textAlign: 'left',
      verticalAlign: 'top',
      name: 'Title',
    }),
    atom('text', {
      x: 16,
      y: 172,
      w: 188,
      h: 48,
      text: 'Supporting body copy for the card.',
      fontSize: 13,
      textAlign: 'left',
      verticalAlign: 'top',
      name: 'Body',
    }),
    atom('rect', { x: 16, y: 228, w: 72, h: 20, cornerRadius: 4, name: 'CTA' }),
  ],
  slideshow: () => [
    atom('rect', { x: 0, y: 0, w: 280, h: 160, cornerRadius: 6, name: 'Frame' }),
    atom('image', { x: 12, y: 12, w: 256, h: 112, name: 'Slide' }),
    // Prev chevron <
    atom('line', { x: 20, y: 70, w: 8, h: -8, name: 'Prev L' }),
    atom('line', { x: 20, y: 70, w: 8, h: 8, name: 'Prev R' }),
    // Next chevron >
    atom('line', { x: 252, y: 62, w: 8, h: 8, name: 'Next L' }),
    atom('line', { x: 252, y: 78, w: 8, h: -8, name: 'Next R' }),
    // Dots
    atom('circle', { x: 118, y: 136, w: 8, h: 8, fill: '#1a1a1a', name: 'Dot 1' }),
    atom('circle', { x: 136, y: 136, w: 8, h: 8, name: 'Dot 2' }),
    atom('circle', { x: 154, y: 136, w: 8, h: 8, name: 'Dot 3' }),
  ],
  grid: () => {
    const cells: LayoutPart[] = []
    const cols = 2
    const rows = 2
    const cellW = 100
    const cellH = 80
    const gap = 8
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push(
          atom('rect', {
            x: c * (cellW + gap),
            y: r * (cellH + gap),
            w: cellW,
            h: cellH,
            name: `Cell ${r * cols + c + 1}`,
          }),
        )
      }
    }
    return cells
  },
}

export const COMPOSED_KINDS = Object.keys(COMPOSED_LAYOUTS) as ComposedKind[]

export function isComposedKind(type: string): type is ComposedKind {
  return COMPOSED_KINDS.includes(type as ComposedKind)
}

/** Static preview elements for the palette (no ids/name counters). */
export function getPalettePreview(type: PlaceType): WireElement[] {
  let parts: WireElement[]
  if (isComposedKind(type)) {
    parts = COMPOSED_LAYOUTS[type]().map((part, i) => ({
      id: `preview-${type}-${i}`,
      ...part,
      z: i + 1,
      groupId: null,
    }))
  } else {
    const d = DEFAULTS[type]
    if (!d) return []
    parts = [
      {
        id: `preview-${type}`,
        type,
        x: 0,
        y: 0,
        w: d.w,
        h: d.h,
        z: 1,
        fill: d.fill,
        stroke: d.stroke,
        strokeWidth: d.strokeWidth,
        opacity: d.opacity,
        cornerRadius: d.cornerRadius ?? 0,
        text: d.text,
        fontSize: d.fontSize,
        textAlign: d.textAlign || 'left',
        verticalAlign: d.verticalAlign || 'top',
        groupId: null,
      },
    ]
  }

  const bounds = getBounds(parts)
  if (!bounds) return parts
  // Light strokes/text for dark panel thumbnails.
  return parts.map((el) => ({
    ...el,
    x: el.x - bounds.x,
    y: el.y - bounds.y,
    stroke: el.stroke && el.stroke !== 'transparent' ? '#ffffff' : el.stroke,
    fill: el.type === 'text' ? '#ffffff' : el.fill,
  }))
}

export function createElement(
  type: AtomicType,
  x: number,
  y: number,
  z: number,
  snapOn: boolean,
): WireElement {
  const defaults = DEFAULTS[type]
  const w = defaults.w
  const h = defaults.h
  return {
    id: uid(),
    type,
    name: nextName(type),
    x: snap(x - w / 2, snapOn),
    y: snap(y - h / 2, snapOn),
    w,
    h,
    z,
    fill: defaults.fill,
    stroke: defaults.stroke,
    strokeWidth: defaults.strokeWidth,
    opacity: defaults.opacity,
    cornerRadius: defaults.cornerRadius ?? 0,
    text: defaults.text,
    fontSize: defaults.fontSize,
    textAlign: defaults.textAlign || 'left',
    verticalAlign: defaults.verticalAlign || 'top',
    groupId: null,
  }
}

/** Build grouped atomic elements for a composed widget, centered on (cx, cy). */
export function createComposed(
  kind: ComposedKind,
  cx: number,
  cy: number,
  startZ: number,
  snapOn: boolean,
): WireElement[] {
  const layout = COMPOSED_LAYOUTS[kind]
  if (!layout) return []

  const parts = layout()
  const bounds = getBounds(parts)
  if (!bounds) return []
  const groupId = uid('grp')
  const groupName = nextName(kind)
  const ox = snap(cx - bounds.w / 2, snapOn)
  const oy = snap(cy - bounds.h / 2, snapOn)

  return parts.map((part, i) => ({
    id: uid(),
    ...part,
    name: part.name || `${groupName} · ${i + 1}`,
    x: ox + part.x,
    y: oy + part.y,
    z: startZ + i,
    groupId,
    groupName,
    groupKind: kind,
  }))
}

export function nextZ(elements: WireElement[]): number {
  if (!elements.length) return 1
  return Math.max(...elements.map((e) => e.z)) + 1
}

export function getGroupMembers(elements: WireElement[], groupId: string): WireElement[] {
  return elements.filter((el) => el.groupId === groupId)
}

export function expandSelectionForGroups(
  elements: WireElement[],
  ids: string[],
  editingGroupId: string | null,
): string[] {
  const set = new Set(ids)
  for (const id of ids) {
    const el = elements.find((e) => e.id === id)
    if (!el?.groupId) continue
    if (editingGroupId && el.groupId === editingGroupId) continue
    for (const m of getGroupMembers(elements, el.groupId)) set.add(m.id)
  }
  return [...set]
}

export function ungroup(elements: WireElement[], groupId: string): WireElement[] {
  return elements.map((el) =>
    el.groupId === groupId
      ? { ...el, groupId: null, groupName: undefined, groupKind: undefined }
      : el,
  )
}

export function scaleElementsToBounds(
  elements: WireElement[],
  origins: WireElement[],
  oldBounds: Rect,
  newBounds: Rect,
): WireElement[] {
  if (!oldBounds || oldBounds.w < 1 || oldBounds.h < 1) return elements
  const sx = newBounds.w / oldBounds.w
  const sy = newBounds.h / oldBounds.h
  const originById = new Map(origins.map((el) => [el.id, el]))
  return elements.map((el) => {
    const origin = originById.get(el.id)
    if (!origin) return el
    const next: WireElement = {
      ...el,
      x: newBounds.x + (origin.x - oldBounds.x) * sx,
      y: newBounds.y + (origin.y - oldBounds.y) * sy,
      w: Math.max(1, origin.w * sx),
      h: origin.type === 'line' ? origin.h * sy : Math.max(1, origin.h * sy),
    }
    if (origin.fontSize) next.fontSize = Math.max(8, origin.fontSize * sy)
    return next
  })
}

/** Top-level layer rows: groups + ungrouped atoms, sorted by max z desc. */
export function buildLayerTree(elements: WireElement[]): LayerTreeRow[] {
  const groups = new Map<string, Extract<LayerTreeRow, { kind: 'group' }>>()
  const singles: Extract<LayerTreeRow, { kind: 'element' }>[] = []

  for (const el of elements) {
    if (el.groupId) {
      if (!groups.has(el.groupId)) {
        groups.set(el.groupId, {
          kind: 'group',
          groupId: el.groupId,
          name: el.groupName || 'Group',
          groupKind: el.groupKind || 'group',
          children: [],
          z: el.z,
        })
      }
      const g = groups.get(el.groupId)!
      g.children.push(el)
      g.z = Math.max(g.z, el.z)
    } else {
      singles.push({ kind: 'element', el, z: el.z })
    }
  }

  for (const g of groups.values()) {
    g.children.sort((a, b) => b.z - a.z)
  }

  return [...groups.values(), ...singles].sort((a, b) => b.z - a.z)
}

/** Reorder top-level layer tree rows; remaps z across all elements.
 *  `orderedTopIds` is top-first (front → back), matching the Layers list. */
export function reorderLayerTree(elements: WireElement[], orderedTopIds: string[]): WireElement[] {
  // orderedTopIds: group:xxx or element id
  const tree = buildLayerTree(elements)
  const byKey = new Map<string, LayerTreeRow>()
  for (const row of tree) {
    const key = row.kind === 'group' ? `group:${row.groupId}` : row.el.id
    byKey.set(key, row)
  }

  const ordered = orderedTopIds.map((key) => byKey.get(key)).filter((r): r is LayerTreeRow => Boolean(r))
  // Painter's order: back → front (bottom of list → top of list)
  const flat: WireElement[] = []
  for (const row of [...ordered].reverse()) {
    if (row.kind === 'group') {
      flat.push(...[...row.children].sort((a, b) => a.z - b.z))
    } else {
      flat.push(row.el)
    }
  }

  const byId = Object.fromEntries(elements.map((e) => [e.id, e]))
  for (const el of elements) {
    if (!flat.find((f) => f.id === el.id)) flat.push(el)
  }

  return flat.map((el, i) => ({ ...byId[el.id], z: i + 1 }))
}

/** Reorder atoms inside a group (ids top-first). Keeps the group’s place in the stack. */
export function reorderGroupChildren(
  elements: WireElement[],
  groupId: string,
  orderedChildIdsTopFirst: string[],
): WireElement[] {
  const tree = buildLayerTree(elements)
  const topKeys = tree.map((row) =>
    row.kind === 'group' ? `group:${row.groupId}` : row.el.id,
  )
  const n = orderedChildIdsTopFirst.length
  const next = elements.map((el) => {
    if (el.groupId !== groupId) return el
    const idx = orderedChildIdsTopFirst.indexOf(el.id)
    if (idx < 0) return el
    return { ...el, z: n - idx }
  })
  return reorderLayerTree(next, topKeys)
}

export function reorderLayers(elements: WireElement[], orderedIdsTopFirst: string[]): WireElement[] {
  const byId = Object.fromEntries(elements.map((e) => [e.id, e]))
  const n = orderedIdsTopFirst.length
  return orderedIdsTopFirst.map((id, i) => ({
    ...byId[id],
    z: n - i,
  }))
}

export function setLayerDepth(elements: WireElement[], id: string, z: number | string): WireElement[] {
  return elements.map((el) => (el.id === id ? { ...el, z: Number(z) || 0 } : el))
}

export function bringForward(elements: WireElement[], ids: string[]): WireElement[] {
  const selected = new Set(ids)
  const sorted = [...elements].sort((a, b) => a.z - b.z)
  const result = sorted.map((el) => ({ ...el }))
  for (let i = result.length - 2; i >= 0; i--) {
    if (selected.has(result[i].id) && !selected.has(result[i + 1].id)) {
      const tmp = result[i]
      result[i] = result[i + 1]
      result[i + 1] = tmp
    }
  }
  return result.map((el, i) => ({ ...el, z: i + 1 }))
}

export function sendBackward(elements: WireElement[], ids: string[]): WireElement[] {
  const selected = new Set(ids)
  const sorted = [...elements].sort((a, b) => a.z - b.z)
  const result = sorted.map((el) => ({ ...el }))
  for (let i = 1; i < result.length; i++) {
    if (selected.has(result[i].id) && !selected.has(result[i - 1].id)) {
      const tmp = result[i]
      result[i] = result[i - 1]
      result[i - 1] = tmp
    }
  }
  return result.map((el, i) => ({ ...el, z: i + 1 }))
}

export function bringToFront(elements: WireElement[], ids: string[]): WireElement[] {
  const selected = new Set(ids)
  const others = elements.filter((e) => !selected.has(e.id)).sort((a, b) => a.z - b.z)
  const sel = elements.filter((e) => selected.has(e.id)).sort((a, b) => a.z - b.z)
  return [...others, ...sel].map((el, i) => ({ ...el, z: i + 1 }))
}

export function sendToBack(elements: WireElement[], ids: string[]): WireElement[] {
  const selected = new Set(ids)
  const others = elements.filter((e) => !selected.has(e.id)).sort((a, b) => a.z - b.z)
  const sel = elements.filter((e) => selected.has(e.id)).sort((a, b) => a.z - b.z)
  return [...sel, ...others].map((el, i) => ({ ...el, z: i + 1 }))
}

export function sharedGroupId(elements: WireElement[], ids: string[]): string | null {
  if (!ids.length) return null
  const members = ids.map((id) => elements.find((e) => e.id === id)).filter((m): m is WireElement => Boolean(m))
  if (!members.length) return null
  const gid = members[0].groupId
  if (!gid) return null
  if (!members.every((m) => m.groupId === gid)) return null
  const all = getGroupMembers(elements, gid)
  if (all.length !== members.length) return null
  return gid
}

/** Top-level layer units fully covered by ids (groups count as 1). */
export function countGroupableUnits(elements: WireElement[], ids: string[]): number {
  const expanded = expandSelectionForGroups(elements, ids, null)
  if (expanded.length < 2) return 0
  if (sharedGroupId(elements, expanded)) return 0

  const selected = new Set(expanded)
  const tree = buildLayerTree(elements)
  let units = 0
  for (const row of tree) {
    if (row.kind === 'group') {
      if (row.children.every((c) => selected.has(c.id))) units += 1
    } else if (selected.has(row.el.id)) {
      units += 1
    }
  }
  return units
}

export function canGroup(elements: WireElement[], ids: string[]): boolean {
  return countGroupableUnits(elements, ids) >= 2
}

/** Merge selected top-level units into one group (composed widgets stay groups until regrouped). */
export function groupElements(elements: WireElement[], ids: string[]): WireElement[] {
  const expanded = expandSelectionForGroups(elements, ids, null)
  if (expanded.length < 2) return elements
  if (sharedGroupId(elements, expanded)) return elements
  if (countGroupableUnits(elements, ids) < 2) return elements

  const newId = uid('grp')
  const newName = nextName('group')
  const selected = new Set(expanded)

  return elements.map((el) =>
    selected.has(el.id)
      ? {
          ...el,
          groupId: newId,
          groupName: newName,
          groupKind: 'group',
        }
      : el,
  )
}

export function renameGroup(elements: WireElement[], groupId: string, name: string): WireElement[] {
  return elements.map((el) =>
    el.groupId === groupId ? { ...el, groupName: name } : el,
  )
}

/** Clone selected elements with new ids/groups, offset by (dx, dy). */
export function duplicateElements(
  elements: WireElement[],
  ids: string[],
  dx = 16,
  dy = 16,
): { elements: WireElement[]; ids: string[] } {
  const selected = elements.filter((el) => ids.includes(el.id))
  if (!selected.length) return { elements: [], ids: [] }

  const groupMap = new Map<string, string>()
  let z = nextZ(elements)
  const created = selected.map((el) => {
    let groupId = el.groupId ?? null
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, uid('grp'))
      groupId = groupMap.get(groupId)!
    }
    const copy: WireElement = {
      ...el,
      id: uid(),
      x: el.x + dx,
      y: el.y + dy,
      z: z++,
      groupId,
    }
    return copy
  })

  return { elements: created, ids: created.map((el) => el.id) }
}
