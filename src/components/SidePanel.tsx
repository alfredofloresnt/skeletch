import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { COMPOSED_TYPES, ELEMENT_TYPES, FRAME_PRESETS } from '../lib/constants'
import {
  buildLayerTree,
  canGroup,
  getPalettePreview,
  getPartsPreview,
  sharedGroupId,
} from '../lib/elements'
import { getBounds } from '../lib/geometry'
import type {
  Artboard,
  CustomComponentDef,
  DesignVariable,
  LayoutPart,
  PlaceTool,
  PlaceType,
  WireElement as WireElementModel,
} from '../lib/types'
import { isCustomPlace } from '../lib/types'
import {
  createVariable,
  nextVariableName,
  sanitizeColor,
} from '../lib/variables'
import ActionMenu from './ActionMenu'
import ColorPicker from './ColorPicker'
import Tooltip from './Tooltip'
import WireElement from './WireElement'

const PREVIEW_W = 72
const PREVIEW_H = 52

function PreviewStage({ els }: { els: WireElementModel[] }) {
  const bounds = useMemo(() => getBounds(els), [els])
  if (!bounds || bounds.w < 1 || bounds.h < 1) return null
  const scale = Math.min(PREVIEW_W / bounds.w, PREVIEW_H / bounds.h)
  return (
    <div className="palette-preview" aria-hidden>
      <div
        className="palette-preview-stage"
        style={{
          width: bounds.w,
          height: bounds.h,
          transform: `scale(${scale})`,
        }}
      >
        {els.map((el) => (
          <WireElement key={el.id} el={el} />
        ))}
      </div>
    </div>
  )
}

function PalettePreview({ type }: { type: PlaceType }) {
  const els = useMemo(() => getPalettePreview(type), [type])
  return <PreviewStage els={els} />
}

function PartsPreview({ parts, id }: { parts: LayoutPart[]; id: string }) {
  const els = useMemo(() => getPartsPreview(parts, `preview-${id}`), [parts, id])
  return <PreviewStage els={els} />
}

function toolsEqual(a: PlaceTool | null, b: PlaceTool): boolean {
  if (a == null) return false
  if (isCustomPlace(a) && isCustomPlace(b)) return a.customId === b.customId
  if (!isCustomPlace(a) && !isCustomPlace(b)) return a === b
  return false
}

type PaletteDragStart = { x: number; y: number; tool: PlaceTool; dragged?: boolean }

function PaletteButton({
  tool,
  label,
  placeTool,
  onPlaceTool,
  onPaletteDragStart,
  preview,
  trailing,
}: {
  tool: PlaceTool
  label: string
  placeTool: PlaceTool | null
  onPlaceTool: (tool: PlaceTool | null) => void
  onPaletteDragStart: (tool: PlaceTool, label: string, x: number, y: number) => void
  preview: ReactNode
  trailing?: ReactNode
}) {
  const startRef = useRef<PaletteDragStart | null>(null)
  const active = toolsEqual(placeTool, tool)

  return (
    <div className={`palette-item-row${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className={`palette-item${active ? ' is-active' : ''}`}
        onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
          if (e.button !== 0) return
          e.preventDefault()
          window.getSelection()?.removeAllRanges()
          startRef.current = { x: e.clientX, y: e.clientY, tool }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e: ReactPointerEvent<HTMLButtonElement>) => {
          const start = startRef.current
          if (!start || start.dragged) return
          const dx = e.clientX - start.x
          const dy = e.clientY - start.y
          if (dx * dx + dy * dy < 36) return
          start.dragged = true
          onPlaceTool(null)
          onPaletteDragStart(tool, label, e.clientX, e.clientY)
          try {
            e.currentTarget.releasePointerCapture(e.pointerId)
          } catch {
            /* already released */
          }
        }}
        onPointerUp={() => {
          const start = startRef.current
          startRef.current = null
          if (!start || start.dragged) return
          onPlaceTool(active ? null : tool)
        }}
        onPointerCancel={() => {
          startRef.current = null
        }}
      >
        {preview}
        <span>{label}</span>
      </button>
      {trailing}
    </div>
  )
}

function IconSelect() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6.5 4.5 L6.5 18.5 L10.5 14.5 L13 20 L15.5 19 L13 13.5 L18.5 13.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

function IconRect() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y="6" width="14" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconCircle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconTriangle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 5.5 L19.5 18.5 H4.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

function IconLine() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconText() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 7h10M12 7v11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
      />
    </svg>
  )
}

function IconComponents() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="4" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="13" y="4" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="4" y="13" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="13" y="13" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconDocument() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 3.5h7l4 4V20.5H7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="miter"
      />
      <path d="M14 3.5v4h4" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconArtboards() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y="4" width="11" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="9" y="7" width="11" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 4.5 L20 9 L12 13.5 L4 9 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="miter"
      />
      <path
        d="M4 12.5 L12 17 L20 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="miter"
      />
      <path
        d="M4 16 L12 20.5 L20 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

export type SideTab = 'components' | 'document' | 'artboards' | 'layers'

const SHAPE_ICONS: Record<string, () => ReactNode> = {
  rect: IconRect,
  circle: IconCircle,
  triangle: IconTriangle,
  line: IconLine,
  text: IconText,
}

const PANEL_META: Record<SideTab, { label: string; icon: () => ReactNode }> = {
  components: { label: 'Components', icon: IconComponents },
  document: { label: 'Document', icon: IconDocument },
  artboards: { label: 'Artboards', icon: IconArtboards },
  layers: { label: 'Layers', icon: IconLayers },
}
type DropHint = { key: string; edge: 'before' | 'after'; scope: string }
type ContextMenu = { x: number; y: number; ids: string[] }

type SidePanelProps = {
  tab: SideTab | null
  onTab: (tab: SideTab | null) => void
  placeTool: PlaceTool | null
  onPlaceTool: (tool: PlaceTool | null) => void
  onPaletteDragStart: (tool: PlaceTool, label: string, x: number, y: number) => void
  components: CustomComponentDef[]
  onRenameComponent: (id: string, name: string) => void
  onDeleteComponent: (id: string) => void
  onSaveAsComponent: () => void
  canSaveAsComponent: boolean
  variables: DesignVariable[]
  onAddVariable: (variable: DesignVariable) => void
  onUpdateVariable: (id: string, patch: { name?: string; value?: string | number }) => void
  onDeleteVariable: (id: string) => void
  artboards: Artboard[]
  activeArtboardId: string
  onSelectArtboard: (id: string) => void
  onAddArtboard: () => void
  onAddArtboardPreset: (presetId: string) => void
  onDuplicateArtboard: () => void
  onDeleteArtboard: () => void
  canDeleteArtboard: boolean
  elements: WireElementModel[]
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onReorderTree: (keys: string[]) => void
  onReorderGroupChildren?: (groupId: string, childIds: string[]) => void
  dragId: string | null
  onDragId: (id: string | null) => void
  editingGroupId: string | null
  onEditGroup: (groupId: string | null) => void
  onGroup?: (ids?: string[]) => void
  onUngroup?: (groupId: string) => void
  onRenameGroup?: (groupId: string, name: string) => void
  canGroupSelection?: boolean
}

export default function SidePanel({
  tab,
  onTab,
  placeTool,
  onPlaceTool,
  onPaletteDragStart,
  components,
  onRenameComponent,
  onDeleteComponent,
  onSaveAsComponent,
  canSaveAsComponent,
  variables,
  onAddVariable,
  onUpdateVariable,
  onDeleteVariable,
  artboards,
  activeArtboardId,
  onSelectArtboard,
  onAddArtboard,
  onAddArtboardPreset,
  onDuplicateArtboard,
  onDeleteArtboard,
  canDeleteArtboard,
  elements,
  selectedIds,
  onSelect,
  onReorderTree,
  onReorderGroupChildren,
  dragId,
  onDragId,
  editingGroupId,
  onEditGroup,
  onGroup,
  onUngroup,
  onRenameGroup,
  canGroupSelection,
}: SidePanelProps) {
  const tree = buildLayerTree(elements)
  const [menu, setMenu] = useState<ContextMenu | null>(null)
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)
  const dragScopeRef = useRef<string>('tree')
  const didDragRef = useRef(false)

  const selectedGroupId = sharedGroupId(elements, selectedIds)

  const topKeys = tree.map((row) =>
    row.kind === 'group' ? `group:${row.groupId}` : row.el.id,
  )

  const moveKey = (
    keys: string[],
    fromKey: string,
    overKey: string,
    edge: 'before' | 'after',
  ): string[] | null => {
    if (!fromKey || !overKey || fromKey === overKey) return null
    const next = [...keys]
    const from = next.indexOf(fromKey)
    if (from < 0) return null
    next.splice(from, 1)
    let to = next.indexOf(overKey)
    if (to < 0) return null
    if (edge === 'after') to += 1
    next.splice(to, 0, fromKey)
    return next
  }

  const edgeFromEvent = (e: { currentTarget: HTMLElement; clientY: number }): 'before' | 'after' => {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  const onDragStart = (e: DragEvent, key: string, scope = 'tree') => {
    didDragRef.current = true
    dragScopeRef.current = scope
    onDragId(key)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
  }

  const onDragEnd = () => {
    onDragId(null)
    setDropHint(null)
    dragScopeRef.current = 'tree'
    window.setTimeout(() => {
      didDragRef.current = false
    }, 0)
  }

  const onDragOverRow = (e: DragEvent<HTMLElement>, key: string, scope = 'tree') => {
    e.preventDefault()
    e.stopPropagation()
    if (dragScopeRef.current !== scope) {
      setDropHint(null)
      return
    }
    const fromKey = dragId
    if (!fromKey || fromKey === key) {
      setDropHint(null)
      return
    }
    e.dataTransfer.dropEffect = 'move'
    const edge = edgeFromEvent(e)
    setDropHint((prev) =>
      prev?.key === key && prev?.scope === scope && prev?.edge === edge
        ? prev
        : { key, edge, scope },
    )
  }

  const onDropRow = (e: DragEvent<HTMLElement>, overKey: string, scope = 'tree') => {
    e.preventDefault()
    e.stopPropagation()
    const fromKey = dragId || e.dataTransfer.getData('text/plain')
    const edge = dropHint?.key === overKey ? dropHint.edge : edgeFromEvent(e)
    const dragScope = dragScopeRef.current
    setDropHint(null)
    onDragId(null)
    if (!fromKey || fromKey === overKey || dragScope !== scope) return

    if (scope === 'tree') {
      if (!topKeys.includes(fromKey) || !topKeys.includes(overKey)) return
      const next = moveKey(topKeys, fromKey, overKey, edge)
      if (next) onReorderTree(next)
      return
    }

    const groupRow = tree.find((r) => r.kind === 'group' && r.groupId === scope)
    if (!groupRow || groupRow.kind !== 'group') return
    const childIds = groupRow.children.map((c) => c.id)
    if (!childIds.includes(fromKey) || !childIds.includes(overKey)) return
    const next = moveKey(childIds, fromKey, overKey, edge)
    if (next) onReorderGroupChildren?.(scope, next)
  }

  const dropClass = (key: string, scope = 'tree') => {
    if (!dropHint || dropHint.key !== key || dropHint.scope !== scope) return ''
    return dropHint.edge === 'before' ? ' drop-before' : ' drop-after'
  }

  const DropLine = ({ rowKey, scope = 'tree' }: { rowKey: string; scope?: string }) => {
    if (!dropHint || dropHint.key !== rowKey || dropHint.scope !== scope) return null
    return (
      <div
        className={`layer-drop-line layer-drop-line--${dropHint.edge}`}
        aria-hidden
      />
    )
  }

  const guardClick =
    (handler: (e: MouseEvent) => void) => (e: MouseEvent) => {
      if (didDragRef.current) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      handler(e)
    }

  const selectGroup = (groupId: string, additive: boolean) => {
    const ids = elements.filter((el) => el.groupId === groupId).map((el) => el.id)
    if (additive) {
      onSelect([...new Set([...selectedIds, ...ids])])
    } else {
      onSelect(ids)
      onEditGroup(null)
    }
  }

  const openActions = (e: MouseEvent, ensureIds?: string[]) => {
    e.preventDefault()
    e.stopPropagation()
    let ids = selectedIds
    if (ensureIds?.length) {
      const allIn = ensureIds.every((id) => selectedIds.includes(id))
      if (!allIn) {
        onSelect(ensureIds)
        ids = ensureIds
      }
    }
    setMenu({ x: e.clientX, y: e.clientY, ids })
  }

  const menuIds = menu?.ids || selectedIds
  const menuGroupId = sharedGroupId(elements, menuIds)
  const menuItems = [
    {
      id: 'group',
      label: 'Group',
      disabled: !canGroup(elements, menuIds),
      onSelect: () => onGroup?.(menuIds),
    },
    {
      id: 'ungroup',
      label: 'Ungroup',
      disabled: !menuGroupId,
      onSelect: () => menuGroupId && onUngroup?.(menuGroupId),
    },
    {
      id: 'rename',
      label: 'Rename group',
      disabled: !menuGroupId,
      onSelect: () => menuGroupId && setRenamingGroupId(menuGroupId),
    },
  ]

  const togglePanel = (next: SideTab) => {
    onTab(tab === next ? null : next)
  }

  const selectShapeTool = (tool: PlaceType) => {
    const active = toolsEqual(placeTool, tool)
    onPlaceTool(active ? null : tool)
  }

  const selectActive = placeTool == null
  const drawerTitle = tab ? PANEL_META[tab].label : ''

  return (
    <aside className={`side-panel${tab ? ' has-drawer' : ''}`}>
      <div className="tool-rail" role="toolbar" aria-label="Tools">
        <div className="tool-rail-group">
          <Tooltip label="Select">
            <button
              type="button"
              className={`tool-rail-btn${selectActive ? ' is-active' : ''}`}
              aria-label="Select"
              aria-pressed={selectActive}
              onClick={() => onPlaceTool(null)}
            >
              <IconSelect />
            </button>
          </Tooltip>
          {ELEMENT_TYPES.map((item) => {
            const Icon = SHAPE_ICONS[item.type]
            const active = toolsEqual(placeTool, item.type)
            return (
              <Tooltip key={item.type} label={item.label}>
                <button
                  type="button"
                  className={`tool-rail-btn${active ? ' is-active' : ''}`}
                  aria-label={item.label}
                  aria-pressed={active}
                  onClick={() => selectShapeTool(item.type)}
                >
                  {Icon ? <Icon /> : null}
                </button>
              </Tooltip>
            )
          })}
        </div>

        <div className="tool-rail-group">
          {(Object.keys(PANEL_META) as SideTab[]).map((key) => {
            const meta = PANEL_META[key]
            const Icon = meta.icon
            const active = tab === key
            return (
              <Tooltip key={key} label={meta.label}>
                <button
                  type="button"
                  className={`tool-rail-btn${active ? ' is-active' : ''}`}
                  aria-label={meta.label}
                  aria-pressed={active}
                  onClick={() => togglePanel(key)}
                >
                  <Icon />
                </button>
              </Tooltip>
            )
          })}
        </div>
      </div>

      {tab && (
        <div className="side-drawer">
          <div className="side-drawer-header">
            <h2 className="side-drawer-title">{drawerTitle}</h2>
          </div>

          {tab === 'components' && (
            <div className="panel-body">
              <p className="panel-hint">Click or drag onto the artboard.</p>
              <p className="palette-section-label">Built-in</p>
              <div className="palette-grid">
                {COMPOSED_TYPES.map((item) => (
                  <PaletteButton
                    key={item.type}
                    tool={item.type}
                    label={item.label}
                    placeTool={placeTool}
                    onPlaceTool={onPlaceTool}
                    onPaletteDragStart={onPaletteDragStart}
                    preview={<PalettePreview type={item.type} />}
                  />
                ))}
              </div>
              <div className="palette-section-header document-section">
                <p className="palette-section-label">Custom</p>
                <div className="layers-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={!canSaveAsComponent}
                    onClick={onSaveAsComponent}
                  >
                    Save selection
                  </button>
                </div>
              </div>
              {!components.length ? (
                <p className="panel-hint">No custom components yet.</p>
              ) : (
                <div className="palette-grid">
                  {components.map((cmp) => (
                    <PaletteButton
                      key={cmp.id}
                      tool={{ customId: cmp.id }}
                      label={cmp.name}
                      placeTool={placeTool}
                      onPlaceTool={onPlaceTool}
                      onPaletteDragStart={onPaletteDragStart}
                      preview={<PartsPreview parts={cmp.parts} id={cmp.id} />}
                      trailing={
                        <div className="custom-item-actions">
                          <button
                            type="button"
                            className="btn-ghost custom-item-btn"
                            title="Rename"
                            onClick={() => {
                              const next = window.prompt('Rename component', cmp.name)
                              if (next == null) return
                              onRenameComponent(cmp.id, next)
                            }}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="btn-ghost custom-item-btn"
                            title="Delete"
                            onClick={() => {
                              if (window.confirm(`Delete “${cmp.name}”?`)) {
                                onDeleteComponent(cmp.id)
                              }
                            }}
                          >
                            ×
                          </button>
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'document' && (
            <div className="panel-body">
              <div className="palette-section-header">
                <p className="palette-section-label">Variables</p>
                <div className="layers-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      const name = window.prompt(
                        'Color variable name',
                        nextVariableName(variables, 'color'),
                      )
                      if (name == null) return
                      onAddVariable(createVariable('color', name, '#1a1a1a'))
                    }}
                  >
                    + Color
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      const name = window.prompt(
                        'Number variable name',
                        nextVariableName(variables, 'number'),
                      )
                      if (name == null) return
                      onAddVariable(createVariable('number', name, 16))
                    }}
                  >
                    + Number
                  </button>
                </div>
              </div>
              <p className="panel-hint">
                Bind colors to Fill and numbers to font size / corner radius.
              </p>
              {!variables.length ? (
                <p className="panel-hint">No variables yet.</p>
              ) : (
                <ul className="var-list">
                  {variables.map((v) => (
                    <li key={v.id} className="var-row">
                      <span className="var-row-type">{v.type}</span>
                      <input
                        className="var-row-name"
                        value={v.name}
                        aria-label="Variable name"
                        onChange={(e) => onUpdateVariable(v.id, { name: e.target.value })}
                      />
                      {v.type === 'color' ? (
                        <ColorPicker
                          value={sanitizeColor(String(v.value))}
                          allowTransparent={false}
                          showVariables={false}
                          label={`Value of ${v.name}`}
                          onChange={(color) => onUpdateVariable(v.id, { value: color })}
                        />
                      ) : (
                        <input
                          type="number"
                          className="var-row-number"
                          value={Number(v.value)}
                          aria-label={`Value of ${v.name}`}
                          onChange={(e) =>
                            onUpdateVariable(v.id, { value: Number(e.target.value) })
                          }
                        />
                      )}
                      <button
                        type="button"
                        className="btn-ghost var-row-delete"
                        title="Delete variable"
                        onClick={() => {
                          if (window.confirm(`Delete $${v.name}?`)) onDeleteVariable(v.id)
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'artboards' && (
            <div className="panel-body">
              <p className="palette-section-label">Create</p>
              <div className="artboard-preset-grid">
                {FRAME_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn-ghost artboard-preset-btn"
                    onClick={() => onAddArtboardPreset(p.id)}
                  >
                    <span className="artboard-preset-name">{p.label}</span>
                    <span className="artboard-preset-size">
                      {p.width}×{p.height}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="btn-ghost artboard-preset-btn"
                  onClick={onAddArtboard}
                >
                  <span className="artboard-preset-name">Same as active</span>
                  <span className="artboard-preset-size">Copy size</span>
                </button>
              </div>

              <div className="palette-section-header document-section">
                <p className="palette-section-label">Boards</p>
                <div className="layers-actions">
                  <button type="button" className="btn-ghost" onClick={onDuplicateArtboard}>
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={!canDeleteArtboard}
                    onClick={onDeleteArtboard}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <ul className="layer-list">
                {artboards.map((ab) => (
                  <li
                    key={ab.id}
                    className={`layer-row${ab.id === activeArtboardId ? ' is-selected' : ''}`}
                    onClick={() => onSelectArtboard(ab.id)}
                  >
                    <span className="layer-type">{ab.presetId}</span>
                    <span className="layer-name">{ab.name}</span>
                    <span className="layer-z">
                      {ab.width}×{ab.height}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'layers' && (
            <div className="panel-body">
              {tree.length === 0 && (
                <p className="panel-hint">No layers yet. Place shapes from the tool rail.</p>
              )}
              {editingGroupId && (
                <p className="panel-hint editing-banner">
                  Editing group — double-click canvas empty or press Esc to exit.
                </p>
              )}
              {selectedIds.length >= 1 && (
                <div className="layers-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={!canGroupSelection}
                    onClick={() => onGroup?.()}
                  >
                    Group
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={!selectedGroupId}
                    onClick={() => selectedGroupId && onUngroup?.(selectedGroupId)}
                  >
                    Ungroup
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={!canSaveAsComponent}
                    onClick={onSaveAsComponent}
                  >
                    Save as component
                  </button>
                </div>
              )}
              <ul className="layer-list">
                {tree.map((row) => {
                  if (row.kind === 'group') {
                    const key = `group:${row.groupId}`
                    const childIds = row.children.map((c) => c.id)
                    const selected =
                      childIds.length > 0 && childIds.every((id) => selectedIds.includes(id))
                    const open = editingGroupId === row.groupId
                    const renaming = renamingGroupId === row.groupId
                    return (
                      <li key={key} className="layer-group-block">
                        <div
                          className={`layer-row layer-row--group${selected ? ' is-selected' : ''}${dragId === key ? ' is-dragging' : ''}${dropClass(key, 'tree')}`}
                          draggable={!renaming}
                          onDragStart={(e) => onDragStart(e, key, 'tree')}
                          onDragOver={(e) => onDragOverRow(e, key, 'tree')}
                          onDrop={(e) => onDropRow(e, key, 'tree')}
                          onDragEnd={onDragEnd}
                          onClick={guardClick((e) => {
                            if (renaming) return
                            selectGroup(row.groupId, e.metaKey || e.ctrlKey)
                          })}
                          onContextMenu={(e) => {
                            if (!selected) selectGroup(row.groupId, false)
                            openActions(e, childIds)
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            if (e.altKey) {
                              setRenamingGroupId(row.groupId)
                              return
                            }
                            onEditGroup(row.groupId)
                            onSelect(childIds.slice(0, 1))
                          }}
                        >
                          <DropLine rowKey={key} scope="tree" />
                          <span className="layer-type">{row.groupKind}</span>
                          {renaming ? (
                            <input
                              className="layer-rename"
                              autoFocus
                              defaultValue={row.name}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                const next = e.target.value.trim() || 'Group'
                                onRenameGroup?.(row.groupId, next)
                                setRenamingGroupId(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                                if (e.key === 'Escape') setRenamingGroupId(null)
                              }}
                            />
                          ) : (
                            <span className="layer-name">{row.name}</span>
                          )}
                          <span className="layer-z">{row.children.length}</span>
                        </div>
                        {open &&
                          row.children.map((el) => (
                            <div
                              key={el.id}
                              className={`layer-row layer-row--child${selectedIds.includes(el.id) ? ' is-selected' : ''}${dragId === el.id ? ' is-dragging' : ''}${dropClass(el.id, row.groupId)}`}
                              draggable
                              onDragStart={(e) => onDragStart(e, el.id, row.groupId)}
                              onDragOver={(e) => onDragOverRow(e, el.id, row.groupId)}
                              onDrop={(e) => onDropRow(e, el.id, row.groupId)}
                              onDragEnd={onDragEnd}
                              onClick={guardClick((e) => {
                                e.stopPropagation()
                                if (e.metaKey || e.ctrlKey) {
                                  onSelect(
                                    selectedIds.includes(el.id)
                                      ? selectedIds.filter((id) => id !== el.id)
                                      : [...selectedIds, el.id],
                                  )
                                } else {
                                  onSelect([el.id])
                                }
                              })}
                              onContextMenu={(e) => {
                                e.stopPropagation()
                                const ids = selectedIds.includes(el.id) ? selectedIds : [el.id]
                                if (!selectedIds.includes(el.id)) onSelect([el.id])
                                openActions(e, ids)
                              }}
                            >
                              <DropLine rowKey={el.id} scope={row.groupId} />
                              <span className="layer-type">{el.type}</span>
                              <span className="layer-name">{el.name}</span>
                              <span className="layer-z">z {el.z}</span>
                            </div>
                          ))}
                      </li>
                    )
                  }

                  const el = row.el
                  const selected = selectedIds.includes(el.id)
                  return (
                    <li
                      key={el.id}
                      className={`layer-row${selected ? ' is-selected' : ''}${dragId === el.id ? ' is-dragging' : ''}${dropClass(el.id, 'tree')}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, el.id, 'tree')}
                      onDragOver={(e) => onDragOverRow(e, el.id, 'tree')}
                      onDrop={(e) => onDropRow(e, el.id, 'tree')}
                      onDragEnd={onDragEnd}
                      onClick={guardClick((e) => {
                        if (e.metaKey || e.ctrlKey) {
                          onSelect(
                            selected
                              ? selectedIds.filter((id) => id !== el.id)
                              : [...selectedIds, el.id],
                          )
                        } else {
                          onSelect([el.id])
                          onEditGroup(null)
                        }
                      })}
                      onContextMenu={(e) => {
                        if (!selected) {
                          onSelect([el.id])
                          onEditGroup(null)
                        }
                        openActions(e, selected ? selectedIds : [el.id])
                      }}
                    >
                      <DropLine rowKey={el.id} scope="tree" />
                      <span className="layer-type">{el.type}</span>
                      <span className="layer-name">{el.name}</span>
                      <span className="layer-z">z {el.z}</span>
                    </li>
                  )
                })}
              </ul>
              {menu && (
                <ActionMenu
                  x={menu.x}
                  y={menu.y}
                  items={menuItems}
                  onClose={() => setMenu(null)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
