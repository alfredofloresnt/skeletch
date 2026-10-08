import { canGroup, sharedGroupId } from '../lib/elements'
import { DEFAULT_SHADOW } from '../lib/shadow'
import type {
  DesignVariable,
  ElementShadow,
  TextAlign,
  VerticalAlign,
  WireElement,
} from '../lib/types'
import ColorPicker from './ColorPicker'
import NumberInput from './NumberInput'
import VariableNumberInput from './VariableNumberInput'

function AlignIcon({ align }: { align: TextAlign }) {
  const lines =
    align === 'right'
      ? [
          [4, 6, 16, 6],
          [8, 10, 16, 10],
          [4, 14, 16, 14],
          [10, 18, 16, 18],
        ]
      : align === 'middle'
        ? [
            [4, 6, 16, 6],
            [6, 10, 14, 10],
            [4, 14, 16, 14],
            [7, 18, 13, 18],
          ]
        : [
            [4, 6, 16, 6],
            [4, 10, 12, 10],
            [4, 14, 16, 14],
            [4, 18, 10, 18],
          ]

  return (
    <svg viewBox="0 0 20 24" width="16" height="18" aria-hidden>
      {lines.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

function VAlignIcon({ align }: { align: VerticalAlign }) {
  // top / middle / bottom — horizontal bars stacked in the box
  const bars =
    align === 'bottom'
      ? [12, 16, 20]
      : align === 'middle'
        ? [8, 12, 16]
        : [4, 8, 12]

  return (
    <svg viewBox="0 0 20 24" width="16" height="18" aria-hidden>
      <rect
        x="3"
        y="2"
        width="14"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        rx="1"
      />
      {bars.map((y) => (
        <line
          key={y}
          x1="6"
          y1={y}
          x2="14"
          y2={y}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

/** The value every element shares, or null when the selection disagrees. */
function sharedValue<T>(items: WireElement[], get: (el: WireElement) => T): T | null {
  if (!items.length) return null
  const first = get(items[0])
  return items.every((el) => get(el) === first) ? first : null
}

type SectionProps = {
  selected: WireElement[]
  set: (patch: Partial<WireElement>) => void
}

function NameSection({ selected, set }: SectionProps) {
  const name = sharedValue(selected, (el) => el.name || '')
  return (
    <div className="inspector-section">
      <label className="field-label">Name</label>
      <input
        type="text"
        value={name ?? ''}
        placeholder={name == null ? 'Mixed' : undefined}
        onChange={(e) => set({ name: e.target.value })}
        aria-label="Element name"
      />
    </div>
  )
}

function ShadowsSection({ selected, set }: SectionProps) {
  const key = sharedValue(selected, (el) => JSON.stringify(el.shadows ?? []))
  const shadows: ElementShadow[] = key == null ? [] : JSON.parse(key)
  const setShadows = (next: ElementShadow[]) => set({ shadows: next.length ? next : undefined })
  const update = (i: number, patch: Partial<ElementShadow>) =>
    setShadows(shadows.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  return (
    <div className="inspector-section">
      <div className="inspector-section-header">
        <label className="field-label">Shadows</label>
        <button
          type="button"
          className="btn-ghost btn-add"
          title="Add shadow"
          aria-label="Add shadow"
          onClick={() => setShadows([...shadows, { ...DEFAULT_SHADOW }])}
        >
          +
        </button>
      </div>
      {key == null && (
        <div className="shadow-mixed">
          <span className="panel-hint">Mixed</span>
          <button type="button" className="btn-ghost" onClick={() => setShadows([])}>
            Remove all
          </button>
        </div>
      )}
      {shadows.map((shadow, i) => (
        <div className="shadow-item" key={i}>
          <div className="field-row">
            <label>
              X
              <NumberInput value={shadow.x} onChange={(n) => update(i, { x: n })} />
            </label>
            <label>
              Y
              <NumberInput value={shadow.y} onChange={(n) => update(i, { y: n })} />
            </label>
          </div>
          <div className="field-row">
            <label>
              Blur
              <NumberInput
                min={0}
                max={200}
                value={shadow.blur}
                onChange={(n) => update(i, { blur: Math.max(0, n) })}
              />
            </label>
            <label>
              Opacity %
              <NumberInput
                min={0}
                max={100}
                value={Math.round(shadow.opacity * 100)}
                onChange={(n) => update(i, { opacity: Math.min(100, Math.max(0, n)) / 100 })}
              />
            </label>
          </div>
          <div className="shadow-color-row">
            <ColorPicker
              label="Shadow color"
              value={shadow.color}
              allowTransparent={false}
              allowGradient={false}
              showVariables={false}
              onChange={(color) => update(i, { color })}
            />
            <button
              type="button"
              className="btn-ghost btn-icon"
              title="Remove shadow"
              aria-label="Remove shadow"
              onClick={() => setShadows(shadows.filter((_, j) => j !== i))}
            >
              −
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

type PropertySectionsProps = SectionProps & {
  variables: DesignVariable[]
  onAddVariable: (variable: DesignVariable) => void
  onRotateSelection?: (degrees: number) => void
}

/**
 * Editable attributes for one or many elements. Only sections every selected
 * element supports are shown; differing values render as "Mixed" and editing
 * one writes the new value to the whole selection.
 */
function PropertySections({
  selected,
  variables,
  set,
  onAddVariable,
  onRotateSelection,
}: PropertySectionsProps) {
  const every = (pred: (el: WireElement) => boolean) => selected.every(pred)
  const isText = every((el) => el.type === 'text')
  const hasFill = every((el) => el.type !== 'line' && el.type !== 'text')
  const hasStroke = every((el) => el.type !== 'text')
  const hasRadius = every((el) => el.type === 'rect' || el.type === 'image')

  const first = selected[0]
  const x = sharedValue(selected, (el) => Math.round(el.x))
  const y = sharedValue(selected, (el) => Math.round(el.y))
  const w = sharedValue(selected, (el) => Math.round(el.w))
  const h = sharedValue(selected, (el) => Math.round(el.h))
  const rotation = sharedValue(selected, (el) => Math.round(el.rotation || 0))
  const fontSize = sharedValue(selected, (el) => el.fontSize || 16)
  const fontSizeVar = sharedValue(selected, (el) => el.fontSizeVar ?? null)
  const textAlign = sharedValue(selected, (el) => el.textAlign || 'left')
  const verticalAlign = sharedValue(selected, (el) => el.verticalAlign || 'top')
  const fill = sharedValue(selected, (el) => el.fill || 'transparent')
  const textColor = sharedValue(selected, (el) => el.fill || '#1a1a1a')
  const fillVar = sharedValue(selected, (el) => el.fillVar ?? null)
  const anyFillImage = selected.some((el) => el.fillImage)
  const stroke = sharedValue(selected, (el) => el.stroke || '#1a1a1a')
  const strokeWidth = sharedValue(selected, (el) => el.strokeWidth ?? 2)
  const cornerRadius = sharedValue(selected, (el) => el.cornerRadius || 0)
  const cornerRadiusVar = sharedValue(selected, (el) => el.cornerRadiusVar ?? null)
  const opacity = sharedValue(selected, (el) => el.opacity ?? 1)

  return (
    <>
      <div className="inspector-section">
        <label className="field-label">Position</label>
        <div className="field-row">
          <label>
            X
            <NumberInput value={x} placeholder="Mixed" onChange={(n) => set({ x: n })} />
          </label>
          <label>
            Y
            <NumberInput value={y} placeholder="Mixed" onChange={(n) => set({ y: n })} />
          </label>
        </div>
        <div className="field-row">
          <label>
            W
            <NumberInput
              min={1}
              value={w}
              placeholder="Mixed"
              onChange={(n) => set({ w: n })}
            />
          </label>
          <label>
            H
            <NumberInput
              min={1}
              value={h}
              placeholder="Mixed"
              onChange={(n) => set({ h: n })}
            />
          </label>
        </div>
        <label className="field-label" style={{ marginTop: '0.65rem' }}>
          Rotation
        </label>
        <div className="field-row">
          <label>
            °
            <NumberInput
              step={1}
              value={rotation}
              placeholder="Mixed"
              onChange={(n) => onRotateSelection?.(n)}
              aria-label="Rotation degrees"
            />
          </label>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onRotateSelection?.(0)}
            title="Reset rotation"
          >
            Reset
          </button>
        </div>
      </div>

      {isText && (
        <div className="inspector-section">
          <label className="field-label">Font size</label>
          <VariableNumberInput
            label="Font size"
            value={fontSize ?? first.fontSize ?? 16}
            mixed={fontSize == null}
            variableId={fontSizeVar}
            variables={variables}
            min={8}
            max={200}
            onChange={(value, variableId) =>
              set({ fontSize: value, fontSizeVar: variableId })
            }
            onAddVariable={onAddVariable}
          />
          <label className="field-label">Horizontal</label>
          <div className="btn-row btn-row--icons">
            {(
              [
                ['left', 'Align left'],
                ['middle', 'Align center'],
                ['right', 'Align right'],
              ] as const
            ).map(([align, label]) => (
              <button
                key={align}
                type="button"
                title={label}
                aria-label={label}
                className={`btn-ghost btn-icon${textAlign === align ? ' is-active' : ''}`}
                onClick={() => set({ textAlign: align })}
              >
                <AlignIcon align={align} />
              </button>
            ))}
          </div>
          <label className="field-label">Vertical</label>
          <div className="btn-row btn-row--icons">
            {(
              [
                ['top', 'Align top'],
                ['middle', 'Align middle'],
                ['bottom', 'Align bottom'],
              ] as const
            ).map(([align, label]) => (
              <button
                key={align}
                type="button"
                title={label}
                aria-label={label}
                className={`btn-ghost btn-icon${verticalAlign === align ? ' is-active' : ''}`}
                onClick={() => set({ verticalAlign: align })}
              >
                <VAlignIcon align={align} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="inspector-section">
        <label className="field-label">Appearance</label>
        {hasFill && (
          <>
            <label className="field-label">Fill</label>
            <ColorPicker
              label="Fill"
              value={fill ?? first.fill ?? 'transparent'}
              mixed={fill == null}
              variableId={fillVar}
              variables={variables}
              allowTransparent
              onChange={(fill, fillVar) => set({ fill, fillVar, fillImage: null })}
              onAddVariable={onAddVariable}
            />
            {anyFillImage && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => set({ fillImage: null })}
              >
                Clear image fill
              </button>
            )}
          </>
        )}
        {isText && (
          <>
            <label className="field-label">Color</label>
            <ColorPicker
              label="Text color"
              value={textColor ?? first.fill ?? '#1a1a1a'}
              mixed={textColor == null}
              variableId={fillVar}
              variables={variables}
              allowTransparent={false}
              allowGradient={false}
              onChange={(fill, fillVar) => set({ fill, fillVar })}
              onAddVariable={onAddVariable}
            />
          </>
        )}
        {hasStroke && (
          <>
            <label className="field-label">Stroke</label>
            <ColorPicker
              label="Stroke"
              value={stroke ?? first.stroke ?? '#1a1a1a'}
              mixed={stroke == null}
              variables={variables}
              allowTransparent
              onChange={(stroke) => set({ stroke })}
              onAddVariable={onAddVariable}
            />
            <label className="field-label">Stroke width</label>
            <NumberInput
              min={0}
              max={40}
              value={strokeWidth}
              placeholder="Mixed"
              onChange={(n) => set({ strokeWidth: n })}
            />
          </>
        )}
        {hasRadius && (
          <>
            <label className="field-label">Corner radius</label>
            <VariableNumberInput
              label="Corner radius"
              value={cornerRadius ?? first.cornerRadius ?? 0}
              mixed={cornerRadius == null}
              variableId={cornerRadiusVar}
              variables={variables}
              min={0}
              max={200}
              onChange={(value, variableId) =>
                set({ cornerRadius: value, cornerRadiusVar: variableId })
              }
              onAddVariable={onAddVariable}
            />
          </>
        )}
        <label className="field-label">Opacity{opacity == null ? ' · Mixed' : ''}</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity ?? first.opacity ?? 1}
          onChange={(e) => set({ opacity: Number(e.target.value) })}
        />
      </div>

      <ShadowsSection selected={selected} set={set} />
    </>
  )
}

type InspectorProps = {
  elements: WireElement[]
  selectedIds: string[]
  variables: DesignVariable[]
  onUpdate: (ids: string[], patch: Partial<WireElement>) => void
  onAddVariable: (variable: DesignVariable) => void
  onBringForward: () => void
  onSendBackward: () => void
  onBringToFront: () => void
  onSendToBack: () => void
  onDelete: () => void
  onUngroup: (groupId: string) => void
  onGroup: (ids?: string[]) => void
  onRenameGroup?: (groupId: string, name: string) => void
  onSaveAsComponent?: () => void
  canSaveAsComponent?: boolean
  canGroupSelection?: boolean
  onRotateSelection?: (degrees: number) => void
  editingGroupId: string | null
  onEditGroup: (groupId: string | null) => void
}

export default function Inspector({
  elements,
  selectedIds,
  variables,
  onUpdate,
  onAddVariable,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onDelete,
  onUngroup,
  onGroup,
  onRenameGroup,
  onSaveAsComponent,
  canSaveAsComponent,
  canGroupSelection,
  onRotateSelection,
  editingGroupId,
  onEditGroup,
}: InspectorProps) {
  const selectedSet = new Set(selectedIds)
  const selected = elements.filter((e) => selectedSet.has(e.id))
  const groupId = sharedGroupId(elements, selectedIds)
  const groupMeta = groupId
    ? elements.find((e) => e.groupId === groupId)
    : null
  const allowGroup = canGroupSelection ?? canGroup(elements, selectedIds)
  const set = (patch: Partial<WireElement>) => onUpdate(selectedIds, patch)

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
            ? `${groupMeta?.groupName || 'Group'} · ${selected.length} atoms`
            : `${selected.length} selected`}
        </p>
        {!groupId && <NameSection selected={selected} set={set} />}
        {groupId ? (
          <div className="inspector-section">
            <label className="field-label">Group name</label>
            <input
              type="text"
              value={groupMeta?.groupName || ''}
              onChange={(e) => onRenameGroup?.(groupId, e.target.value)}
              aria-label="Group name"
            />
            <p className="panel-hint" style={{ margin: '0.5rem 0' }}>
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
            <button
              type="button"
              className="btn-ghost"
              style={{ marginTop: '0.5rem', width: '100%' }}
              disabled={!canSaveAsComponent}
              onClick={onSaveAsComponent}
            >
              Save as component
            </button>
          </div>
        ) : (
          <div className="inspector-section">
            <label className="field-label">Group</label>
            <button
              type="button"
              className="btn-ghost"
              disabled={!allowGroup}
              onClick={() => onGroup?.(selectedIds)}
            >
              Group selection
            </button>
            <button
              type="button"
              className="btn-ghost"
              style={{ marginTop: '0.5rem', width: '100%' }}
              disabled={!canSaveAsComponent}
              onClick={onSaveAsComponent}
            >
              Save as component
            </button>
          </div>
        )}
        <PropertySections
          selected={selected}
          variables={variables}
          set={set}
          onAddVariable={onAddVariable}
          onRotateSelection={onRotateSelection}
        />
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

  return (
    <aside className="inspector">
      <h2 className="inspector-title">Inspector</h2>
      <p className="inspector-meta">
        {el.type}
        {el.groupName ? ` · ${el.groupName}` : ''}
      </p>

      <NameSection selected={selected} set={set} />

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
              onClick={() => onEditGroup(el.groupId!)}
            >
              Edit atoms
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            style={{ marginTop: '0.35rem' }}
            onClick={() => onUngroup(el.groupId!)}
          >
            Ungroup
          </button>
        </div>
      )}

      <div className="inspector-section">
        <label className="field-label">Component</label>
        <button
          type="button"
          className="btn-ghost"
          disabled={!canSaveAsComponent}
          onClick={onSaveAsComponent}
        >
          Save as component
        </button>
      </div>

      <PropertySections
        selected={selected}
        variables={variables}
        set={set}
        onAddVariable={onAddVariable}
        onRotateSelection={onRotateSelection}
      />

      <button type="button" className="btn-danger" onClick={onDelete}>
        Delete
      </button>
    </aside>
  )
}
