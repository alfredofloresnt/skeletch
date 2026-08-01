import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { DEFAULTS } from '../lib/constants'
import {
  resizeCursorForHandle,
  rotateCursorForHandle,
  type CornerHandle,
} from '../lib/geometry'
import type { Rect, ResizeHandle, WireElement as WireElementModel } from '../lib/types'

export type { CornerHandle }

function rotationStyle(rotation?: number): CSSProperties {
  if (!rotation) return {}
  return {
    transform: `rotate(${rotation}deg)`,
    transformOrigin: 'center center',
  }
}

function ImagePlaceholder({
  stroke,
  strokeWidth,
}: {
  stroke?: string
  strokeWidth?: number
}) {
  const s = stroke ?? DEFAULTS.image.stroke
  const sw = strokeWidth ?? DEFAULTS.image.strokeWidth
  return (
    <svg className="el-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect
        x="1"
        y="1"
        width="98"
        height="98"
        fill="none"
        stroke={s}
        strokeWidth={sw}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="1"
        y1="1"
        x2="99"
        y2="99"
        stroke={s}
        strokeWidth={sw}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="99"
        y1="1"
        x2="1"
        y2="99"
        stroke={s}
        strokeWidth={sw}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function TextWireElement({
  el,
  style,
  selected,
  editing,
  onPointerDown,
  onCommitText,
  onCancelTextEdit,
}: {
  el: WireElementModel
  style: CSSProperties
  selected?: boolean
  editing?: boolean
  onPointerDown?: (e: ReactPointerEvent, id: string) => void
  onCommitText?: (id: string, text: string) => void
  onCancelTextEdit?: (id: string) => void
}) {
  const vAlign = el.verticalAlign || 'top'
  const [draft, setDraft] = useState(el.text || '')
  const committed = useRef(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const editSession = editing ? `${el.id}:${el.text || ''}` : null

  useEffect(() => {
    if (!editSession) return
    const text = editSession.slice(editSession.indexOf(':') + 1)
    setDraft(text)
    committed.current = false
    const timer = window.setTimeout(() => {
      const node = areaRef.current
      if (!node) return
      node.focus()
      node.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [editSession])

  // Keep editor height to content so parent flex vertical-align matches committed text.
  useEffect(() => {
    if (!editing) return
    const node = areaRef.current
    if (!node) return
    const min = (el.fontSize || 16) * 1.2
    node.style.height = '0px'
    node.style.height = `${Math.max(node.scrollHeight, min)}px`
  }, [editing, draft, el.fontSize, el.w, el.textAlign, el.verticalAlign])

  const textStyle: CSSProperties = {
    fontSize: el.fontSize,
    color: el.fill,
    lineHeight: 1.2,
    wordBreak: 'break-word',
    display: 'block',
    width: '100%',
    textAlign: el.textAlign === 'middle' ? 'center' : el.textAlign || 'left',
  }

  const confirm = () => {
    if (committed.current) return
    committed.current = true
    onCommitText?.(el.id, draft)
  }

  const cancel = () => {
    if (committed.current) return
    committed.current = true
    onCancelTextEdit?.(el.id)
  }

  return (
    <div
      className={`wire-el wire-el--text${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}`}
      style={{
        ...style,
        display: 'flex',
        flexDirection: 'column',
        justifyContent:
          vAlign === 'middle' ? 'center' : vAlign === 'bottom' ? 'flex-end' : 'flex-start',
      }}
      data-id={el.id}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, el.id) : undefined}
    >
      {editing ? (
        <textarea
          ref={areaRef}
          aria-label="Edit text"
          className="wire-el-text-editor"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={confirm}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          style={textStyle}
        />
      ) : (
        <span style={textStyle}>{el.text || 'Text'}</span>
      )}
    </div>
  )
}

type WireElementProps = {
  el: WireElementModel
  selected?: boolean
  editing?: boolean
  onPointerDown?: (e: ReactPointerEvent, id: string) => void
  onCommitText?: (id: string, text: string) => void
  onCancelTextEdit?: (id: string) => void
  dimmed?: boolean
}

export default function WireElement({
  el,
  selected,
  editing,
  onPointerDown,
  onCommitText,
  onCancelTextEdit,
  dimmed,
}: WireElementProps) {
  const style: CSSProperties = {
    left: el.x,
    top: el.y,
    width: Math.max(el.w, 1),
    height: Math.max(Math.abs(el.h) || (el.type === 'line' ? 1 : el.h), 1),
    zIndex: el.z,
    opacity: dimmed ? Math.min(el.opacity ?? 1, 1) * 0.28 : el.opacity,
    ...rotationStyle(el.rotation),
  }

  if (el.type === 'line') {
    const x2 = el.w
    const y2 = el.h
    const minX = Math.min(0, x2)
    const minY = Math.min(0, y2)
    const boxW = Math.max(Math.abs(x2), 1)
    const boxH = Math.max(Math.abs(y2), 1)
    return (
      <div
        className={`wire-el wire-el--line${selected ? ' is-selected' : ''}`}
        style={{
          left: el.x + minX,
          top: el.y + minY,
          width: boxW,
          height: boxH,
          zIndex: el.z,
          opacity: dimmed ? Math.min(el.opacity ?? 1, 1) * 0.28 : el.opacity,
          ...rotationStyle(el.rotation),
        }}
        data-id={el.id}
        onPointerDown={onPointerDown ? (e) => onPointerDown(e, el.id) : undefined}
      >
        <svg className="el-svg" width={boxW} height={boxH}>
          <line
            x1={0 - minX}
            y1={0 - minY}
            x2={x2 - minX}
            y2={y2 - minY}
            stroke={el.stroke}
            strokeWidth={el.strokeWidth}
          />
        </svg>
      </div>
    )
  }

  if (el.type === 'text') {
    return (
      <TextWireElement
        el={el}
        style={style}
        selected={selected}
        editing={editing}
        onPointerDown={onPointerDown}
        onCommitText={onCommitText}
        onCancelTextEdit={onCancelTextEdit}
      />
    )
  }

  if (el.type === 'circle') {
    const sw = el.strokeWidth || 0
    return (
      <div
        className={`wire-el wire-el--circle${selected ? ' is-selected' : ''}`}
        style={{
          ...style,
          borderRadius: '50%',
          border: sw > 0 ? `${sw}px solid ${el.stroke}` : 'none',
          background: el.fill === 'transparent' ? 'transparent' : el.fill,
          boxSizing: 'border-box',
        }}
        data-id={el.id}
        onPointerDown={onPointerDown ? (e) => onPointerDown(e, el.id) : undefined}
      />
    )
  }

  if (el.type === 'triangle') {
    const sw = el.strokeWidth || 0
    const fill = el.fill === 'transparent' ? 'none' : el.fill
    return (
      <div
        className={`wire-el wire-el--triangle${selected ? ' is-selected' : ''}`}
        style={style}
        data-id={el.id}
        onPointerDown={onPointerDown ? (e) => onPointerDown(e, el.id) : undefined}
      >
        <svg className="el-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon
            points="50,3 97,97 3,97"
            fill={fill}
            stroke={sw > 0 ? el.stroke : 'none'}
            strokeWidth={sw}
            strokeLinejoin="miter"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    )
  }

  if (el.type === 'image') {
    const fill = el.fill ?? DEFAULTS.image.fill
    return (
      <div
        className={`wire-el wire-el--image${selected ? ' is-selected' : ''}`}
        style={{
          ...style,
          background: fill === 'transparent' ? 'transparent' : fill,
          borderRadius: el.cornerRadius,
          overflow: 'hidden',
        }}
        data-id={el.id}
        onPointerDown={onPointerDown ? (e) => onPointerDown(e, el.id) : undefined}
      >
        <ImagePlaceholder stroke={el.stroke} strokeWidth={el.strokeWidth} />
      </div>
    )
  }

  // rect
  const sw = el.strokeWidth || 0
  return (
    <div
      className={`wire-el wire-el--rect${selected ? ' is-selected' : ''}`}
      style={{
        ...style,
        border: sw > 0 ? `${sw}px solid ${el.stroke}` : 'none',
        background: el.fill === 'transparent' ? 'transparent' : el.fill,
        borderRadius: el.cornerRadius,
        boxSizing: 'border-box',
      }}
      data-id={el.id}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, el.id) : undefined}
    />
  )
}

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const CORNER_HANDLES: CornerHandle[] = ['nw', 'ne', 'se', 'sw']

/** Min inset so radius handles stay grabable when cornerRadius is 0. */
const RADIUS_HANDLE_MIN_INSET = 12
/** Offset of rotate hit targets outside each corner (screen-ish via 1/zoom scale). */
const ROTATE_HANDLE_OFFSET = 18

type SelectionOverlayProps = {
  bounds: Rect
  zoom: number
  onHandleDown: (e: ReactPointerEvent, handle: ResizeHandle) => void
  /** Show interior corner-radius handles (single rectangle). */
  cornerRadius?: number
  showCornerRadius?: boolean
  onCornerRadiusDown?: (e: ReactPointerEvent, corner: CornerHandle) => void
  /** Rotate overlay with the selected element (degrees). */
  rotation?: number
  /** Show rotate targets outside each resize handle (single selection). */
  showRotateHandles?: boolean
  onRotateDown?: (e: ReactPointerEvent, handle: ResizeHandle) => void
}

export function SelectionOverlay({
  bounds,
  zoom,
  onHandleDown,
  cornerRadius = 0,
  showCornerRadius = false,
  onCornerRadiusDown,
  rotation = 0,
  showRotateHandles = false,
  onRotateDown,
}: SelectionOverlayProps) {
  if (!bounds) return null
  const maxR = Math.max(0, Math.min(bounds.w, bounds.h) / 2)
  const inset = Math.min(maxR, Math.max(cornerRadius || 0, RADIUS_HANDLE_MIN_INSET))
  const rotOff = ROTATE_HANDLE_OFFSET
  const midX = bounds.w / 2
  const midY = bounds.h / 2

  const cornerPos: Record<CornerHandle, { left: number; top: number }> = {
    nw: { left: inset, top: inset },
    ne: { left: bounds.w - inset, top: inset },
    se: { left: bounds.w - inset, top: bounds.h - inset },
    sw: { left: inset, top: bounds.h - inset },
  }

  const rotatePos: Record<ResizeHandle, { left: number; top: number }> = {
    nw: { left: -rotOff, top: -rotOff },
    n: { left: midX, top: -rotOff },
    ne: { left: bounds.w + rotOff, top: -rotOff },
    e: { left: bounds.w + rotOff, top: midY },
    se: { left: bounds.w + rotOff, top: bounds.h + rotOff },
    s: { left: midX, top: bounds.h + rotOff },
    sw: { left: -rotOff, top: bounds.h + rotOff },
    w: { left: -rotOff, top: midY },
  }

  return (
    <div
      className="selection-overlay"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.w,
        height: bounds.h,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      {HANDLES.map((h) => (
        <div
          key={h}
          className={`resize-handle resize-handle--${h}`}
          style={{
            transform: `scale(${1 / zoom})`,
            cursor: resizeCursorForHandle(h, rotation),
          }}
          onPointerDown={(e) => onHandleDown(e, h)}
        />
      ))}
      {showRotateHandles &&
        onRotateDown &&
        HANDLES.map((h) => (
          <div
            key={`rot-${h}`}
            className={`rotate-handle rotate-handle--${h}`}
            style={{
              left: rotatePos[h].left,
              top: rotatePos[h].top,
              transform: `translate(-50%, -50%) scale(${1 / zoom})`,
              cursor: rotateCursorForHandle(h, rotation),
            }}
            onPointerDown={(e) => onRotateDown(e, h)}
          />
        ))}
      {showCornerRadius &&
        onCornerRadiusDown &&
        CORNER_HANDLES.map((corner) => (
          <div
            key={`r-${corner}`}
            className={`radius-handle radius-handle--${corner}`}
            style={{
              left: cornerPos[corner].left,
              top: cornerPos[corner].top,
              transform: `translate(-50%, -50%) scale(${1 / zoom})`,
            }}
            onPointerDown={(e) => onCornerRadiusDown(e, corner)}
          />
        ))}
    </div>
  )
}
