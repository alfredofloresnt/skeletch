import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  artboardAtPoint,
  elementWorldRect,
  getArtboardMap,
  localToWorld,
  pointInArtboard,
  worldToLocal,
} from '../lib/artboards'
import { GRID_SIZE, MAX_ZOOM, MIN_ZOOM } from '../lib/constants'
import {
  canGroup,
  drawnShapeBox,
  expandSelectionForGroups,
  sharedGroupId,
} from '../lib/elements'
import {
  angleOfPoint,
  applyResize,
  applyRotationAroundCenter,
  boundsCenter,
  cornerRadiusFromPointer,
  elementCenter,
  getBounds,
  normalizeRect,
  pointInElement,
  rectsIntersect,
  rotatedAabb,
  screenToWorld,
  snap,
  sortByZ,
  toElementLocal,
  type CornerHandle,
} from '../lib/geometry'
import {
  denormalizePathVertices,
  fitPathElement,
  isNearVertex,
  normalizePathVertices,
  pathVerticesToD,
  snapPointTo45,
} from '../lib/pathGeometry'
import { hasSvgTransfer, readSvgFromTransfer } from '../lib/importSvg'
import type {
  Artboard,
  DrawTool,
  PathVertex,
  PenDraft,
  PlaceTool,
  Point,
  Rect,
  ResizeHandle,
  WireElement as WireElementModel,
} from '../lib/types'
import { isDrawTool, isPathTool } from '../lib/types'
import ActionMenu from './ActionMenu'
import PathEditOverlay from './PathEditOverlay'
import WireElement, { SelectionOverlay } from './WireElement'

const PEN_CLOSE_SCREEN_PX = 10
const PEN_HANDLE_DRAG_PX = 4
/** Screen px the pointer must travel before a press on an element becomes a drag. */
const MOVE_DRAG_PX = 3

type DrawPreview = {
  artboardId: string
  tool: DrawTool
  x: number
  y: number
  w: number
  h: number
}

function DrawPreviewOverlay({ preview }: { preview: DrawPreview }) {
  const { tool, x, y, w, h } = preview
  if (tool === 'line') {
    const minX = Math.min(0, w)
    const minY = Math.min(0, h)
    const boxW = Math.max(Math.abs(w), 1)
    const boxH = Math.max(Math.abs(h), 1)
    return (
      <div
        className="draw-preview draw-preview--line"
        style={{ left: x + minX, top: y + minY, width: boxW, height: boxH }}
      >
        <svg className="el-svg" width={boxW} height={boxH}>
          <line
            x1={0 - minX}
            y1={0 - minY}
            x2={w - minX}
            y2={h - minY}
            stroke="currentColor"
            strokeWidth={2}
          />
        </svg>
      </div>
    )
  }

  if (tool === 'triangle') {
    const tw = Math.max(w, 1)
    const th = Math.max(h, 1)
    return (
      <div
        className="draw-preview draw-preview--triangle"
        style={{ left: x, top: y, width: tw, height: th }}
      >
        <svg className="el-svg" width={tw} height={th} viewBox={`0 0 ${tw} ${th}`}>
          <polygon
            points={`${tw / 2},1 ${tw - 1},${th - 1} 1,${th - 1}`}
            fill="rgba(31, 111, 235, 0.08)"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    )
  }

  return (
    <div
      className={`draw-preview draw-preview--${tool}`}
      style={{ left: x, top: y, width: Math.max(w, 1), height: Math.max(h, 1) }}
    />
  )
}

function PenDraftOverlay({
  draft,
  zoom,
}: {
  draft: PenDraft
  zoom: number
}) {
  const { vertices, cursor, draggingHandle } = draft
  const closeThreshold = PEN_CLOSE_SCREEN_PX / zoom
  const canClose = vertices.length >= 3
  const nearClose =
    canClose && cursor ? isNearVertex(cursor, vertices[0], closeThreshold) : false

  const previewVerts: PathVertex[] = [...vertices]
  if (cursor && !draggingHandle && vertices.length) {
    previewVerts.push({ x: cursor.x, y: cursor.y })
  }
  const d = pathVerticesToD(previewVerts, false)
  const last = vertices[vertices.length - 1]

  return (
    <div className="pen-draft-overlay">
      {d ? (
        <svg className="pen-draft-svg" style={{ overflow: 'visible' }}>
          <path
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      {draggingHandle && last?.out ? (
        <>
          <div
            className="path-edit-handle-line"
            style={{
              left: last.x,
              top: last.y,
              width: Math.hypot(last.out.x, last.out.y),
              transform: `rotate(${Math.atan2(last.out.y, last.out.x)}rad)`,
            }}
          />
          <div
            className="path-edit-handle-line"
            style={{
              left: last.x,
              top: last.y,
              width: Math.hypot(last.out.x, last.out.y),
              transform: `rotate(${Math.atan2(-last.out.y, -last.out.x)}rad)`,
            }}
          />
        </>
      ) : null}
      {vertices.map((v, i) => (
        <div
          key={i}
          className={`pen-draft-anchor${i === 0 && nearClose ? ' is-close-target' : ''}`}
          style={{
            left: v.x,
            top: v.y,
            transform: `translate(-50%, -50%) scale(${1 / zoom})`,
          }}
        />
      ))}
    </div>
  )
}

function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const maxY = Math.max(...rects.map((r) => r.y + r.h))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

type SelectionOutline = {
  key: string
  artboardId: string
  box: Rect
  rotation: number
}

/** One outline per selected unit (loose element or whole group) when several are selected. */
function selectionOutlines(
  selected: WireElementModel[],
  editingGroupId: string | null,
): SelectionOutline[] {
  if (selected.length < 2) return []
  const units = new Map<string, WireElementModel[]>()
  for (const el of selected) {
    const key = el.groupId && el.groupId !== editingGroupId ? `g:${el.groupId}` : el.id
    units.set(key, [...(units.get(key) || []), el])
  }
  if (units.size < 2) return []
  return [...units.entries()].map(([key, els]) => {
    if (els.length === 1) {
      const el = els[0]
      return {
        key,
        artboardId: el.artboardId,
        box: el.type === 'line' ? normalizeRect(el.x, el.y, el.w, el.h) : { x: el.x, y: el.y, w: el.w, h: el.h },
        rotation: el.rotation || 0,
      }
    }
    return {
      key,
      artboardId: els[0].artboardId,
      box: unionRects(els.map(rotatedAabb))!,
      rotation: 0,
    }
  })
}

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
      startClient: Point
      /** Artboard to select if the press ends without dragging. */
      clickArtboardId: string | null
      /** Past the drag threshold; until then the press is treated as a click. */
      dragged?: boolean
      additive: boolean
      pointerId: number
      historyRecorded?: boolean
    }
  | {
      mode: 'move'
      startWorld: Point
      startClient: Point
      origins: Record<string, ElementOrigin>
      ids: string[]
      /** Past the drag threshold; until then the press is treated as a click. */
      moved?: boolean
      /** Selection to narrow to if the press ends without dragging. */
      collapseTo?: string[]
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
  | {
      mode: 'corner-radius'
      id: string
      corner: CornerHandle
      bounds: Rect
      artboardId: string
      historyRecorded?: boolean
    }
  | {
      mode: 'rotate'
      ids: string[]
      center: Point
      startAngle: number
      origins: WireElementModel[]
      artboardId: string
      historyRecorded?: boolean
    }
  | {
      mode: 'draw'
      tool: DrawTool
      artboardId: string
      startLocal: Point
      startClient: Point
      shiftKey: boolean
      historyRecorded?: boolean
    }
  | {
      mode: 'pen-handle'
      artboardId: string
      startClient: Point
      vertexIndex: number
      shiftKey: boolean
      historyRecorded?: boolean
    }

type CanvasProps = {
  artboards: Artboard[]
  activeArtboardId: string
  elements: WireElementModel[]
  selectedIds: string[]
  artboardSelected: boolean
  snapOn: boolean
  placeTool: PlaceTool | null
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
  onCornerRadiusChange: (id: string, cornerRadius: number) => void
  onRotateElements: (
    updates: { id: string; x: number; y: number; rotation: number }[],
  ) => void
  onEditStart: () => void
  onPlace: (
    tool: PlaceTool,
    x: number,
    y: number,
    artboardId: string,
    size?: { w: number; h: number },
  ) => void
  onClearPlace: () => void
  pan: Point
  zoom: number
  onPanChange: (pan: Point) => void
  onViewChange: (next: { pan?: Point; zoom?: number }) => void
  editingGroupId: string | null
  onEditGroup: (groupId: string | null) => void
  editingTextId: string | null
  onEditText: (id: string) => void
  onCommitText: (id: string, text: string) => void
  onCancelTextEdit: (id: string) => void
  editingPathId: string | null
  onEditPath: (id: string | null) => void
  onUpdatePathElement: (id: string, patch: Partial<WireElementModel>) => void
  penDraft: PenDraft | null
  onPenDraftChange: (draft: PenDraft | null) => void
  onCommitPenPath: (closed: boolean) => void
  onImportSvg: (svgText: string, artboardId: string, center?: Point) => void
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
  placeTool,
  onSelect,
  onActiveArtboard,
  onArtboardSelected,
  onMoveElements,
  onMoveArtboard,
  onResizeElement,
  onResizeGroup,
  onCornerRadiusChange,
  onRotateElements,
  onEditStart,
  onPlace,
  onClearPlace,
  pan,
  zoom,
  onPanChange,
  onViewChange,
  editingGroupId,
  onEditGroup,
  editingTextId,
  onEditText,
  onCommitText,
  onCancelTextEdit,
  editingPathId,
  onEditPath,
  onUpdatePathElement,
  penDraft,
  onPenDraftChange,
  onCommitPenPath,
  onImportSvg,
  onGroup,
  onUngroup,
}: CanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [drawPreview, setDrawPreview] = useState<DrawPreview | null>(null)
  const [svgDragOver, setSvgDragOver] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null)
  const [draggingElements, setDraggingElements] = useState(false)
  const interaction = useRef<Interaction | null>(null)
  const lastClick = useRef<{ id: string | null; time: number }>({ id: null, time: 0 })
  const lastEmptyClick = useRef(0)
  const penDraftRef = useRef(penDraft)
  penDraftRef.current = penDraft
  const pathEditLocalRef = useRef<PathVertex[] | null>(null)
  const viewRef = useRef({ pan, zoom })
  const pinchActiveRef = useRef(false)
  const pinchIdleTimer = useRef(0)
  const worldRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pinchActiveRef.current) return
    viewRef.current = { pan, zoom }
  }, [pan, zoom])

  useEffect(() => {
    const blockFileNavigation = (e: DragEvent) => {
      if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) {
        e.preventDefault()
      }
    }
    window.addEventListener('dragover', blockFileNavigation)
    window.addEventListener('drop', blockFileNavigation)
    return () => {
      window.removeEventListener('dragover', blockFileNavigation)
      window.removeEventListener('drop', blockFileNavigation)
    }
  }, [])

  const boardMap = getArtboardMap(artboards)
  const selected = elements.filter((e) => selectedIds.includes(e.id))
  const selectedBoardIds = [...new Set(selected.map((el) => el.artboardId))]
  const singleBoardSelection = selectedBoardIds.length === 1 ? selectedBoardIds[0] : null
  const selectionBoard = singleBoardSelection ? boardMap.get(singleBoardSelection) : null
  const multiSelected = selected.length > 1
  // Several elements share one box that encloses their rotated extents.
  const bounds =
    selected.length && selectionBoard
      ? multiSelected
        ? unionRects(selected.map(rotatedAabb))
        : getBounds(selected)
      : null
  const groupSelected = sharedGroupId(elements, selectedIds)
  const showGroupResize = Boolean(bounds && !editingPathId)
  const outlines = selectionOutlines(selected, editingGroupId)
  const singleRect =
    !groupSelected && selected.length === 1 && selected[0].type === 'rect' ? selected[0] : null

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
        // Promote the world to its own layer only while zooming: smooth scaling during
        // the gesture, then a crisp re-raster at the final zoom once it settles.
        worldRef.current?.classList.add('is-zooming')
        window.clearTimeout(pinchIdleTimer.current)
        pinchIdleTimer.current = window.setTimeout(() => {
          pinchActiveRef.current = false
          worldRef.current?.classList.remove('is-zooming')
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

  const onSvgDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasSvgTransfer(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setSvgDragOver(true)
  }

  const onSvgDrop = async (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasSvgTransfer(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    setSvgDragOver(false)
    const svgText = await readSvgFromTransfer(e.dataTransfer)
    if (!svgText) return
    const world = screenToWorld(e.clientX, e.clientY, getStageRect(), pan, zoom)
    const target = resolvePlaceTarget(world)
    if (!target) return
    onImportSvg(svgText, target.board.id, target.local)
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

    // The first canvas click while typing only commits the current text.
    // It must not also trigger the still-active draw tool.
    if (editingTextId) {
      interaction.current = null
      setDrawPreview(null)
      return
    }

    if (editingPathId) {
      onEditPath(null)
      interaction.current = null
      return
    }

    const rect = getStageRect()
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)

    if (placeTool) {
      const target = resolvePlaceTarget(world)
      if (!target) {
        if (!isDrawTool(placeTool) && !isPathTool(placeTool)) onClearPlace()
        return
      }

      if (isPathTool(placeTool)) {
        onActiveArtboard(target.board.id)
        onArtboardSelected(false)
        onSelect([])
        onEditGroup(null)

        const draft = penDraftRef.current
        const closeThreshold = PEN_CLOSE_SCREEN_PX / zoom
        let point = { ...target.local }
        if (e.shiftKey && draft?.vertices.length) {
          const prev = draft.vertices[draft.vertices.length - 1]
          point = snapPointTo45(prev, point)
        }
        if (snapOn) {
          point = { x: snap(point.x, true), y: snap(point.y, true) }
        }

        // Double-click empty finishes an open path
        const now = Date.now()
        const emptyDouble = now - lastEmptyClick.current < 350
        lastEmptyClick.current = now
        if (
          emptyDouble &&
          draft &&
          draft.artboardId === target.board.id &&
          draft.vertices.length >= 2 &&
          !(draft.vertices.length >= 3 && isNearVertex(point, draft.vertices[0], closeThreshold))
        ) {
          onCommitPenPath(false)
          return
        }

        if (draft && draft.artboardId === target.board.id) {
          if (
            draft.vertices.length >= 3 &&
            isNearVertex(point, draft.vertices[0], closeThreshold)
          ) {
            onCommitPenPath(true)
            return
          }
          const nextVerts = [...draft.vertices, { x: point.x, y: point.y }]
          onPenDraftChange({
            artboardId: target.board.id,
            vertices: nextVerts,
            cursor: point,
            draggingHandle: true,
          })
          interaction.current = {
            mode: 'pen-handle',
            artboardId: target.board.id,
            startClient: { x: e.clientX, y: e.clientY },
            vertexIndex: nextVerts.length - 1,
            shiftKey: e.shiftKey,
          }
          e.currentTarget.setPointerCapture(e.pointerId)
          return
        }

        onPenDraftChange({
          artboardId: target.board.id,
          vertices: [{ x: point.x, y: point.y }],
          cursor: point,
          draggingHandle: true,
        })
        interaction.current = {
          mode: 'pen-handle',
          artboardId: target.board.id,
          startClient: { x: e.clientX, y: e.clientY },
          vertexIndex: 0,
          shiftKey: e.shiftKey,
        }
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }

      if (isDrawTool(placeTool)) {
        onActiveArtboard(target.board.id)
        onArtboardSelected(false)
        onSelect([])
        onEditGroup(null)
        interaction.current = {
          mode: 'draw',
          tool: placeTool,
          artboardId: target.board.id,
          startLocal: { ...target.local },
          startClient: { x: e.clientX, y: e.clientY },
          shiftKey: e.shiftKey,
        }
        setDrawPreview({
          artboardId: target.board.id,
          tool: placeTool,
          x: target.local.x,
          y: target.local.y,
          w: 0,
          h: 0,
        })
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }

      onPlace(placeTool, target.local.x, target.local.y, target.board.id)
      onActiveArtboard(target.board.id)
      onArtboardSelected(false)
      onClearPlace()
      return
    }

    const hit = hitTest(world.x, world.y)
    if (hit) return

    // Empty space: drag draws a selection marquee; a plain click selects the artboard
    // under the pointer (or clears the selection off-board). Pan is Space / middle drag.
    const boardHit = artboardAtPoint(artboards, world, activeArtboardId)
    const additive = e.shiftKey || e.metaKey || e.ctrlKey

    if (!additive) {
      onSelect([])
      onEditGroup(null)
      onArtboardSelected(false)
    }

    interaction.current = {
      mode: 'marquee',
      startX: world.x,
      startY: world.y,
      startClient: { x: e.clientX, y: e.clientY },
      clickArtboardId: boardHit?.id ?? null,
      additive,
      pointerId: e.pointerId,
    }
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
    // Draw / pen tools paint over existing elements (bubble to stage).
    if (isDrawTool(placeTool) || isPathTool(placeTool)) return
    e.stopPropagation()
    e.preventDefault()

    const el = elements.find((x) => x.id === id)
    if (el) {
      onActiveArtboard(el.artboardId)
      onArtboardSelected(false)
    }

    if (editingTextId === id) {
      e.stopPropagation()
      return
    }

    if (editingPathId === id) {
      e.stopPropagation()
      return
    }

    const now = Date.now()
    const isDouble = lastClick.current.id === id && now - lastClick.current.time < 350
    lastClick.current = { id, time: now }

    const additive = e.metaKey || e.ctrlKey || e.shiftKey

    if (isDouble && el?.type === 'text') {
      onEditText(id)
      onSelect([id])
      return
    }

    if (isDouble && el?.type === 'path') {
      onEditPath(id)
      onSelect([id])
      return
    }

    if (isDouble && el?.groupId) {
      onEditGroup(el.groupId)
      onSelect([id])
      return
    }

    if (!additive && editingGroupId && el?.groupId !== editingGroupId) {
      onEditGroup(null)
    }

    const seed = expandSelectionForGroups(elements, [id], editingGroupId)
    const seedSelected = seed.every((x) => selectedIds.includes(x))

    let movingIds = seed
    let collapseTo: string[] | undefined
    if (additive) {
      const nextSelected = seedSelected
        ? selectedIds.filter((x) => !seed.includes(x))
        : [...new Set([...selectedIds, ...seed])]
      onSelect(nextSelected)
      // Deselecting with a modifier is a click, not the start of a drag.
      if (seedSelected) return
      movingIds = nextSelected
    } else if (seedSelected) {
      // Pressing an already-selected element drags the whole selection;
      // a plain click (no drag) narrows the selection to that element.
      movingIds = selectedIds
      if (selectedIds.length !== seed.length) collapseTo = seed
    } else {
      onSelect(seed)
    }

    startMove(e, movingIds, collapseTo)
  }

  const startMove = (
    e: ReactPointerEvent,
    movingIds: string[],
    collapseTo?: string[],
  ) => {
    const rect = getStageRect()
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)
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
      startClient: { x: e.clientX, y: e.clientY },
      origins,
      ids: movingIds,
      collapseTo,
    }
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  /** Press inside a multi-selection box: hit elements behave as usual, gaps drag the selection. */
  const onSelectionBodyDown = (e: ReactPointerEvent) => {
    if (spaceDown || e.button !== 0) return
    const rect = getStageRect()
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)
    const hit = hitTest(world.x, world.y)
    if (hit) {
      onElementPointerDown(e, hit.id)
      return
    }
    // Modifier presses fall through to the stage (marquee).
    if (e.shiftKey || e.metaKey || e.ctrlKey) return
    e.stopPropagation()
    e.preventDefault()
    startMove(e, selectedIds)
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

  const onRotateDown = (e: ReactPointerEvent, _handle: ResizeHandle) => {
    e.stopPropagation()
    e.preventDefault()
    if (!selected.length || !selectionBoard || !bounds) return
    if (selectedBoardIds.length !== 1) return
    const rect = getStageRect()
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)
    const artboardLocal = worldToLocal(selectionBoard, world)
    const center =
      selected.length === 1 ? elementCenter(selected[0]) : boundsCenter(bounds)
    interaction.current = {
      mode: 'rotate',
      ids: selected.map((el) => el.id),
      center,
      startAngle: angleOfPoint(center, artboardLocal),
      origins: selected.map((el) => ({ ...el })),
      artboardId: selectionBoard.id,
    }
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  const onCornerRadiusDown = (e: ReactPointerEvent, corner: CornerHandle) => {
    e.stopPropagation()
    e.preventDefault()
    if (!singleRect || !bounds) return
    interaction.current = {
      mode: 'corner-radius',
      id: singleRect.id,
      corner,
      bounds: { ...bounds },
      artboardId: singleRect.artboardId,
    }
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ix = interaction.current
    const rect = getStageRect()
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom)

    // Rubber-band cursor while pen drafting (no active pointer capture)
    if (!ix && isPathTool(placeTool) && penDraftRef.current) {
      const draft = penDraftRef.current
      const ab = boardMap.get(draft.artboardId)
      if (!ab) return
      let local = worldToLocal(ab, world)
      if (e.shiftKey && draft.vertices.length) {
        local = snapPointTo45(draft.vertices[draft.vertices.length - 1], local)
      }
      onPenDraftChange({ ...draft, cursor: local })
      return
    }

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

    if (ix.mode === 'marquee') {
      if (!ix.dragged) {
        const cdx = e.clientX - ix.startClient.x
        const cdy = e.clientY - ix.startClient.y
        if (cdx * cdx + cdy * cdy < MOVE_DRAG_PX * MOVE_DRAG_PX) return
        ix.dragged = true
      }
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
      if (!ix.moved) {
        const cdx = e.clientX - ix.startClient.x
        const cdy = e.clientY - ix.startClient.y
        if (cdx * cdx + cdy * cdy < MOVE_DRAG_PX * MOVE_DRAG_PX) return
        ix.moved = true
        setDraggingElements(true)
      }
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
      const ab = boardMap.get(ix.origin.artboardId)
      let dx = world.x - ix.startWorld.x
      let dy = world.y - ix.startWorld.y
      if (ab && (ix.origin.rotation || 0)) {
        const startLocal = toElementLocal(worldToLocal(ab, ix.startWorld), ix.origin)
        const nowLocal = toElementLocal(worldToLocal(ab, world), ix.origin)
        dx = nowLocal.x - startLocal.x
        dy = nowLocal.y - startLocal.y
      }
      const next = applyResize(ix.origin, ix.handle, dx, dy, {
        snapOn,
        keepAspect: e.shiftKey || ix.keepAspect,
      })
      onResizeElement(ix.id, next)
      return
    }

    if (ix.mode === 'rotate') {
      recordEdit()
      const ab = boardMap.get(ix.artboardId)
      if (!ab) return
      const local = worldToLocal(ab, world)
      const angle = angleOfPoint(ix.center, local)
      let delta = angle - ix.startAngle
      if (snapOn) {
        const base = ix.origins[0]?.rotation || 0
        delta = snap(base + delta, true, 15) - base
      }
      const rotated = applyRotationAroundCenter(ix.origins, ix.center, delta)
      onRotateElements(
        rotated.map((el) => ({
          id: el.id,
          x: el.x,
          y: el.y,
          rotation: el.rotation || 0,
        })),
      )
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
      return
    }

    if (ix.mode === 'corner-radius') {
      recordEdit()
      const ab = boardMap.get(ix.artboardId)
      if (!ab) return
      const el = elements.find((item) => item.id === ix.id)
      if (!el) return
      const artboardLocal = worldToLocal(ab, world)
      const local = toElementLocal(artboardLocal, el)
      let radius = cornerRadiusFromPointer(local, ix.bounds, ix.corner)
      if (snapOn) radius = snap(radius, true)
      onCornerRadiusChange(ix.id, radius)
      return
    }

    if (ix.mode === 'draw') {
      ix.shiftKey = e.shiftKey
      const ab = boardMap.get(ix.artboardId)
      if (!ab) return
      const local = worldToLocal(ab, world)
      const box = drawnShapeBox(ix.tool, ix.startLocal, local, {
        shiftKey: e.shiftKey,
        snapOn,
      })
      setDrawPreview({
        artboardId: ix.artboardId,
        tool: ix.tool,
        ...box,
      })
      return
    }

    if (ix.mode === 'pen-handle') {
      const draft = penDraftRef.current
      const ab = boardMap.get(ix.artboardId)
      if (!draft || !ab) return
      let local = worldToLocal(ab, world)
      const dx = e.clientX - ix.startClient.x
      const dy = e.clientY - ix.startClient.y
      const dragged = dx * dx + dy * dy >= PEN_HANDLE_DRAG_PX * PEN_HANDLE_DRAG_PX
      const verts = draft.vertices.map((v) => ({
        ...v,
        in: v.in ? { ...v.in } : undefined,
        out: v.out ? { ...v.out } : undefined,
      }))
      const v = verts[ix.vertexIndex]
      if (!v) return
      if (dragged) {
        if (e.shiftKey && ix.vertexIndex > 0) {
          local = snapPointTo45(verts[ix.vertexIndex - 1], local)
        }
        const out = { x: local.x - v.x, y: local.y - v.y }
        v.out = out
        v.in = { x: -out.x, y: -out.y }
      }
      onPenDraftChange({
        artboardId: draft.artboardId,
        vertices: verts,
        cursor: local,
        draggingHandle: true,
      })
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ix = interaction.current
    if (ix?.mode === 'pen-handle') {
      const draft = penDraftRef.current
      if (draft) {
        onPenDraftChange({
          ...draft,
          draggingHandle: false,
          cursor: draft.vertices[draft.vertices.length - 1]
            ? { ...draft.vertices[draft.vertices.length - 1] }
            : draft.cursor,
        })
      }
      interaction.current = null
      return
    }
    if (ix?.mode === 'draw') {
      const ab = boardMap.get(ix.artboardId)
      const dx = e.clientX - ix.startClient.x
      const dy = e.clientY - ix.startClient.y
      const dragged = dx * dx + dy * dy >= 16
      if (ab) {
        if (dragged) {
          const local = worldToLocal(
            ab,
            screenToWorld(e.clientX, e.clientY, getStageRect(), pan, zoom),
          )
          const box = drawnShapeBox(ix.tool, ix.startLocal, local, {
            shiftKey: e.shiftKey || ix.shiftKey,
            snapOn,
          })
          onPlace(ix.tool, box.x, box.y, ix.artboardId, { w: box.w, h: box.h })
        } else {
          onPlace(ix.tool, ix.startLocal.x, ix.startLocal.y, ix.artboardId)
        }
        onActiveArtboard(ix.artboardId)
        onArtboardSelected(false)
        // Back to Select so the new element can be moved right away.
        onClearPlace()
      }
      setDrawPreview(null)
      interaction.current = null
      return
    }
    if (ix?.mode === 'marquee' && !ix.dragged) {
      if (ix.clickArtboardId && !ix.additive) {
        onActiveArtboard(ix.clickArtboardId)
        onArtboardSelected(true)
      }
    } else if (ix?.mode === 'marquee' && marquee) {
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
    if (ix?.mode === 'move' && !ix.moved) {
      if (ix.collapseTo) onSelect(ix.collapseTo)
    } else if (ix?.mode === 'move') {
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

  const cursor = spaceDown || panning ? (panning ? 'grabbing' : 'grab') : placeTool ? 'crosshair' : 'default'
  // Pan / placement cursors win over the per-element "move" cursor.
  const cursorLocked = cursor !== 'default'

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
      className={`canvas-stage${svgDragOver ? ' is-svg-drag-over' : ''}${
        cursorLocked ? ' is-cursor-locked' : ''
      }`}
      style={{ cursor }}
      onPointerDown={onStagePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragOver={onSvgDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSvgDragOver(false)
      }}
      onDrop={onSvgDrop}
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
        ref={worldRef}
        className="canvas-world"
        style={
          {
            // Whole-pixel pan keeps 1px strokes and text off subpixel boundaries.
            transform: `translate(${Math.round(pan.x)}px, ${Math.round(pan.y)}px) scale(${zoom})`,
            '--zoom-inv': 1 / zoom,
          } as CSSProperties
        }
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
                    ? `linear-gradient(to right, rgba(0,0,0,0.06) var(--hairline), transparent var(--hairline)),
                       linear-gradient(to bottom, rgba(0,0,0,0.06) var(--hairline), transparent var(--hairline))`
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
                      editing={editingTextId === el.id}
                      onPointerDown={onElementPointerDown}
                      onCommitText={onCommitText}
                      onCancelTextEdit={onCancelTextEdit}
                      dimmed={dimmed}
                    />
                  )
                })}
                {drawPreview && drawPreview.artboardId === ab.id && (
                  <DrawPreviewOverlay preview={drawPreview} />
                )}
                {penDraft && penDraft.artboardId === ab.id && (
                  <PenDraftOverlay draft={penDraft} zoom={zoom} />
                )}
                {editingPathId &&
                  (() => {
                    const pathEl = boardEls.find((el) => el.id === editingPathId)
                    if (!pathEl || pathEl.type !== 'path' || !pathEl.pathVertices?.length) {
                      return null
                    }
                    const localVerts = denormalizePathVertices(pathEl.pathVertices, {
                      x: pathEl.x,
                      y: pathEl.y,
                      w: pathEl.w,
                      h: pathEl.h,
                    })
                    return (
                      <PathEditOverlay
                        vertices={localVerts}
                        zoom={zoom}
                        onDragStart={() => {
                          pathEditLocalRef.current = localVerts
                          onEditStart()
                        }}
                        onDrag={(verts) => {
                          pathEditLocalRef.current = verts
                          const box = { x: pathEl.x, y: pathEl.y, w: pathEl.w, h: pathEl.h }
                          onUpdatePathElement(pathEl.id, {
                            pathVertices: normalizePathVertices(verts, box),
                          })
                        }}
                        onDragEnd={() => {
                          const local = pathEditLocalRef.current
                          pathEditLocalRef.current = null
                          if (!local?.length) return
                          const fitted = fitPathElement(local, Boolean(pathEl.pathClosed))
                          if (!fitted) return
                          onUpdatePathElement(pathEl.id, {
                            x: fitted.bounds.x,
                            y: fitted.bounds.y,
                            w: fitted.bounds.w,
                            h: fitted.bounds.h,
                            pathVertices: fitted.pathVertices,
                          })
                        }}
                      />
                    )
                  })()}
                {showGroupResize && boardBounds && !editingTextId && !editingPathId && (
                  <SelectionOverlay
                    bounds={boardBounds}
                    zoom={zoom}
                    onHandleDown={onHandleDown}
                    showCornerRadius={Boolean(singleRect && singleBoardSelection === ab.id)}
                    cornerRadius={singleRect?.cornerRadius || 0}
                    onCornerRadiusDown={onCornerRadiusDown}
                    showRotateHandles={singleBoardSelection === ab.id}
                    onRotateDown={onRotateDown}
                    onBodyDown={multiSelected && !placeTool ? onSelectionBodyDown : undefined}
                    rotation={
                      !groupSelected && selected.length === 1 && singleBoardSelection === ab.id
                        ? selected[0].rotation || 0
                        : 0
                    }
                  />
                )}
                {!editingTextId &&
                  outlines
                    .filter((o) => o.artboardId === ab.id)
                    .map((o) => (
                      <div
                        key={o.key}
                        className="selection-item-outline"
                        style={{
                          left: o.box.x,
                          top: o.box.y,
                          width: o.box.w,
                          height: o.box.h,
                          transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined,
                        }}
                      />
                    ))}
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
        {editingTextId
          ? 'Typing · Esc to cancel · Click away to commit'
          : editingPathId
            ? 'Editing path · Drag anchors/handles · Esc to exit'
            : penDraft
              ? 'Path · Click anchors · Drag for curves · Enter to finish · Esc cancels'
              : editingGroupId
                ? 'Editing group atoms · Esc to exit'
                : isPathTool(placeTool)
                  ? 'Path · Click to place anchors · Drag for curves · Esc for Select'
                  : isDrawTool(placeTool)
                    ? 'Click-drag to draw · Shift constrains · Esc for Select'
                    : 'Select · Drag to move or marquee · Shift-click to add · Space-drag to pan · Esc clears selection'}
      </div>
      {menu && (
        <ActionMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}
