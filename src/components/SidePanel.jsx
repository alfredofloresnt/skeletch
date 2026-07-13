import { useRef } from 'react'
import { COMPOSED_TYPES, ELEMENT_TYPES } from '../lib/constants'
import { buildLayerTree } from '../lib/elements'

function PaletteIcon({ icon }) {
  switch (icon) {
    case 'rect':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'circle':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'line':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <line x1="5" y1="19" x2="19" y2="5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'text':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 7h12M12 7v10M9 17h6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'image':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="5" width="16" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="4" y1="5" x2="20" y2="19" stroke="currentColor" strokeWidth="1.5" />
          <line x1="20" y1="5" x2="4" y2="19" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'input':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="8" width="18" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="6" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'button':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="8" width="16" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'checkbox':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="4" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 8l1.5 1.5L11 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <line x1="14" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'dropdown':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="7" width="18" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15 10l2 2 2-2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'card':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="3" width="16" height="18" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="6" y="5" width="12" height="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="6" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1.2" />
          <line x1="6" y1="17" x2="13" y2="17" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )
    case 'grid':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="3" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="13" y="3" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="3" y="13" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="13" y="13" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    default:
      return null
  }
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
      <PaletteIcon icon={item.icon} />
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
}) {
  const tree = buildLayerTree(elements)

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
          <ul className="layer-list">
            {tree.map((row) => {
              if (row.kind === 'group') {
                const key = `group:${row.groupId}`
                const childIds = row.children.map((c) => c.id)
                const selected =
                  childIds.length > 0 && childIds.every((id) => selectedIds.includes(id))
                const open = editingGroupId === row.groupId
                return (
                  <li key={key} className="layer-group-block">
                    <div
                      className={`layer-row layer-row--group${selected ? ' is-selected' : ''}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, key)}
                      onDragOver={onDragOver}
                      onDrop={(e) => onDrop(e, key)}
                      onDragEnd={() => onDragId(null)}
                      onClick={(e) => selectGroup(row.groupId, e.metaKey || e.ctrlKey)}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        onEditGroup(row.groupId)
                        onSelect(childIds.slice(0, 1))
                      }}
                    >
                      <span className="layer-type">{row.groupKind}</span>
                      <span className="layer-name">{row.name}</span>
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
              return (
                <li
                  key={el.id}
                  className={`layer-row${selectedIds.includes(el.id) ? ' is-selected' : ''}`}
                  draggable
                  onDragStart={(e) => onDragStart(e, el.id)}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, el.id)}
                  onDragEnd={() => onDragId(null)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) {
                      onSelect(
                        selectedIds.includes(el.id)
                          ? selectedIds.filter((id) => id !== el.id)
                          : [...selectedIds, el.id],
                      )
                    } else {
                      onSelect([el.id])
                      onEditGroup(null)
                    }
                  }}
                >
                  <span className="layer-type">{el.type}</span>
                  <span className="layer-name">{el.name}</span>
                  <span className="layer-z">z {el.z}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </aside>
  )
}
