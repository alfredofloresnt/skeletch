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
  onReorderGroupChildren,
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
  const [dropHint, setDropHint] = useState(null) // { key, edge: 'before' | 'after', scope: 'tree' | groupId }
  const dragScopeRef = useRef('tree')
  const didDragRef = useRef(false)

  const selectedGroupId = sharedGroupId(elements, selectedIds)

  const topKeys = tree.map((row) =>
    row.kind === 'group' ? `group:${row.groupId}` : row.el.id,
  )

  const moveKey = (keys, fromKey, overKey, edge) => {
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

  const edgeFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  const onDragStart = (e, key, scope = 'tree') => {
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

  const onDragOverRow = (e, key, scope = 'tree') => {
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

  const onDropRow = (e, overKey, scope = 'tree') => {
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
    if (!groupRow) return
    const childIds = groupRow.children.map((c) => c.id)
    if (!childIds.includes(fromKey) || !childIds.includes(overKey)) return
    const next = moveKey(childIds, fromKey, overKey, edge)
    if (next) onReorderGroupChildren?.(scope, next)
  }

  const dropClass = (key, scope = 'tree') => {
    if (!dropHint || dropHint.key !== key || dropHint.scope !== scope) return ''
    return dropHint.edge === 'before' ? ' drop-before' : ' drop-after'
  }

  const DropLine = ({ rowKey, scope = 'tree' }) => {
    if (!dropHint || dropHint.key !== rowKey || dropHint.scope !== scope) return null
    return (
      <div
        className={`layer-drop-line layer-drop-line--${dropHint.edge}`}
        aria-hidden
      />
    )
  }

  const guardClick = (handler) => (e) => {
    if (didDragRef.current) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    handler(e)
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
    </aside>
  )
}
