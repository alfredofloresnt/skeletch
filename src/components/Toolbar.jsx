import { useRef } from 'react'
import { FRAME_PRESETS } from '../lib/constants'

export default function Toolbar({
  artboard,
  presetId,
  zoom,
  snapOn,
  onPreset,
  onSizeChange,
  onZoomChange,
  onToggleSnap,
  onExport,
  onFit,
  onSave,
  onOpen,
}) {
  const fileRef = useRef(null)

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">Wireframe</span>
      </div>

      <div className="toolbar-group">
        <label className="field-label">Frame</label>
        <select
          className="toolbar-select"
          value={presetId}
          onChange={(e) => onPreset(e.target.value)}
        >
          {FRAME_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
        <input
          className="toolbar-num"
          type="number"
          min={100}
          max={4000}
          value={artboard.width}
          onChange={(e) => onSizeChange({ width: Number(e.target.value) || 100 })}
          aria-label="Artboard width"
        />
        <span className="toolbar-x">×</span>
        <input
          className="toolbar-num"
          type="number"
          min={100}
          max={4000}
          value={artboard.height}
          onChange={(e) => onSizeChange({ height: Number(e.target.value) || 100 })}
          aria-label="Artboard height"
        />
      </div>

      <div className="toolbar-group">
        <button type="button" className="btn-ghost" onClick={() => onZoomChange(zoom / 1.1)}>
          −
        </button>
        <button type="button" className="btn-ghost zoom-readout" onClick={onFit}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className="btn-ghost" onClick={() => onZoomChange(zoom * 1.1)}>
          +
        </button>
        <button
          type="button"
          className={`btn-toggle${snapOn ? ' is-on' : ''}`}
          onClick={onToggleSnap}
        >
          Snap {snapOn ? 'on' : 'off'}
        </button>
      </div>

      <div className="toolbar-actions">
        <input
          ref={fileRef}
          type="file"
          accept=".wireframe,application/json,application/x-wireframe+json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onOpen(file)
            e.target.value = ''
          }}
        />
        <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
          Open
        </button>
        <button type="button" className="btn-ghost" onClick={onSave}>
          Save
        </button>
        <button type="button" className="btn-primary" onClick={onExport}>
          Export PNG
        </button>
      </div>
    </header>
  )
}
