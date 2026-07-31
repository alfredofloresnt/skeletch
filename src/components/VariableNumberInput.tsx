import { useEffect, useRef, useState } from 'react'
import {
  createVariable,
  findVariable,
  nextVariableName,
  numberVariables,
} from '../lib/variables'
import type { DesignVariable } from '../lib/types'

type VariableNumberInputProps = {
  value: number
  variableId?: string | null
  variables: DesignVariable[]
  min?: number
  max?: number
  label: string
  onChange: (value: number, variableId: string | null) => void
  onAddVariable: (variable: DesignVariable) => void
}

export default function VariableNumberInput({
  value,
  variableId,
  variables,
  min = 0,
  max = 9999,
  label,
  onChange,
  onAddVariable,
}: VariableNumberInputProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const bound = findVariable(variables, variableId)
  const nums = numberVariables(variables)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const addFromCurrent = () => {
    const suggested = nextVariableName(variables, 'number')
    const name = window.prompt('Number variable name', suggested)
    if (name == null) return
    const variable = createVariable('number', name, value)
    onAddVariable(variable)
    onChange(Number(variable.value), variable.id)
    setMenuOpen(false)
  }

  return (
    <div className="var-number" ref={rootRef}>
      <div className="var-number-row">
        <input
          type="number"
          min={min}
          max={max}
          value={bound ? Number(bound.value) : value}
          onChange={(e) => onChange(Number(e.target.value), null)}
          aria-label={label}
        />
        <button
          type="button"
          className={`btn-ghost var-number-link${bound ? ' is-bound' : ''}`}
          onClick={() => setMenuOpen((o) => !o)}
          title="Bind variable"
          aria-expanded={menuOpen}
        >
          {bound ? `$${bound.name}` : '$'}
        </button>
      </div>
      {menuOpen && (
        <div className="var-number-menu">
          <button type="button" className="var-number-menu-item" onClick={addFromCurrent}>
            + New variable
          </button>
          {bound && (
            <button
              type="button"
              className="var-number-menu-item"
              onClick={() => {
                onChange(value, null)
                setMenuOpen(false)
              }}
            >
              Unbind
            </button>
          )}
          {nums.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`var-number-menu-item${variableId === v.id ? ' is-active' : ''}`}
              onClick={() => {
                onChange(Number(v.value), v.id)
                setMenuOpen(false)
              }}
            >
              <span>${v.name}</span>
              <span className="var-number-menu-value">{Number(v.value)}</span>
            </button>
          ))}
          {!nums.length && !bound && (
            <p className="panel-hint" style={{ margin: '0.35rem 0.5rem' }}>
              No number variables
            </p>
          )}
        </div>
      )}
    </div>
  )
}
