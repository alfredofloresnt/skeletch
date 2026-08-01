import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PathVertex, Point } from '../lib/types'

type DragKind = { kind: 'vertex'; index: number } | { kind: 'in' | 'out'; index: number }

type PathEditOverlayProps = {
  vertices: PathVertex[]
  zoom: number
  onDragStart: () => void
  onDrag: (vertices: PathVertex[]) => void
  onDragEnd: () => void
}

export default function PathEditOverlay({
  vertices,
  zoom,
  onDragStart,
  onDrag,
  onDragEnd,
}: PathEditOverlayProps) {
  const scale = 1 / zoom

  const beginDrag = (e: ReactPointerEvent, kind: DragKind) => {
    e.stopPropagation()
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    onDragStart()

    const startClient: Point = { x: e.clientX, y: e.clientY }
    const origin = vertices.map((v) => ({
      ...v,
      in: v.in ? { ...v.in } : undefined,
      out: v.out ? { ...v.out } : undefined,
    }))

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startClient.x) * scale
      const dy = (ev.clientY - startClient.y) * scale
      const next = origin.map((v) => ({
        ...v,
        in: v.in ? { ...v.in } : undefined,
        out: v.out ? { ...v.out } : undefined,
      }))
      if (kind.kind === 'vertex') {
        const v = next[kind.index]
        v.x += dx
        v.y += dy
      } else {
        const v = next[kind.index]
        const handle = kind.kind === 'in' ? v.in || { x: 0, y: 0 } : v.out || { x: 0, y: 0 }
        const moved = { x: handle.x + dx, y: handle.y + dy }
        if (kind.kind === 'in') v.in = moved
        else v.out = moved
      }
      onDrag(next)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      onDragEnd()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="path-edit-overlay">
      {vertices.map((v, i) => {
        const hin = v.in
        const hout = v.out
        return (
          <div key={i}>
            {hin && (hin.x !== 0 || hin.y !== 0) ? (
              <>
                <div
                  className="path-edit-handle-line"
                  style={{
                    left: v.x,
                    top: v.y,
                    width: Math.hypot(hin.x, hin.y),
                    transform: `rotate(${Math.atan2(hin.y, hin.x)}rad)`,
                  }}
                />
                <button
                  type="button"
                  className="path-edit-handle"
                  style={{
                    left: v.x + hin.x,
                    top: v.y + hin.y,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                  }}
                  onPointerDown={(e) => beginDrag(e, { kind: 'in', index: i })}
                />
              </>
            ) : null}
            {hout && (hout.x !== 0 || hout.y !== 0) ? (
              <>
                <div
                  className="path-edit-handle-line"
                  style={{
                    left: v.x,
                    top: v.y,
                    width: Math.hypot(hout.x, hout.y),
                    transform: `rotate(${Math.atan2(hout.y, hout.x)}rad)`,
                  }}
                />
                <button
                  type="button"
                  className="path-edit-handle"
                  style={{
                    left: v.x + hout.x,
                    top: v.y + hout.y,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                  }}
                  onPointerDown={(e) => beginDrag(e, { kind: 'out', index: i })}
                />
              </>
            ) : null}
            <button
              type="button"
              className="path-edit-anchor"
              style={{
                left: v.x,
                top: v.y,
                transform: `translate(-50%, -50%) scale(${scale})`,
              }}
              onPointerDown={(e) => beginDrag(e, { kind: 'vertex', index: i })}
            />
          </div>
        )
      })}
    </div>
  )
}
