import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  convertPaintMode,
  isGradient,
  paintLabel,
  parsePaint,
  serializePaint,
  type ColorStop,
  type Paint,
  type PaintMode,
} from '../lib/paint'
import {
  colorVariables,
  createVariable,
  nextVariableName,
  sanitizeColor,
} from '../lib/variables'
import type { DesignVariable } from '../lib/types'
import NumberInput from './NumberInput'

type HSV = { h: number; s: number; v: number }

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const c = sanitizeColor(hex)
  if (!/^#[0-9a-f]{6}$/i.test(c)) return null
  return {
    r: parseInt(c.slice(1, 3), 16),
    g: parseInt(c.slice(3, 5), 16),
    b: parseInt(c.slice(5, 7), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return { h: h * 360, s: max ? d / max : 0, v: max }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = (((h % 360) + 360) % 360) / 60
  const c = v * s
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const m = v - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (hh < 1) [rp, gp, bp] = [c, x, 0]
  else if (hh < 2) [rp, gp, bp] = [x, c, 0]
  else if (hh < 3) [rp, gp, bp] = [0, c, x]
  else if (hh < 4) [rp, gp, bp] = [0, x, c]
  else if (hh < 5) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  }
}

function hexToHsv(hex: string): HSV {
  const rgb = hexToRgb(hex) || { r: 26, g: 26, b: 26 }
  return rgbToHsv(rgb.r, rgb.g, rgb.b)
}

function hsvToHex(hsv: HSV): string {
  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v)
  return rgbToHex(r, g, b)
}

function hueColor(h: number): string {
  return hsvToHex({ h, s: 1, v: 1 })
}

function activeStopColor(paint: Paint, stopIndex: 0 | 1): string {
  if (paint.mode === 'solid') {
    return paint.color === 'transparent' ? '#ffffff' : paint.color
  }
  const c = paint.stops[stopIndex].color
  return c === 'transparent' ? '#ffffff' : c
}

type ColorPickerProps = {
  value: string
  variableId?: string | null
  variables?: DesignVariable[]
  allowTransparent?: boolean
  /** When false, only solid colors (e.g. editing a variable value or text color). */
  allowGradient?: boolean
  /** When false, only the solid HSV palette is shown (e.g. editing a variable value). */
  showVariables?: boolean
  label?: string
  /** Selected elements disagree on this paint; shows "Mixed" until a new value is picked. */
  mixed?: boolean
  onChange: (value: string, variableId: string | null) => void
  onAddVariable?: (variable: DesignVariable) => void
}

export default function ColorPicker({
  value,
  variableId,
  variables = [],
  allowTransparent = true,
  allowGradient = true,
  showVariables = true,
  label = 'Color',
  mixed = false,
  onChange,
  onAddVariable,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [stopIndex, setStopIndex] = useState<0 | 1>(0)
  const paint = parsePaint(value)
  const mode = paint.mode
  const editingColor = activeStopColor(paint, stopIndex)
  const [hex, setHex] = useState(editingColor)
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(editingColor))
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const bound = showVariables
    ? colorVariables(variables).find((v) => v.id === variableId)
    : undefined
  const swatch = bound ? String(bound.value) : value
  const isTransparent = !bound && value === 'transparent'
  const colors = showVariables ? colorVariables(variables) : []

  useEffect(() => {
    if (bound) {
      const c = sanitizeColor(String(bound.value))
      setHex(c)
      setHsv(hexToHsv(c))
      return
    }
    if (!value || value === 'transparent') return
    const c = activeStopColor(parsePaint(value), stopIndex)
    setHex(c)
    setHsv(hexToHsv(c))
  }, [value, bound, stopIndex])

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return
    const place = () => {
      const rect = rootRef.current!.getBoundingClientRect()
      const width = 240
      const pad = 8
      let left = rect.right - width
      let top = rect.bottom + 6
      left = clamp(left, pad, window.innerWidth - width - pad)
      const approxHeight = popoverRef.current?.offsetHeight || 360
      if (top + approxHeight > window.innerHeight - pad) {
        top = Math.max(pad, rect.top - approxHeight - 6)
      }
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, mode])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || popoverRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const commitPaint = (next: Paint) => {
    onChange(serializePaint(next), null)
  }

  const commitLiteral = (next: string) => {
    const color = sanitizeColor(next)
    setHex(color)
    setHsv(hexToHsv(color))
    if (paint.mode === 'solid') {
      commitPaint({ mode: 'solid', color })
      return
    }
    const stops = [...paint.stops] as [ColorStop, ColorStop]
    stops[stopIndex] = { ...stops[stopIndex], color }
    commitPaint({ ...paint, stops })
  }

  const commitHsv = (next: HSV) => {
    const color = hsvToHex(next)
    setHsv(next)
    setHex(color)
    if (paint.mode === 'solid') {
      commitPaint({ mode: 'solid', color })
      return
    }
    const stops = [...paint.stops] as [ColorStop, ColorStop]
    stops[stopIndex] = { ...stops[stopIndex], color }
    commitPaint({ ...paint, stops })
  }

  const setMode = (next: PaintMode) => {
    if (next === mode && !bound) return
    setStopIndex(0)
    onChange(convertPaintMode(bound ? String(bound.value) : value, next), null)
  }

  const setAngle = (angle: number) => {
    if (paint.mode !== 'linear') return
    commitPaint({ ...paint, angle: clamp(angle, 0, 359) })
  }

  const pickSv = (clientX: number, clientY: number) => {
    const el = svRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const s = clamp((clientX - rect.left) / rect.width, 0, 1)
    const v = 1 - clamp((clientY - rect.top) / rect.height, 0, 1)
    commitHsv({ ...hsv, s, v })
  }

  const pickHue = (clientY: number) => {
    const el = hueRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const h = clamp(((clientY - rect.top) / rect.height) * 360, 0, 359.99)
    commitHsv({ ...hsv, h })
  }

  const onSvPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pickSv(e.clientX, e.clientY)
  }

  const onHuePointerDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pickHue(e.clientY)
  }

  const addFromCurrent = () => {
    if (!onAddVariable) return
    const color = isTransparent
      ? '#1a1a1a'
      : sanitizeColor(bound ? String(bound.value) : activeStopColor(paint, stopIndex))
    const suggested = nextVariableName(variables, 'color')
    const name = window.prompt('Color variable name', suggested)
    if (name == null) return
    const variable = createVariable('color', name, color)
    onAddVariable(variable)
    onChange(color, variable.id)
  }

  const gradientCss =
    paint.mode === 'solid' ? undefined : serializePaint(paint)

  const popover = open
    ? createPortal(
        <div
          ref={popoverRef}
          className="color-picker-popover"
          role="dialog"
          aria-label={label}
          style={{ top: pos.top, left: pos.left }}
        >
          {allowGradient && (
            <label className="color-picker-mode">
              <span className="color-picker-mode-label">Type</span>
              <select
                className="color-picker-mode-select"
                value={bound ? 'solid' : mode}
                onChange={(e) => setMode(e.target.value as PaintMode)}
                aria-label="Paint type"
              >
                <option value="solid">Solid</option>
                <option value="linear">Linear gradient</option>
                <option value="radial">Radial gradient</option>
              </select>
            </label>
          )}

          {paint.mode !== 'solid' && !bound && (
            <div className="color-picker-gradient">
              <div
                className="color-picker-gradient-bar"
                style={{ background: gradientCss }}
                aria-hidden
              />
              <div className="color-picker-stops">
                {paint.stops.map((stop, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`color-picker-stop${stopIndex === i ? ' is-active' : ''}`}
                    onClick={() => setStopIndex(i as 0 | 1)}
                    title={i === 0 ? 'Start color' : 'End color'}
                  >
                    <span
                      className="color-picker-swatch"
                      style={{ background: stop.color === 'transparent' ? undefined : stop.color }}
                    />
                    <span>{i === 0 ? 'Start' : 'End'}</span>
                  </button>
                ))}
              </div>
              {paint.mode === 'linear' && (
                <label className="color-picker-angle">
                  <span>Angle</span>
                  <NumberInput
                    min={0}
                    max={359}
                    value={Math.round(paint.angle)}
                    onChange={setAngle}
                    aria-label="Gradient angle"
                  />
                  <span className="color-picker-angle-unit">°</span>
                </label>
              )}
            </div>
          )}

          <div className="color-picker-solid">
            <div className="color-picker-palette">
              <div
                ref={svRef}
                className="color-picker-sv"
                style={{ backgroundColor: hueColor(hsv.h) }}
                onPointerDown={onSvPointerDown}
                onPointerMove={(e) => {
                  if (e.buttons) pickSv(e.clientX, e.clientY)
                }}
              >
                <div className="color-picker-sv-white" />
                <div className="color-picker-sv-black" />
                <div
                  className="color-picker-sv-thumb"
                  style={{
                    left: `${hsv.s * 100}%`,
                    top: `${(1 - hsv.v) * 100}%`,
                    background: hsvToHex(hsv),
                  }}
                />
              </div>
              <div
                ref={hueRef}
                className="color-picker-hue"
                onPointerDown={onHuePointerDown}
                onPointerMove={(e) => {
                  if (e.buttons) pickHue(e.clientY)
                }}
              >
                <div
                  className="color-picker-hue-thumb"
                  style={{ top: `${(hsv.h / 360) * 100}%` }}
                />
              </div>
            </div>
            <div className="color-picker-hex-row">
              <span className="color-picker-hex-label">Hex</span>
              <input
                className="color-picker-hex"
                value={bound ? `$${bound.name}` : isTransparent ? '' : hex}
                placeholder="#000000"
                onChange={(e) => {
                  const raw = e.target.value.trim()
                  if (raw.startsWith('$')) return
                  setHex(raw)
                  if (/^#[0-9a-fA-F]{6}$/.test(raw) || /^#[0-9a-fA-F]{3}$/.test(raw)) {
                    commitLiteral(raw)
                  }
                }}
                onBlur={() => {
                  if (!bound && !isTransparent) commitLiteral(hex)
                }}
                aria-label="Hex color"
              />
              <span
                className="color-picker-swatch color-picker-preview"
                style={{
                  background: isTransparent
                    ? undefined
                    : paint.mode === 'solid' || bound
                      ? hsvToHex(hsv)
                      : gradientCss,
                }}
              />
            </div>
          </div>

          {allowTransparent && paint.mode === 'solid' && (
            <button
              type="button"
              className="btn-ghost color-picker-clear"
              onClick={() => {
                onChange('transparent', null)
                setOpen(false)
              }}
            >
              Transparent
            </button>
          )}

          {showVariables && (
            <div className="color-picker-vars">
              <div className="color-picker-vars-header">
                <span className="palette-section-label">Variables</span>
                <button
                  type="button"
                  className="btn-ghost color-picker-add"
                  onClick={addFromCurrent}
                  title="Add color variable"
                >
                  +
                </button>
              </div>
              {!colors.length ? (
                <p className="panel-hint color-picker-empty">No color variables yet</p>
              ) : (
                <ul className="color-picker-var-list">
                  {colors.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        className={`color-picker-var${variableId === v.id ? ' is-active' : ''}`}
                        onClick={() => {
                          onChange(String(v.value), v.id)
                          setHex(sanitizeColor(String(v.value)))
                          setHsv(hexToHsv(String(v.value)))
                          setOpen(false)
                        }}
                      >
                        <span
                          className="color-picker-swatch"
                          style={{ background: String(v.value) }}
                        />
                        <span>${v.name}</span>
                        <span className="color-picker-var-value">{String(v.value)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>,
        document.body,
      )
    : null

  const triggerBackground = isTransparent
    ? undefined
    : isGradient(swatch)
      ? swatch
      : swatch

  return (
    <div className="color-picker" ref={rootRef}>
      <button
        type="button"
        className={`color-picker-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={label}
      >
        <span
          className={`color-picker-swatch${mixed ? ' is-mixed' : isTransparent ? ' is-transparent' : ''}`}
          style={{ background: mixed ? undefined : triggerBackground }}
        />
        <span className="color-picker-trigger-label">
          {mixed ? 'Mixed' : bound ? `$${bound.name}` : paintLabel(value)}
        </span>
      </button>
      {popover}
    </div>
  )
}
