import { uid } from './geometry'
import type { DesignVariable, DesignVariableType, WireElement } from './types'

export function createVariable(
  type: DesignVariableType,
  name: string,
  value: string | number,
): DesignVariable {
  return {
    id: uid('var'),
    name: sanitizeName(name),
    type,
    value: type === 'color' ? sanitizeColor(String(value)) : Number(value) || 0,
  }
}

export function sanitizeName(name: string): string {
  const trimmed = name.trim().replace(/^\$+/, '')
  return trimmed || 'variable'
}

export function sanitizeColor(value: string): string {
  const v = value.trim()
  if (v === 'transparent') return 'transparent'
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase()
  }
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase()
  return '#1a1a1a'
}

export function colorVariables(vars: DesignVariable[]): DesignVariable[] {
  return vars.filter((v) => v.type === 'color')
}

export function numberVariables(vars: DesignVariable[]): DesignVariable[] {
  return vars.filter((v) => v.type === 'number')
}

export function findVariable(
  vars: DesignVariable[],
  id: string | null | undefined,
): DesignVariable | undefined {
  if (!id) return undefined
  return vars.find((v) => v.id === id)
}

export function renameVariable(
  vars: DesignVariable[],
  id: string,
  name: string,
): DesignVariable[] {
  const next = sanitizeName(name)
  return vars.map((v) => (v.id === id ? { ...v, name: next } : v))
}

export function updateVariableValue(
  vars: DesignVariable[],
  id: string,
  value: string | number,
): DesignVariable[] {
  return vars.map((v) => {
    if (v.id !== id) return v
    if (v.type === 'color') return { ...v, value: sanitizeColor(String(value)) }
    return { ...v, value: Number(value) || 0 }
  })
}

export function removeVariable(
  vars: DesignVariable[],
  id: string,
): DesignVariable[] {
  return vars.filter((v) => v.id !== id)
}

/** Push variable value into every element bound to it. */
export function syncElementsToVariable(
  elements: WireElement[],
  variable: DesignVariable,
): WireElement[] {
  return elements.map((el) => {
    let next = el
    if (el.fillVar === variable.id && variable.type === 'color') {
      next = { ...next, fill: String(variable.value) }
    }
    if (el.fontSizeVar === variable.id && variable.type === 'number') {
      next = { ...next, fontSize: Number(variable.value) || 0 }
    }
    if (el.cornerRadiusVar === variable.id && variable.type === 'number') {
      next = { ...next, cornerRadius: Number(variable.value) || 0 }
    }
    return next
  })
}

/** Clear bindings when a variable is deleted. */
export function clearVariableBindings(
  elements: WireElement[],
  variableId: string,
): WireElement[] {
  return elements.map((el) => {
    let next = el
    if (el.fillVar === variableId) next = { ...next, fillVar: null }
    if (el.fontSizeVar === variableId) next = { ...next, fontSizeVar: null }
    if (el.cornerRadiusVar === variableId) next = { ...next, cornerRadiusVar: null }
    return next
  })
}

export function bindFill(
  variable: DesignVariable | null,
  literal?: string,
): Partial<WireElement> {
  if (variable) {
    return { fill: String(variable.value), fillVar: variable.id }
  }
  return { fill: literal, fillVar: null }
}

export function bindFontSize(
  variable: DesignVariable | null,
  literal?: number,
): Partial<WireElement> {
  if (variable) {
    return { fontSize: Number(variable.value) || 0, fontSizeVar: variable.id }
  }
  return { fontSize: literal, fontSizeVar: null }
}

export function bindCornerRadius(
  variable: DesignVariable | null,
  literal?: number,
): Partial<WireElement> {
  if (variable) {
    return { cornerRadius: Number(variable.value) || 0, cornerRadiusVar: variable.id }
  }
  return { cornerRadius: literal, cornerRadiusVar: null }
}

export function sanitizeVariable(raw: Partial<DesignVariable>): DesignVariable | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null
  if (raw.type !== 'color' && raw.type !== 'number') return null
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null
  if (raw.type === 'color') {
    return {
      id: raw.id,
      name: sanitizeName(raw.name),
      type: 'color',
      value: sanitizeColor(String(raw.value ?? '#1a1a1a')),
    }
  }
  return {
    id: raw.id,
    name: sanitizeName(raw.name),
    type: 'number',
    value: Number(raw.value) || 0,
  }
}

export function nextVariableName(vars: DesignVariable[], type: DesignVariableType): string {
  const base = type === 'color' ? 'color' : 'number'
  let n = 1
  const names = new Set(vars.map((v) => v.name.toLowerCase()))
  while (names.has(`${base}${n}`)) n += 1
  return `${base}${n}`
}
