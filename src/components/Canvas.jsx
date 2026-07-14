import { useCallback, useEffect, useRef, useState } from 'react'
import { GRID_SIZE, MAX_ZOOM, MIN_ZOOM } from '../lib/constants'
import { expandSelectionForGroups, sharedGroupId } from '../lib/elements'
import {
  applyResize,
  getBounds,
  pointInElement,
  rectsIntersect,
  screenToWorld,
  snap,
  sortByZ,
} from '../lib/geometry'
import WireElement, { SelectionOverlay } from './WireElement'

export default function Canvas({
  artboard,
  elements,
  selectedIds,
  snapOn,
  placeType,
  onSelect,
  onMoveElements,
  onResizeElement,
  onResizeGroup,
  onPlace,
  onClearPlace,
  pan,
  zoom,
  onPanChange,
  onViewChange,
  editingGroupId,
  onEditGroup,
}) {
  const stageRef = useRef(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [marquee, setMarquee] = useState(null)
  const interaction = useRef(null)
  const lastClick = useRef({ id: null, time: 0 })
  const viewRef = useRef({ pan, zoom })
  const pinchActiveRef = useRef(false)
  const pinchIdleTimer = useRef(0)

  // Sync props → ref only when not mid-pinch (avoids clobbering newer gesture values)
  useEffect(() => {
    if (pinchActiveRef.current) return
    viewRef.current = { pan, zoom }
  }, [pan, zoom])

  const selected = elements.filter((e) => selectedIds.includes(e.id))
  const bounds = selected.length ? getBounds(selected) : null
  const groupSelected = sharedGroupId(elements, selectedIds)
  const showGroupResize = Boolean(groupSelected) || selected.length === 1

  useEffect(() => {
    const down = (e) => {
      if (
        e.code === 'Space' &&
        !e.repeat &&
        e.target.tagName !== 'INPUT' &&
        e.target.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault()
        setSpaceDown(true)
      }
    }
    const up = (e) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Trackpad: pinch-zoom (ctrl+wheel only) and two-finger pan.
  // One update per frame; pan+zoom written together; viewRef updated sync.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return

    let raf = 0
    let pendingZoom = null // { clientX, clientY, factor }
    let pendingPan = null // { dx, dy }

    const applyView = (nextZoom, clientX, clientY, panDx, panDy) => {
      const { pan: p, zoom: z } = viewRef.current
      let zoomOut = z
      let panOut = p

      if (nextZoom != null) {
        zoomOut = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
        const rect = el.getBoundingClientRect()
        const mx = clientX - rect.left
        const my = clientY - rect.top
        const scale = zoomOut / Math.max(z, 0.0001)
        panOut = {
          x: mx - (mx - p.x) * scale,
          y: my - (my - p.y) * scale,
        }
      }

      if (panDx || panDy) {
        panOut = { x: panOut.x - (panDx || 0), y: panOut.y - (panDy || 0) }
      }

      if (zoomOut === z && panOut.x === p.x && panOut.y === p.y) return

      viewRef.current = { pan: panOut, zoom: zoomOut }
      onViewChange({ pan: panOut, zoom: zoomOut })
    }

    const flush = () => {
      raf = 0
      const zoomEvt = pendingZoom
      const panEvt = pendingPan
      pendingZoom = null
      pendingPan = null

      if (zoomEvt) {
        applyView(
          viewRef.current.zoom * zoomEvt.factor,
          zoomEvt.clientX,
          zoomEvt.clientY,
          0,
          0,
        )
        return
      }
      if (panEvt) applyView(null, 0, 0, panEvt.dx, panEvt.dy)
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(flush)
    }

    const onWheel = (e) => {
      e.preventDefault()

      // Pinch → ctrl/meta + wheel (Safari gesture* removed — it double-fired with this)
      if (e.ctrlKey || e.metaKey) {
        pinchActiveRef.current = true
        window.clearTimeout(pinchIdleTimer.current)
        pinchIdleTimer.current = window.setTimeout(() => {
          pinchActiveRef.current = false
          // adopt committed React state after gesture ends
          viewRef.current = { pan: viewRef.current.pan, zoom: viewRef.current.zoom }
        }, 120)

        const intensity = e.deltaMode === 1 ? 0.05 : 0.01
        const factor = Math.exp(-e.deltaY * intensity)
        if (!pendingZoom) {
          pendingZoom = { clientX: e.clientX, clientY: e.clientY, factor: 1 }
        }
        pendingZoom.factor *= factor
        pendingZoom.clientX = e.clientX
        pendingZoom.clientY = e.clientY
        pendingPan = null
        schedule()
        return
      }

      if (!pendingPan) pendingPan = { dx: 0, dy: 0 }
      pendingPan.dx += e.deltaX
      pendingPan.dy += e.deltaY
      schedule()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [onViewChange])
  const getStageRect = () => stageRef.current.getBoundingClientRect()

  const hitTest = useCallback(
    (wx, wy) => {
      const sorted = sortByZ(elements).reverse()
      for (const el of sorted) {
        if (pointInElement(wx, wy, el)) return el
      }
      return null
    },
    [elements],
  )

  const onStagePointerDown = (e) => {
    // Middle-mouse, Space+drag, or empty-canvas drag → pan
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault()
      setPanning(true)
      interaction.current = {
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPan: { ...pan },
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    if (e.button !== 0) return

    const rect = getStageRect()
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)

    if (placeType) {
      onPlace(placeType, world.x, world.y)
      onClearPlace()
      return
    }

    const hit = hitTest(world.x, world.y)
    if (hit) return

    const additive = e.metaKey || e.ctrlKey
    const wantMarquee = e.shiftKey || additive

    if (!wantMarquee) {
      // Drag empty canvas to pan (laptop / mouse friendly)
      if (!additive) {
        onSelect([])
        onEditGroup(null)
      }
      setPanning(true)
      interaction.current = {
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPan: { ...pan },
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    if (!additive) {
      onSelect([])
      onEditGroup(null)
    }

    interaction.current = {
      mode: 'marquee',
      startX: world.x,
      startY: world.y,
      additive,
      pointerId: e.pointerId,
    }
    setMarquee({ x: world.x, y: world.y, w: 0, h: 0 })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onElementPointerDown = (e, id) => {
    if (spaceDown || e.button === 1) return
    e.stopPropagation()
    e.preventDefault()

    const el = elements.find((x) => x.id === id)
    const now = Date.now()
    const isDouble =
      lastClick.current.id === id && now - lastClick.current.time < 350 && el?.groupId
    lastClick.current = { id, time: now }

    const additive = e.metaKey || e.ctrlKey

    if (isDouble && el.groupId) {
      onEditGroup(el.groupId)
      onSelect([id])
      return
    }

    if (!additive && editingGroupId && el.groupId !== editingGroupId) {
      onEditGroup(null)
    }

    let seed = [id]
    if (!additive) {
      seed = expandSelectionForGroups(elements, [id], editingGroupId)
    }

    let nextSelected = selectedIds
    if (additive) {
      const expanded = expandSelectionForGroups(elements, [id], editingGroupId)
      const allIn = expanded.every((x) => selectedIds.includes(x))
      nextSelected = allIn
        ? selectedIds.filter((x) => !expanded.includes(x))
        : [...new Set([...selectedIds, ...expanded])]
      onSelect(nextSelected)
    } else if (!seed.every((x) => selectedIds.includes(x)) || selectedIds.length !== seed.length) {
      nextSelected = seed
      onSelect(nextSelected)
    }

    const rect = getStageRect()
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)
    const movingIds = additive
      ? nextSelected
      : selectedIds.length && seed.every((x) => selectedIds.includes(x))
        ? selectedIds
        : seed
    const origins = Object.fromEntries(
      elements
        .filter((item) => movingIds.includes(item.id))
        .map((item) => [item.id, { x: item.x, y: item.y }]),
    )

    interaction.current = {
      mode: 'move',
      startWorld: world,
      origins,
      ids: movingIds,
    }
    stageRef.current.setPointerCapture(e.pointerId)
  }

  const onHandleDown = (e, handle) => {
    e.stopPropagation()
    e.preventDefault()
    if (!showGroupResize || !bounds) return
    const rect = getStageRect()
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)

    if (groupSelected || selected.length > 1) {
      interaction.current = {
        mode: 'resize-group',
        handle,
        startWorld: world,
        originBounds: { ...bounds },
        ids: selectedIds.slice(),
        keepAspect: e.shiftKey,
      }
    } else {
      const el = selected[0]
      interaction.current = {
        mode: 'resize',
        handle,
        startWorld: world,
        origin: { ...el },
        id: el.id,
        keepAspect: e.shiftKey,
      }
    }
    stageRef.current.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    const ix = interaction.current
    if (!ix) return

    if (ix.mode === 'pan') {
      onPanChange({
        x: ix.origPan.x + (e.clientX - ix.startX),
        y: ix.origPan.y + (e.clientY - ix.startY),
      })
      return
    }

    const rect = getStageRect()
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)

    if (ix.mode === 'marquee') {
      const x = Math.min(ix.startX, world.x)
      const y = Math.min(ix.startY, world.y)
      const w = Math.abs(world.x - ix.startX)
      const h = Math.abs(world.y - ix.startY)
      setMarquee({ x, y, w, h })
      return
    }

    if (ix.mode === 'move') {
      let dx = world.x - ix.startWorld.x
      let dy = world.y - ix.startWorld.y
      if (snapOn) {
        const firstId = ix.ids[0]
        if (firstId && ix.origins[firstId]) {
          const nx = snap(ix.origins[firstId].x + dx, true)
          const ny = snap(ix.origins[firstId].y + dy, true)
          dx = nx - ix.origins[firstId].x
          dy = ny - ix.origins[firstId].y
        }
      }
      const updates = ix.ids.map((id) => ({
        id,
        x: ix.origins[id].x + dx,
        y: ix.origins[id].y + dy,
      }))
      onMoveElements(updates)
      return
    }

    if (ix.mode === 'resize') {
      const dx = world.x - ix.startWorld.x
      const dy = world.y - ix.startWorld.y
      const next = applyResize(ix.origin, ix.handle, dx, dy, {
        snapOn,
        keepAspect: e.shiftKey || ix.keepAspect,
      })
      onResizeElement(ix.id, next)
      return
    }

    if (ix.mode === 'resize-group') {
      const dx = world.x - ix.startWorld.x
      const dy = world.y - ix.startWorld.y
      const proxy = {
        type: 'rect',
        x: ix.originBounds.x,
        y: ix.originBounds.y,
        w: ix.originBounds.w,
        h: ix.originBounds.h,
      }
      const next = applyResize(proxy, ix.handle, dx, dy, {
        snapOn,
        keepAspect: e.shiftKey || ix.keepAspect,
      })
      onResizeGroup(ix.ids, ix.originBounds, next)
    }
  }

  const onPointerUp = () => {
    const ix = interaction.current
    if (ix?.mode === 'marquee' && marquee) {
      const hits = elements
        .filter((el) =>
          rectsIntersect(marquee, {
            x: el.x,
            y: el.y,
            w: Math.abs(el.w) || 1,
            h: Math.abs(el.h) || 1,
          }),
        )
        .map((el) => el.id)
      const expanded = expandSelectionForGroups(elements, hits, editingGroupId)
      if (ix.additive) {
        onSelect([...new Set([...selectedIds, ...expanded])])
      } else {
        onSelect(expanded)
      }
      setMarquee(null)
    }
    if (ix?.mode === 'pan') setPanning(false)
    interaction.current = null
  }

  const cursor = spaceDown || panning ? (panning ? 'grabbing' : 'grab') : placeType ? 'crosshair' : 'default'

  return (
    <div
      ref={stageRef}
      className="canvas-stage"
      style={{ cursor }}
      onPointerDown={onStagePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="canvas-world"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        <div
          className={`artboard${editingGroupId ? ' is-editing-group' : ''}`}
          style={{
            width: artboard.width,
            height: artboard.height,
            backgroundImage: snapOn
              ? `linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
                 linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)`
              : 'none',
            backgroundSize: snapOn ? `${GRID_SIZE}px ${GRID_SIZE}px` : undefined,
          }}
        >
          {sortByZ(elements).map((el) => {
            const dimmed =
              editingGroupId && el.groupId !== editingGroupId
            return (
              <WireElement
                key={el.id}
                el={el}
                selected={selectedIds.includes(el.id)}
                onPointerDown={onElementPointerDown}
                dimmed={dimmed}
              />
            )
          })}
          {showGroupResize && bounds && (
            <SelectionOverlay bounds={bounds} zoom={zoom} onHandleDown={onHandleDown} />
          )}
          {!showGroupResize && selected.length > 1 && bounds && (
            <div
              className="selection-overlay selection-overlay--multi"
              style={{
                left: bounds.x,
                top: bounds.y,
                width: bounds.w,
                height: bounds.h,
              }}
            />
          )}
          {marquee && (
            <div
              className="marquee"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.w,
                height: marquee.h,
              }}
            />
          )}
        </div>
      </div>
      <div className="canvas-hint">
        {editingGroupId
          ? 'Editing group atoms · Esc to exit'
          : 'Pinch zoom · Scroll/drag pan · Shift-drag select · Double-click group to edit'}
      </div>
    </div>
  )
}
