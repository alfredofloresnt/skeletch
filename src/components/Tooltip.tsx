import type { ReactNode } from 'react'

type TooltipSide = 'right' | 'left' | 'top' | 'bottom'

type TooltipProps = {
  label: string
  children: ReactNode
  side?: TooltipSide
}

export default function Tooltip({ label, children, side = 'right' }: TooltipProps) {
  return (
    <span className={`tooltip tooltip--${side}`}>
      {children}
      <span className="tooltip-bubble" role="tooltip">
        {label}
      </span>
    </span>
  )
}
