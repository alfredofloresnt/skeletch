import { sharedGroupId } from '../lib/elements'

export default function Inspector({
  elements,
  selectedIds,
  onUpdate,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onDelete,
  onUngroup,
  editingGroupId,
  onEditGroup,
}) {
  const selected = elements.filter((e) => selectedIds.includes(e.id))
  const groupId = sharedGroupId(elements, selectedIds)
  const groupMeta = groupId
    ? elements.find((e) => e.groupId === groupId)
    : null

  if (selected.length === 0) {
    return (
      <aside className="inspector">
        <h2 className="inspector-title">Inspector</h2>
        <p className="panel-hint">Select an element to edit its properties.</p>
      </aside>
    )
  }

  if (selected.length > 1) {
    return (
      <aside className="inspector">
        <h2 className="inspector-title">Inspector</h2>
        <p className="inspector-count">
          {groupId
            ? `${groupMeta.groupName || 'Group'} · ${selected.length} atoms`
            : `${selected.length} selected`}
        </p>
        {groupId && (
          <div className="inspector-section">
            <label className="field-label">Group</label>
            <p className="panel-hint" style={{ marginBottom: '0.5rem' }}>
              Double-click to edit atoms. Ungroup to detach.
            </p>
            <div className="btn-row">
              <button type="button" className="btn-ghost" onClick={() => onEditGroup(groupId)}>
                Edit atoms
              </button>
              <button type="button" className="btn-ghost" onClick={() => onUngroup(groupId)}>
                Ungroup
              </button>
            </div>
          </div>
        )}
        <div className="inspector-section">
          <label className="field-label">Layer</label>
          <div className="btn-row">
            <button type="button" className="btn-ghost" onClick={onBringToFront}>
              Front
            </button>
            <button type="button" className="btn-ghost" onClick={onBringForward}>
              Forward
            </button>
            <button type="button" className="btn-ghost" onClick={onSendBackward}>
              Back
            </button>
            <button type="button" className="btn-ghost" onClick={onSendToBack}>
              Bottom
            </button>
          </div>
        </div>
        <button type="button" className="btn-danger" onClick={onDelete}>
          Delete
        </button>
      </aside>
    )
  }

  const el = selected[0]
  const set = (patch) => onUpdate(el.id, patch)

  return (
    <aside className="inspector">
      <h2 className="inspector-title">Inspector</h2>
      <p className="inspector-meta">
        {el.name} · {el.type}
        {el.groupName ? ` · ${el.groupName}` : ''}
      </p>

      {el.groupId && (
        <div className="inspector-section">
          <label className="field-label">Group</label>
          {editingGroupId === el.groupId ? (
            <button type="button" className="btn-ghost" onClick={() => onEditGroup(null)}>
              Done editing
            </button>
          ) : (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onEditGroup(el.groupId)}
            >
              Edit atoms
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            style={{ marginTop: '0.35rem' }}
            onClick={() => onUngroup(el.groupId)}
          >
            Ungroup
          </button>
        </div>
      )}

      <div className="inspector-section">
        <label className="field-label">Position</label>
        <div className="field-row">
          <label>
            X
            <input
              type="number"
              value={Math.round(el.x)}
              onChange={(e) => set({ x: Number(e.target.value) })}
            />
          </label>
          <label>
            Y
            <input
              type="number"
              value={Math.round(el.y)}
              onChange={(e) => set({ y: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="field-row">
          <label>
            W
            <input
              type="number"
              min={1}
              value={Math.round(el.w)}
              onChange={(e) => set({ w: Number(e.target.value) })}
            />
          </label>
          <label>
            H
            <input
              type="number"
              value={Math.round(el.h)}
              onChange={(e) => set({ h: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className="inspector-section">
        <label className="field-label">Layer depth</label>
        <input
          type="number"
          value={el.z}
          onChange={(e) => set({ z: Number(e.target.value) })}
        />
        <div className="btn-row">
          <button type="button" className="btn-ghost" onClick={onBringToFront}>
            Front
          </button>
          <button type="button" className="btn-ghost" onClick={onBringForward}>
            Forward
          </button>
          <button type="button" className="btn-ghost" onClick={onSendBackward}>
            Back
          </button>
          <button type="button" className="btn-ghost" onClick={onSendToBack}>
            Bottom
          </button>
        </div>
      </div>

      {el.type === 'text' && (
        <div className="inspector-section">
          <label className="field-label">Text</label>
          <textarea
            rows={3}
            value={el.text || ''}
            onChange={(e) => set({ text: e.target.value })}
          />
          <label className="field-label">Font size</label>
          <input
            type="number"
            min={8}
            max={200}
            value={el.fontSize || 16}
            onChange={(e) => set({ fontSize: Number(e.target.value) })}
          />
          <label className="field-label">Align</label>
          <div className="btn-row">
            {['left', 'middle', 'right'].map((align) => (
              <button
                key={align}
                type="button"
                className={`btn-ghost${(el.textAlign || 'left') === align ? ' is-active' : ''}`}
                onClick={() => set({ textAlign: align })}
              >
                {align}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="inspector-section">
        <label className="field-label">Appearance</label>
        {el.type !== 'line' && el.type !== 'text' && (
          <>
            <label className="field-inline">
              Fill
              <input
                type="color"
                value={el.fill === 'transparent' ? '#ffffff' : el.fill}
                onChange={(e) => set({ fill: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => set({ fill: 'transparent' })}
            >
              Clear fill
            </button>
          </>
        )}
        {el.type === 'text' && (
          <label className="field-inline">
            Color
            <input
              type="color"
              value={el.fill || '#1a1a1a'}
              onChange={(e) => set({ fill: e.target.value })}
            />
          </label>
        )}
        {el.type !== 'text' && (
          <>
            <label className="field-inline">
              Stroke
              <input
                type="color"
                value={el.stroke || '#1a1a1a'}
                onChange={(e) => set({ stroke: e.target.value })}
              />
            </label>
            <label className="field-label">Stroke width</label>
            <input
              type="number"
              min={0}
              max={40}
              value={el.strokeWidth ?? 2}
              onChange={(e) => set({ strokeWidth: Number(e.target.value) })}
            />
          </>
        )}
        {(el.type === 'rect' || el.type === 'image') && (
          <>
            <label className="field-label">Corner radius</label>
            <input
              type="number"
              min={0}
              max={200}
              value={el.cornerRadius || 0}
              onChange={(e) => set({ cornerRadius: Number(e.target.value) })}
            />
          </>
        )}
        <label className="field-label">Opacity</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={el.opacity ?? 1}
          onChange={(e) => set({ opacity: Number(e.target.value) })}
        />
      </div>

      <button type="button" className="btn-danger" onClick={onDelete}>
        Delete
      </button>
    </aside>
  )
}
