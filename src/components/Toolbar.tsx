import { useEffect, useRef, useState } from 'react'
import { buildAgentPrompt, copyText, type AgentPromptMode } from '../lib/agentPrompt'
import { FRAME_PRESETS } from '../lib/constants'
import type { Artboard } from '../lib/types'
import ActionMenu from './ActionMenu'
import NumberInput from './NumberInput'
import Tooltip from './Tooltip'

type ToolbarProps = {
  artboard: Artboard
  zoom: number
  snapOn: boolean
  canDeleteArtboard: boolean
  onPreset: (id: string) => void
  onSizeChange: (patch: Partial<Pick<Artboard, 'width' | 'height'>>) => void
  onZoomChange: (zoom: number) => void
  onToggleSnap: () => void
  onAddArtboard: () => void
  onDuplicateArtboard: () => void
  onDeleteArtboard: () => void
  selectedExportCount: number
  totalExportCount: number
  onExportSelected: () => void
  onExportAll: () => void
  onFit: () => void
  onSave: () => void
  onOpen: (file: File) => void
  onUndo: () => void
  canUndo: boolean
}

export default function Toolbar({
  artboard,
  zoom,
  snapOn,
  canDeleteArtboard,
  onPreset,
  onSizeChange,
  onZoomChange,
  onToggleSnap,
  onAddArtboard,
  onDuplicateArtboard,
  onDeleteArtboard,
  selectedExportCount,
  totalExportCount,
  onExportSelected,
  onExportAll,
  onFit,
  onSave,
  onOpen,
  onUndo,
  canUndo,
}: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const promptBtnRef = useRef<HTMLButtonElement>(null)
  const [promptMenu, setPromptMenu] = useState<{ x: number; y: number } | null>(null)
  const [promptStatus, setPromptStatus] = useState<'copied' | 'failed' | null>(null)
  const exportBtnRef = useRef<HTMLButtonElement>(null)
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!promptStatus) return
    const timer = window.setTimeout(() => setPromptStatus(null), 1800)
    return () => window.clearTimeout(timer)
  }, [promptStatus])

  const copyPrompt = (mode: AgentPromptMode) => {
    copyText(buildAgentPrompt(mode)).then(
      () => setPromptStatus('copied'),
      () => setPromptStatus('failed'),
    )
  }

  const togglePromptMenu = () => {
    if (promptMenu) {
      setPromptMenu(null)
      return
    }
    const rect = promptBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    setPromptMenu({ x: rect.left, y: rect.bottom + 4 })
  }

  const toggleExportMenu = () => {
    if (exportMenu) {
      setExportMenu(null)
      return
    }
    const rect = exportBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    setExportMenu({ x: rect.left, y: rect.bottom + 4 })
  }

  const exportFormat = (count: number) => (count > 1 ? `ZIP of ${count} PNGs` : 'PNG')

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">Skeletch</span>
      </div>

      <span className="toolbar-divider" aria-hidden />

      <div className="toolbar-group">
        <div className="tb-select-wrap">
          <select
            className="toolbar-select"
            value={artboard.presetId}
            onChange={(e) => onPreset(e.target.value)}
            aria-label="Frame preset"
          >
            {FRAME_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
          <Icon name="chevron" className="tb-select-chevron" />
        </div>
        <label className="tb-dim">
          <span className="tb-dim-prefix">W</span>
          <NumberInput
            className="tb-dim-input"
            min={100}
            max={4000}
            value={artboard.width}
            onChange={(n) => onSizeChange({ width: n })}
            aria-label="Artboard width"
          />
        </label>
        <label className="tb-dim">
          <span className="tb-dim-prefix">H</span>
          <NumberInput
            className="tb-dim-input"
            min={100}
            max={4000}
            value={artboard.height}
            onChange={(n) => onSizeChange({ height: n })}
            aria-label="Artboard height"
          />
        </label>
      </div>

      <div className="tb-seg">
        <Tooltip label="New board" side="bottom">
          <button type="button" className="tb-btn" onClick={onAddArtboard} aria-label="New board">
            <Icon name="board-add" />
          </button>
        </Tooltip>
        <Tooltip label="Duplicate board" side="bottom">
          <button
            type="button"
            className="tb-btn"
            onClick={onDuplicateArtboard}
            aria-label="Duplicate board"
          >
            <Icon name="duplicate" />
          </button>
        </Tooltip>
        <Tooltip label="Delete board" side="bottom">
          <button
            type="button"
            className="tb-btn tb-btn--danger"
            onClick={onDeleteArtboard}
            disabled={!canDeleteArtboard}
            aria-label="Delete board"
          >
            <Icon name="trash" />
          </button>
        </Tooltip>
      </div>

      <span className="toolbar-divider" aria-hidden />

      <div className="toolbar-group">
        <div className="tb-seg">
          <Tooltip label="Zoom out" side="bottom">
            <button
              type="button"
              className="tb-btn"
              onClick={() => onZoomChange(zoom / 1.1)}
              aria-label="Zoom out"
            >
              <Icon name="minus" />
            </button>
          </Tooltip>
          <Tooltip label="Fit to screen" side="bottom">
            <button type="button" className="tb-btn tb-zoom" onClick={onFit}>
              {Math.round(zoom * 100)}%
            </button>
          </Tooltip>
          <Tooltip label="Zoom in" side="bottom">
            <button
              type="button"
              className="tb-btn"
              onClick={() => onZoomChange(zoom * 1.1)}
              aria-label="Zoom in"
            >
              <Icon name="plus" />
            </button>
          </Tooltip>
        </div>
        <Tooltip label={snapOn ? 'Snap: on' : 'Snap: off'} side="bottom">
          <button
            type="button"
            className={`tb-btn tb-btn--solo${snapOn ? ' is-on' : ''}`}
            onClick={onToggleSnap}
            aria-pressed={snapOn}
            aria-label="Snap to grid"
          >
            <Icon name="magnet" />
          </button>
        </Tooltip>
        <Tooltip label="Undo ⌘Z" side="bottom">
          <button
            type="button"
            className="tb-btn tb-btn--solo"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            aria-keyshortcuts="Meta+Z Control+Z"
          >
            <Icon name="undo" />
          </button>
        </Tooltip>
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
        <button
          ref={promptBtnRef}
          type="button"
          className={`tb-btn tb-btn--solo tb-btn--text prompt-button${promptMenu ? ' is-active' : ''}${promptStatus ? ` is-${promptStatus}` : ''}`}
          onClick={togglePromptMenu}
          // Keep ActionMenu's outside-pointerdown from closing then reopening on the same click.
          onPointerDown={(e) => e.stopPropagation()}
          aria-haspopup="menu"
          aria-expanded={Boolean(promptMenu)}
          title="Copy a prompt that teaches AI agents the .wireframe schema"
        >
          <Icon name={promptStatus === 'copied' ? 'check' : 'sparkle'} />
          <span className="prompt-label">
            {promptStatus === 'copied'
              ? 'Copied'
              : promptStatus === 'failed'
                ? 'Copy failed'
                : 'Agent prompt'}
          </span>
          <Icon name="chevron" className="prompt-chevron" />
        </button>
        {promptMenu && (
          <ActionMenu
            x={promptMenu.x}
            y={promptMenu.y}
            onClose={() => setPromptMenu(null)}
            items={[
              {
                id: 'prompt-create',
                label: 'Copy prompt · Create new design',
                onSelect: () => copyPrompt('create'),
              },
              {
                id: 'prompt-clone',
                label: 'Copy prompt · Clone a screen',
                onSelect: () => copyPrompt('clone'),
              },
            ]}
          />
        )}

        <span className="toolbar-divider" aria-hidden />

        <div className="tb-seg">
          <Tooltip label="Open .wireframe" side="bottom">
            <button
              type="button"
              className="tb-btn"
              onClick={() => fileRef.current?.click()}
              aria-label="Open file"
            >
              <Icon name="open" />
            </button>
          </Tooltip>
          <Tooltip label="Save .wireframe" side="bottom">
            <button type="button" className="tb-btn" onClick={onSave} aria-label="Save file">
              <Icon name="save" />
            </button>
          </Tooltip>
        </div>
        <button
          ref={exportBtnRef}
          type="button"
          className="tb-btn tb-btn--primary export-button"
          onClick={toggleExportMenu}
          // Keep ActionMenu's outside-pointerdown from closing then reopening on the same click.
          onPointerDown={(e) => e.stopPropagation()}
          aria-haspopup="menu"
          aria-expanded={Boolean(exportMenu)}
        >
          <Icon name="export" />
          Export
          <Icon name="chevron" className="export-chevron" />
        </button>
        {exportMenu && (
          <ActionMenu
            x={exportMenu.x}
            y={exportMenu.y}
            onClose={() => setExportMenu(null)}
            items={[
              {
                id: 'export-selected',
                label: `Download selected · ${exportFormat(selectedExportCount)}`,
                onSelect: onExportSelected,
              },
              {
                id: 'export-all',
                label: `Download all · ${exportFormat(totalExportCount)}`,
                onSelect: onExportAll,
              },
            ]}
          />
        )}
      </div>
    </header>
  )
}

type IconName =
  | 'chevron'
  | 'board-add'
  | 'duplicate'
  | 'trash'
  | 'minus'
  | 'plus'
  | 'magnet'
  | 'undo'
  | 'sparkle'
  | 'check'
  | 'open'
  | 'save'
  | 'export'

const ICON_PATHS: Record<IconName, string> = {
  chevron: 'M5 7.5 10 12.5 15 7.5',
  'board-add': 'M3.5 4.5h8v11h-8zM15.5 7v6M12.5 10h6',
  duplicate: 'M7 7h9.5v9.5H7zM13 7V3.5H3.5V13H7',
  trash: 'M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.75 11h7.5l.75-11M8.5 8.5v5M11.5 8.5v5',
  minus: 'M5 10h10',
  plus: 'M10 5v10M5 10h10',
  magnet: 'M5 3.5v6.5a5 5 0 0 0 10 0V3.5M5 7h3M12 7h3M8 3.5V10a2 2 0 0 0 4 0V3.5',
  undo: 'M7.5 5 3 9.5 7.5 14M3.5 9.5h7.25a5.25 5.25 0 0 1 5.25 5.25',
  sparkle: 'M10 3c.6 3.4 1.6 4.4 5 5-3.4.6-4.4 1.6-5 5-.6-3.4-1.6-4.4-5-5 3.4-.6 4.4-1.6 5-5zM15.5 13.5c.25 1.25.75 1.75 2 2-1.25.25-1.75.75-2 2-.25-1.25-.75-1.75-2-2 1.25-.25 1.75-.75 2-2z',
  check: 'M4.5 10.5 8 14l7.5-8',
  open: 'M3 5.5h5l1.5 1.5H17v8.5H3zM3 9h14',
  save: 'M10 3.5v9M6 8.5l4 4 4-4M4 15.5h12',
  export: 'M10 12.5v-9M6 7.5l4-4 4 4M4 12v4h12v-4',
}

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`tb-icon${className ? ` ${className}` : ''}`} aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}
