import { useMemo, useRef, useState } from 'react'
import { COMPOSED_TYPES, ELEMENT_TYPES } from '../lib/constants'
import {
  buildLayerTree,
  canGroup,
  getPalettePreview,
  sharedGroupId,
} from '../lib/elements'
import { getBounds } from '../lib/geometry'
import ActionMenu from './ActionMenu'
import WireElement from './WireElement'

const PREVIEW_W = 72
const PREVIEW_H = 52

function PalettePreview({ type }) {
  const els = useMemo(() => getPalettePreview(type), [type])
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

function PaletteButton({ item, placeType, onPlaceType, onPaletteDragStart }) {
  const startRef = useRef(null)

  return (
    <button
      type="button"
      className={`palette-item${placeType === item.type ? ' is-active' : ''}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        window.getSelection()?.removeAllRanges()
        startRef.current = { x: e.clientX, y: e.clientY, type: item.type }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const start = startRef.current
        if (!start || start.dragged) return
        const dx = e.clientX - start.x
        const dy = e.clientY - start.y
        if (dx * dx + dy * dy < 36) return
        start.dragged = true
        onPlaceType(null)
        onPaletteDragStart(item.type, e.clientX, e.clientY)
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
        onPlaceType(placeType === item.type ? null : item.type)
      }}
      onPointerCancel={() => {
        startRef.current = null
      }}
    >
      <PalettePreview type={item.type} />
      <span>{item.label}</span>
    </button>
  )
}

export default function SidePanel({
  tab,
  onTab,
  placeType,
  onPlaceType,
  onPaletteDragStart,
  elements,
  selectedIds,
  onSelect,
  onReorderTree,
  dragId,
  onDragId,
  editingGroupId,
  onEditGroup,
  onGroup,
  onUngroup,
  onRenameGroup,
  canGroupSelection,
}) {
  const tree = buildLayerTree(elements)
  const [menu, setMenu] = useState(null)
  const [renamingGroupId, setRenamingGroupId] = useState(null)

  const selectedGroupId = sharedGroupId(elements, selectedIds)

  const onDragStart = (e, key) => {
    onDragId(key)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
  }

  const onDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const onDrop = (e, overKey) => {
    e.preventDefault()
    const fromKey = dragId || e.dataTransfer.getData('text/plain')
    if (!fromKey || fromKey === overKey) {
      onDragId(null)
      return
    }
    const keys = tree.map((row) =>
      row.kind === 'group' ? `group:${row.groupId}` : row.el.id,
    )
    const from = keys.indexOf(fromKey)
    const to = keys.indexOf(overKey)
    if (from < 0 || to < 0) {
      onDragId(null)
      return
    }
    keys.splice(from, 1)
    keys.splice(to, 0, fromKey)
    onReorderTree(keys)
    onDragId(null)
  }

  const selectGroup = (groupId, additive) => {
    const ids = elements.filter((el) => el.groupId === groupId).map((el) => el.id)
    if (additive) {
      onSelect([...new Set([...selectedIds, ...ids])])
    } else {
      onSelect(ids)
      onEditGroup(null)
    }
  }

  const openActions = (e, ensureIds) => {
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

  return (
    <aside className="side-panel">
      <div className="panel-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'elements'}
          className={tab === 'elements' ? 'is-active' : ''}
          onClick={() => onTab('elements')}
        >
          Elements
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'layers'}
          className={tab === 'layers' ? 'is-active' : ''}
          onClick={() => onTab('layers')}
        >
          Layers
        </button>
      </div>

      {tab === 'elements' && (
        <div className="panel-body">
          <p className="panel-hint">Click a shape, then click the artboard — or drag onto it.</p>
          <p className="palette-section-label">Atomic</p>
          <div className="palette-grid">
            {ELEMENT_TYPES.map((item) => (
              <PaletteButton
                key={item.type}
                item={item}
                placeType={placeType}
                onPlaceType={onPlaceType}
                onPaletteDragStart={onPaletteDragStart}
              />
            ))}
          </div>
          <p className="palette-section-label">Composed</p>
          <div className="palette-grid">
            {COMPOSED_TYPES.map((item) => (
              <PaletteButton
                key={item.type}
                item={item}
                placeType={placeType}
                onPlaceType={onPlaceType}
                onPaletteDragStart={onPaletteDragStart}
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'layers' && (
        <div className="panel-body">
          {tree.length === 0 && (
            <p className="panel-hint">No layers yet. Add elements from the Elements tab.</p>
          )}
          {editingGroupId && (
            <p className="panel-hint editing-banner">
              Editing group — double-click canvas empty or press Esc to exit.
            </p>
          )}
          {selectedIds.length >= 2 && (
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
                      className={`layer-row layer-row--group${selected ? ' is-selected' : ''}`}
                      draggable={!renaming}
                      onDragStart={(e) => onDragStart(e, key)}
                      onDragOver={onDragOver}
                      onDrop={(e) => onDrop(e, key)}
                      onDragEnd={() => onDragId(null)}
                      onClick={(e) => {
                        if (renaming) return
                        if (
                          selected &&
                          selectedIds.length >= 2 &&
                          !e.metaKey &&
                          !e.ctrlKey
                        ) {
                          openActions(e, childIds)
                          return
                        }
                        selectGroup(row.groupId, e.metaKey || e.ctrlKey)
                      }}
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
                          className={`layer-row layer-row--child${selectedIds.includes(el.id) ? ' is-selected' : ''}`}
                          onClick={(e) => {
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
                          }}
                          onContextMenu={(e) => {
                            e.stopPropagation()
                            const ids = selectedIds.includes(el.id) ? selectedIds : [el.id]
                            if (!selectedIds.includes(el.id)) onSelect([el.id])
                            openActions(e, ids)
                          }}
                        >
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
                  className={`layer-row${selected ? ' is-selected' : ''}`}
                  draggable
                  onDragStart={(e) => onDragStart(e, el.id)}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, el.id)}
                  onDragEnd={() => onDragId(null)}
                  onClick={(e) => {
                    if (selected && selectedIds.length >= 2 && !e.metaKey && !e.ctrlKey) {
                      openActions(e)
                      return
                    }
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
                  }}
                  onContextMenu={(e) => {
                    if (!selected) {
                      onSelect([el.id])
                      onEditGroup(null)
                    }
                    openActions(e, selected ? selectedIds : [el.id])
                  }}
                >
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
    </aside>
  )
}
