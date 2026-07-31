import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  artboardAtPoint,
  elementWorldRect,
  getArtboardMap,
  localToWorld,
  pointInArtboard,
  worldToLocal,
} from '../lib/artboards'
import { GRID_SIZE, MAX_ZOOM, MIN_ZOOM } from '../lib/constants'
import { canGroup, expandSelectionForGroups, sharedGroupId } from '../lib/elements'
import {
  applyResize,
  getBounds,
  pointInElement,
  rectsIntersect,
  screenToWorld,
  snap,
  sortByZ,
} from '../lib/geometry'
import type {
  Artboard,
  PlaceType,
  Point,
  Rect,
  ResizeHandle,
  WireElement as WireElementModel,
} from '../lib/types'
import ActionMenu from './ActionMenu'
import WireElement, { SelectionOverlay } from './WireElement'

type ElementOrigin = {
  x: number
  y: number
  artboardId: string
  world: Point
}

type Interaction =
  | {
      mode: 'pan'
      startX: number
      startY: number
      origPan: Point
      historyRecorded?: boolean
    }
  | {
      mode: 'marquee'
      startX: number
      startY: number
      additive: boolean
      pointerId: number
      historyRecorded?: boolean
    }
  | {
      mode: 'move'
      startWorld: Point
      origins: Record<string, ElementOrigin>
      ids: string[]
      historyRecorded?: boolean
    }
  | {
      mode: 'resize'
      handle: ResizeHandle
      startWorld: Point
      origin: WireElementModel
      id: string
      keepAspect: boolean
      historyRecorded?: boolean
    }
  | {
      mode: 'resize-group'
      handle: ResizeHandle
      startWorld: Point
      originBounds: Rect
      origins: WireElementModel[]
      artboardId: string
      keepAspect: boolean
      historyRecorded?: boolean
    }
  | {
      mode: 'artboard-move'
      artboardId: string
      startWorld: Point
      origin: Point
      historyRecorded?: boolean
    }

type CanvasProps = {
  artboards: Artboard[]
  activeArtboardId: string
  elements: WireElementModel[]
  selectedIds: string[]
  artboardSelected: boolean
  snapOn: boolean
  placeType: PlaceType | null
  onSelect: (ids: string[]) => void
  onActiveArtboard: (id: string) => void
  onArtboardSelected: (selected: boolean) => void
  onMoveElements: (
    updates: { id: string; x: number; y: number; artboardId: string }[],
  ) => void
  onMoveArtboard: (id: string, x: number, y: number) => void
  onResizeElement: (id: string, box: Rect) => void
  onResizeGroup: (
    origins: WireElementModel[],
    oldBounds: Rect,
    newBounds: Rect,
  ) => void
  onEditStart: () => void
  onPlace: (type: PlaceType, x: number, y: number, artboardId: string) => void
  onClearPlace: () => void
  pan: Point
  zoom: number
  onPanChange: (pan: Point) => void
  onViewChange: (next: { pan?: Point; zoom?: number }) => void
  editingGroupId: string | null
  onEditGroup: (groupId: string | null) => void
  onGroup?: (ids?: string[]) => void
  onUngroup?: (groupId: string) => void
}

export default function Canvas({
  artboards,
  activeArtboardId,
  elements,
  selectedIds,
  artboardSelected,
  snapOn,
  placeType,
  onSelect,
  onActiveArtboard,
  onArtboardSelected,
  onMoveElements,
  onMoveArtboard,
  onResizeElement,
  onResizeGroup,
  onEditStart,
  onPlace,
  onClearPlace,
  pan,
  zoom,
  onPanChange,
  onViewChange,
  editingGroupId,
  onEditGroup,
  onGroup,
  onUngroup,
}: CanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null)
  const [draggingElements, setDraggingElements] = useState(false)
  const interaction = useRef<Interaction | null>(null)
  const lastClick = useRef<{ id: string | null; time: number }>({ id: null, time: 0 })
  const viewRef = useRef({ pan, zoom })
  const pinchActiveRef = useRef(false)
  const pinchIdleTimer = useRef(0)

  useEffect(() => {
    if (pinchActiveRef.current) return
    viewRef.current = { pan, zoom }
  }, [pan, zoom])

  const boardMap = getArtboardMap(artboards)
  const selected = elements.filter((e) => selectedIds.includes(e.id))
  const selectedBoardIds = [...new Set(selected.map((el) => el.artboardId))]
  const singleBoardSelection = selectedBoardIds.length === 1 ? selectedBoardIds[0] : null
  const selectionBoard = singleBoardSelection ? boardMap.get(singleBoardSelection) : null
  const bounds = selected.length && selectionBoard ? getBounds(selected) : null
  const groupSelected = sharedGroupId(elements, selectedIds)
  const showGroupResize = Boolean(bounds && (groupSelected || selected.length === 1))

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (
        e.code === 'Space' &&
        !e.repeat &&
        tag !== 'INPUT' &&
        tag !== 'TEXTAREA'
      ) {
        e.preventDefault()
        setSpaceDown(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return

    let raf = 0
    let pendingZoom: { clientX: number; clientY: number; factor: number } | null = null
    let pendingPan: { dx: number; dy: number } | null = null

    const applyView = (
      nextZoom: number | null,
      clientX: number,
      clientY: number,
      panDx: number,
      panDy: number,
    ) => {
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

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        pinchActiveRef.current = true
        window.clearTimeout(pinchIdleTimer.current)
        pinchIdleTimer.current = window.setTimeout(() => {
          pinchActiveRef.current = false
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

  const getStageRect = () => stageRef.current!.getBoundingClientRect()

  const hitTest = useCallback(
    (wx: number, wy: number) => {
      const world = { x: wx, y: wy }
      const boards = [
        ...artboards.filter((ab) => ab.id === activeArtboardId),
        ...[...artboards].reverse().filter((ab) => ab.id !== activeArtboardId),
      ]
      for (const ab of boards) {
        if (!pointInArtboard(ab, world)) continue
        const local = worldToLocal(ab, world)
        const boardEls = sortByZ(elements.filter((el) => el.artboardId === ab.id)).reverse()
        for (const el of boardEls) {
          if (pointInElement(local.x, local.y, el)) return el
        }
      }
      return null
    },
    [artboards, activeArtboardId, elements],
  )

  const resolvePlaceTarget = (world: Point) => {
    const board =
      artboardAtPoint(artboards, world, activeArtboardId) ||
      artboards.find((ab) => ab.id === activeArtboardId) ||
      artboards[0]
    if (!board) return null
    const local = worldToLocal(board, world)
    return { board, local }
  }

  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
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
      const target = resolvePlaceTarget(world)
      if (target) {
        onPlace(placeType, target.local.x, target.local.y, target.board.id)
        onActiveArtboard(target.board.id)
        onArtboardSelected(false)
      }
      onClearPlace()
      return
    }

    const hit = hitTest(world.x, world.y)
    if (hit) return

    const boardHit = artboardAtPoint(artboards, world, activeArtboardId)
    const additive = e.metaKey || e.ctrlKey
    const wantMarquee = e.shiftKey || additive

    if (boardHit && !wantMarquee) {
      onActiveArtboard(boardHit.id)
      onArtboardSelected(true)
      onSelect([])
      onEditGroup(null)
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

    if (!wantMarquee) {
      if (!additive) {
        onSelect([])
        onEditGroup(null)
        onArtboardSelected(false)
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
      onArtboardSelected(false)
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

  const onArtboardLabelDown = (e: ReactPointerEvent, artboardId: string) => {
    if (spaceDown || e.button === 1) return
    e.stopPropagation()
    e.preventDefault()
    onActiveArtboard(artboardId)
    onArtboardSelected(true)
    onSelect([])
    onEditGroup(null)
    const rect = getStageRect()
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)
    const ab = boardMap.get(artboardId)
    if (!ab) return
    interaction.current = {
      mode: 'artboard-move',
      artboardId,
      startWorld: world,
      origin: { x: ab.x, y: ab.y },
    }
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  const onElementPointerDown = (e: ReactPointerEvent, id: string) => {
    if (spaceDown || e.button === 1) return
    e.stopPropagation()
    e.preventDefault()

    const el = elements.find((x) => x.id === id)
    if (el) {
      onActiveArtboard(el.artboardId)
      onArtboardSelected(false)
    }

    const now = Date.now()
    const isDouble =
      lastClick.current.id === id && now - lastClick.current.time < 350 && Boolean(el?.groupId)
    lastClick.current = { id, time: now }

    const additive = e.metaKey || e.ctrlKey

    if (isDouble && el?.groupId) {
      onEditGroup(el.groupId)
      onSelect([id])
      return
    }

    if (!additive && editingGroupId && el?.groupId !== editingGroupId) {
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
    const origins: Record<string, ElementOrigin> = {}
    for (const item of elements) {
      if (!movingIds.includes(item.id)) continue
      const ab = boardMap.get(item.artboardId)
      if (!ab) continue
      origins[item.id] = {
        x: item.x,
        y: item.y,
        artboardId: item.artboardId,
        world: localToWorld(ab, { x: item.x, y: item.y }),
      }
    }

    interaction.current = {
      mode: 'move',
      startWorld: world,
      origins,
      ids: movingIds,
    }
    setDraggingElements(true)
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  const onHandleDown = (e: ReactPointerEvent, handle: ResizeHandle) => {
    e.stopPropagation()
    e.preventDefault()
    if (!showGroupResize || !bounds || !selectionBoard) return
    const rect = getStageRect()
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)

    if (groupSelected || selected.length > 1) {
      interaction.current = {
        mode: 'resize-group',
        handle,
        startWorld: world,
        originBounds: { ...bounds },
        origins: selected.map((el) => ({ ...el })),
        artboardId: selectionBoard.id,
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
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ix = interaction.current
    if (!ix) return
    const recordEdit = () => {
      if (ix.historyRecorded) return
      onEditStart()
      ix.historyRecorded = true
    }

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

    if (ix.mode === 'artboard-move') {
      recordEdit()
      let dx = world.x - ix.startWorld.x
      let dy = world.y - ix.startWorld.y
      if (snapOn) {
        const nx = snap(ix.origin.x + dx, true)
        const ny = snap(ix.origin.y + dy, true)
        dx = nx - ix.origin.x
        dy = ny - ix.origin.y
      }
      onMoveArtboard(ix.artboardId, ix.origin.x + dx, ix.origin.y + dy)
      return
    }

    if (ix.mode === 'move') {
      recordEdit()
      let dx = world.x - ix.startWorld.x
      let dy = world.y - ix.startWorld.y

      const firstId = ix.ids[0]
      const firstOrigin = firstId ? ix.origins[firstId] : null
      if (snapOn && firstOrigin) {
        const tentative = { x: firstOrigin.world.x + dx, y: firstOrigin.world.y + dy }
        const target =
          artboardAtPoint(artboards, tentative, activeArtboardId) ||
          boardMap.get(firstOrigin.artboardId)
        if (target) {
          const local = worldToLocal(target, tentative)
          const sx = snap(local.x, true)
          const sy = snap(local.y, true)
          const snappedWorld = localToWorld(target, { x: sx, y: sy })
          dx = snappedWorld.x - firstOrigin.world.x
          dy = snappedWorld.y - firstOrigin.world.y
        }
      }

      // Drop target from selection bounds center in world space
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const id of ix.ids) {
        const o = ix.origins[id]
        const el = elements.find((item) => item.id === id)
        if (!o || !el) continue
        const wx = o.world.x + dx
        const wy = o.world.y + dy
        minX = Math.min(minX, wx)
        minY = Math.min(minY, wy)
        maxX = Math.max(maxX, wx + Math.abs(el.w))
        maxY = Math.max(maxY, wy + Math.abs(el.h))
      }
      const center = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
      }
      const fallbackBoardId = firstOrigin?.artboardId || activeArtboardId
      const targetBoard =
        artboardAtPoint(artboards, center, activeArtboardId) ||
        boardMap.get(fallbackBoardId)

      if (!targetBoard) return

      const updates = ix.ids.map((id) => {
        const o = ix.origins[id]
        const worldPos = { x: o.world.x + dx, y: o.world.y + dy }
        const local = worldToLocal(targetBoard, worldPos)
        return {
          id,
          x: local.x,
          y: local.y,
          artboardId: targetBoard.id,
        }
      })
      onMoveElements(updates)
      onActiveArtboard(targetBoard.id)
      return
    }

    if (ix.mode === 'resize') {
      recordEdit()
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
      recordEdit()
      const dx = world.x - ix.startWorld.x
      const dy = world.y - ix.startWorld.y
      const proxy = {
        type: 'rect' as const,
        x: ix.originBounds.x,
        y: ix.originBounds.y,
        w: ix.originBounds.w,
        h: ix.originBounds.h,
      }
      const next = applyResize(proxy, ix.handle, dx, dy, {
        snapOn,
        keepAspect: e.shiftKey || ix.keepAspect,
      })
      onResizeGroup(ix.origins, ix.originBounds, next)
    }
  }

  const onPointerUp = () => {
    const ix = interaction.current
    if (ix?.mode === 'marquee' && marquee) {
      const hits = elements
        .filter((el) => {
          const ab = boardMap.get(el.artboardId)
          if (!ab) return false
          return rectsIntersect(marquee, elementWorldRect(el, ab))
        })
        .map((el) => el.id)
      const expanded = expandSelectionForGroups(elements, hits, editingGroupId)
      if (ix.additive) {
        onSelect([...new Set([...selectedIds, ...expanded])])
      } else {
        onSelect(expanded)
      }
      if (expanded.length) {
        const first = elements.find((el) => el.id === expanded[0])
        if (first) onActiveArtboard(first.artboardId)
        onArtboardSelected(false)
      }
      setMarquee(null)
    }
    if (ix?.mode === 'move') {
      // Cancel transfer if selection center is outside every artboard
      const firstId = ix.ids[0]
      const first = firstId ? elements.find((el) => el.id === firstId) : null
      const ab = first ? boardMap.get(first.artboardId) : null
      if (first && ab) {
        const center = {
          x: ab.x + first.x + Math.abs(first.w) / 2,
          y: ab.y + first.y + Math.abs(first.h) / 2,
        }
        const over = artboardAtPoint(artboards, center, activeArtboardId)
        if (!over) {
          const restores = ix.ids.map((id) => {
            const o = ix.origins[id]
            return { id, x: o.x, y: o.y, artboardId: o.artboardId }
          })
          onMoveElements(restores)
        }
      }
      setDraggingElements(false)
    }
    if (ix?.mode === 'pan') setPanning(false)
    interaction.current = null
  }

  const cursor = spaceDown || panning ? (panning ? 'grabbing' : 'grab') : placeType ? 'crosshair' : 'default'

  const openActions = (e: { preventDefault: () => void; clientX: number; clientY: number }, ids = selectedIds) => {
    e.preventDefault()
    if (!ids.length) return
    setMenu({ x: e.clientX, y: e.clientY, ids })
  }

  const menuIds = menu?.ids || selectedIds
  const menuGroupId = sharedGroupId(elements, menuIds)
  const menuItems = [
    {
      id: 'group',
      label: 'Group',
      disabled: !canGroup(elements, menuIds),
      onSelect: () => onGroup?.(menuIds),
    },
    {
      id: 'ungroup',
      label: 'Ungroup',
      disabled: !menuGroupId,
      onSelect: () => menuGroupId && onUngroup?.(menuGroupId),
    },
  ]

  return (
    <div
      ref={stageRef}
      className="canvas-stage"
      style={{ cursor }}
      onPointerDown={onStagePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => {
        const rect = getStageRect()
        const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)
        const hit = hitTest(world.x, world.y)
        if (!hit) {
          setMenu(null)
          return
        }
        let ids = selectedIds
        if (!selectedIds.includes(hit.id)) {
          ids = expandSelectionForGroups(elements, [hit.id], editingGroupId)
          onSelect(ids)
          onArtboardSelected(false)
        }
        openActions(e, ids)
      }}
    >
      <div
        className="canvas-world"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {artboards.map((ab) => {
          const boardEls = elements.filter((el) => el.artboardId === ab.id)
          const isActive = ab.id === activeArtboardId
          const boardSelected = isActive && artboardSelected && !selectedIds.length
          const boardBounds =
            isActive && singleBoardSelection === ab.id && bounds ? bounds : null
          return (
            <div
              key={ab.id}
              className="artboard-frame"
              style={{ left: ab.x, top: ab.y, width: ab.width, height: ab.height }}
            >
              <button
                type="button"
                className={`artboard-label${isActive ? ' is-active' : ''}`}
                onPointerDown={(e) => onArtboardLabelDown(e, ab.id)}
              >
                {ab.name}
                <span className="artboard-label-size">
                  {ab.width}×{ab.height}
                </span>
              </button>
              <div
                className={`artboard${editingGroupId && isActive ? ' is-editing-group' : ''}${
                  boardSelected ? ' is-artboard-selected' : ''
                }${isActive ? ' is-active' : ''}${draggingElements ? ' is-dragging-elements' : ''}`}
                style={{
                  width: ab.width,
                  height: ab.height,
                  backgroundImage: snapOn
                    ? `linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
                       linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)`
                    : 'none',
                  backgroundSize: snapOn ? `${GRID_SIZE}px ${GRID_SIZE}px` : undefined,
                }}
              >
                {sortByZ(boardEls).map((el) => {
                  const dimmed = Boolean(
                    editingGroupId && isActive && el.groupId !== editingGroupId,
                  )
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
                {showGroupResize && boardBounds && (
                  <SelectionOverlay bounds={boardBounds} zoom={zoom} onHandleDown={onHandleDown} />
                )}
                {!showGroupResize && selected.length > 1 && boardBounds && (
                  <div
                    className="selection-overlay selection-overlay--multi"
                    style={{
                      left: boardBounds.x,
                      top: boardBounds.y,
                      width: boardBounds.w,
                      height: boardBounds.h,
                    }}
                  />
                )}
              </div>
            </div>
          )
        })}
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
      <div className="canvas-hint">
        {editingGroupId
          ? 'Editing group atoms · Esc to exit'
          : 'Drag label to move artboard · Drag elements between boards · Pinch zoom · Shift-drag select'}
      </div>
      {menu && (
        <ActionMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}
