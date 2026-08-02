import { useEffect, useState, type InputHTMLAttributes } from 'react'

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  value: number | null
  onChange: (value: number) => void
}

function clamp(n: number, min?: number, max?: number) {
  let v = n
  if (min != null && Number.isFinite(min) && v < min) v = min
  if (max != null && Number.isFinite(max) && v > max) v = max
  return v
}

function isPartialNumber(raw: string) {
  return raw.trim() === '' || raw === '-' || raw === '.' || raw === '-.'
}

function displayValue(value: number | null) {
  return value == null || !Number.isFinite(value) ? '' : String(value)
}

export default function NumberInput({
  value,
  onChange,
  min,
  max,
  onFocus,
  onBlur,
  ...rest
}: NumberInputProps) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(displayValue(value))
  const minN = min != null && min !== '' ? Number(min) : undefined
  const maxN = max != null && max !== '' ? Number(max) : undefined

  useEffect(() => {
    if (!focused) setText(displayValue(value))
  }, [value, focused])

  const commit = (raw: string) => {
    if (isPartialNumber(raw)) {
      setText(displayValue(value))
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) {
      setText(displayValue(value))
      return
    }
    const next = clamp(n, minN, maxN)
    onChange(next)
    setText(String(next))
  }

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={focused ? text : displayValue(value)}
      onFocus={(e) => {
        setFocused(true)
        setText(displayValue(value))
        onFocus?.(e)
      }}
      onChange={(e) => {
        const raw = e.target.value
        setText(raw)
        if (isPartialNumber(raw)) return
        const n = Number(raw)
        if (!Number.isFinite(n)) return
        onChange(n)
      }}
      onBlur={(e) => {
        setFocused(false)
        commit(text)
        onBlur?.(e)
      }}
    />
  )
}
