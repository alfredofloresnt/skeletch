import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Canvas from './components/Canvas'
import Inspector from './components/Inspector'
import SidePanel from './components/SidePanel'
import Toolbar from './components/Toolbar'
import {
  createArtboard,
  defaultArtboard,
  elementsOnArtboard,
  nextArtboardPosition,
  worldToLocal,
} from './lib/artboards'
import {
  bringForward,
  bringToFront,
  canGroup,
  createComposed,
  createElement,
  duplicateElements,
  expandSelectionForGroups,
  groupElements,
  isComposedKind,
  mapArtboardElements,
  nextZ,
  renameGroup,
  reorderGroupChildren,
  reorderLayerTree,
  scaleElementsToBounds,
  sendBackward,
  sendToBack,
  sharedGroupId,
  ungroup,
} from './lib/elements'
import { exportArtboardPng } from './lib/exportPng'
import { FRAME_PRESETS, MAX_ZOOM, MIN_ZOOM } from './lib/constants'
import { clamp } from './lib/geometry'
import type { Artboard, PlaceType, Point, WireElement } from './lib/types'
import {
  downloadWireframe,
  readWireframeFile,
  serializeWireframe,
} from './lib/wireframeFormat'
import './App.css'

const HISTORY_LIMIT = 100

type HistorySnapshot = {
  artboards: Artboard[]
  activeArtboardId: string
  snapOn: boolean
  elements: WireElement[]
  selectedIds: string[]
  editingGroupId: string | null
  artboardSelected: boolean
}

type PaletteDrag = { type: PlaceType; x: number; y: number }

export default function App() {
  const initialBoard = useMemo(() => defaultArtboard(), [])
  const [artboards, setArtboards] = useState<Artboard[]>([initialBoard])
  const [activeArtboardId, setActiveArtboardId] = useState(initialBoard.id)
  const [elements, setElements] = useState<WireElement[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [artboardSelected, setArtboardSelected] = useState(false)
  const [snapOn, setSnapOn] = useState(true)
  const [placeType, setPlaceType] = useState<PlaceType | null>(null)
  const [sideTab, setSideTab] = useState<'elements' | 'layers'>('elements')
  const [dragLayerId, setDragLayerId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [pan, setPan] = useState<Point>({ x: 80, y: 60 })
  const [zoom, setZoom] = useState(0.7)
  const [paletteDrag, setPaletteDrag] = useState<PaletteDrag | null>(null)
  const stageWrapRef = useRef<HTMLDivElement>(null)
  const clipboardRef = useRef<WireElement[]>([])
  const paletteDragRef = useRef<PaletteDrag | null>(null)
  const historyRef = useRef<HistorySnapshot[]>([])
  const documentRef = useRef<HistorySnapshot | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  const activeArtboard =
    artboards.find((ab) => ab.id === activeArtboardId) || artboards[0] || initialBoard
  const activeElements = elementsOnArtboard(elements, activeArtboard.id)

  documentRef.current = {
    artboards,
    activeArtboardId,
    snapOn,
    elements,
    selectedIds,
    editingGroupId,
    artboardSelected,
  }

  const recordHistory = useCallback(() => {
    const current = documentRef.current
    if (!current) return
    historyRef.current.push({
      ...current,
      artboards: current.artboards.map((ab) => ({ ...ab })),
      elements: current.elements.map((el) => ({ ...el })),
      selectedIds: [...current.selectedIds],
    })
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift()
    setCanUndo(true)
  }, [])

  const undo = useCallback(() => {
    const previous = historyRef.current.pop()
    if (!previous) return
    setArtboards(previous.artboards)
    setActiveArtboardId(previous.activeArtboardId)
    setSnapOn(previous.snapOn)
    setElements(previous.elements)
    setSelectedIds(previous.selectedIds)
    setEditingGroupId(previous.editingGroupId)
    setArtboardSelected(previous.artboardSelected)
    setPlaceType(null)
    setCanUndo(historyRef.current.length > 0)
  }, [])

  const updateElement = useCallback(
    (id: string, patch: Partial<WireElement>) => {
      recordHistory()
      setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)))
    },
    [recordHistory],
  )

  const place = useCallback(
    (type: PlaceType, x: number, y: number, artboardId: string) => {
      recordHistory()
      setActiveArtboardId(artboardId)
      setArtboardSelected(false)
      setElements((prev) => {
        const boardEls = prev.filter((el) => el.artboardId === artboardId)
        if (isComposedKind(type)) {
          const created = createComposed(type, x, y, nextZ(boardEls), snapOn, artboardId)
          setSelectedIds(created.map((el) => el.id))
          setEditingGroupId(null)
          return [...prev, ...created]
        }
        const el = createElement(type, x, y, nextZ(boardEls), snapOn, artboardId)
        setSelectedIds([el.id])
        return [...prev, el]
      })
    },
    [recordHistory, snapOn],
  )

  const startPaletteDrag = useCallback(
    (type: PlaceType, clientX: number, clientY: number) => {
      window.getSelection()?.removeAllRanges()
      const state = { type, x: clientX, y: clientY }
      paletteDragRef.current = state
      setPaletteDrag({ ...state })

      const onMove = (e: PointerEvent) => {
        if (!paletteDragRef.current) return
        paletteDragRef.current = {
          ...paletteDragRef.current,
          x: e.clientX,
          y: e.clientY,
        }
        setPaletteDrag({ ...paletteDragRef.current })
      }

      const onUp = (e: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)

        const drag = paletteDragRef.current
        paletteDragRef.current = null
        setPaletteDrag(null)
        if (!drag) return

        const wrap = stageWrapRef.current
        const stage = wrap?.querySelector('.canvas-stage')
        if (!stage) return
        const rect = stage.getBoundingClientRect()
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        ) {
          return
        }

        const worldX = (e.clientX - rect.left - pan.x) / zoom
        const worldY = (e.clientY - rect.top - pan.y) / zoom
        const boards = documentRef.current?.artboards || []
        const activeId = documentRef.current?.activeArtboardId || activeArtboardId
        let target =
          boards.find(
            (ab) =>
              worldX >= ab.x &&
              worldX <= ab.x + ab.width &&
              worldY >= ab.y &&
              worldY <= ab.y + ab.height &&
              ab.id === activeId,
          ) ||
          [...boards]
            .reverse()
            .find(
              (ab) =>
                worldX >= ab.x &&
                worldX <= ab.x + ab.width &&
                worldY >= ab.y &&
                worldY <= ab.y + ab.height,
            ) ||
          boards.find((ab) => ab.id === activeId) ||
          boards[0]
        if (!target) return
        const local = worldToLocal(target, { x: worldX, y: worldY })
        place(drag.type, local.x, local.y, target.id)
        setPlaceType(null)
        window.getSelection()?.removeAllRanges()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [pan.x, pan.y, zoom, place, activeArtboardId],
  )

  const onPreset = (id: string) => {
    recordHistory()
    const preset = FRAME_PRESETS.find((p) => p.id === id)
    setArtboards((prev) =>
      prev.map((ab) =>
        ab.id === activeArtboardId
          ? {
              ...ab,
              presetId: id,
              ...(preset
                ? { width: preset.width, height: preset.height, name: preset.label }
                : {}),
            }
          : ab,
      ),
    )
  }

  const onSizeChange = (patch: Partial<Pick<Artboard, 'width' | 'height'>>) => {
    recordHistory()
    setArtboards((prev) =>
      prev.map((ab) =>
        ab.id === activeArtboardId ? { ...ab, ...patch, presetId: 'custom' } : ab,
      ),
    )
  }

  const addArtboard = () => {
    recordHistory()
    const pos = nextArtboardPosition(artboards)
    const source = activeArtboard
    const next = createArtboard({
      width: source.width,
      height: source.height,
      presetId: source.presetId,
      name: source.presetId === 'custom' ? `Artboard ${artboards.length + 1}` : source.name,
      x: pos.x,
      y: pos.y,
    })
    setArtboards((prev) => [...prev, next])
    setActiveArtboardId(next.id)
    setSelectedIds([])
    setArtboardSelected(true)
    setEditingGroupId(null)
  }

  const duplicateArtboard = () => {
    recordHistory()
    const source = activeArtboard
    const pos = nextArtboardPosition(artboards)
    const next = createArtboard({
      width: source.width,
      height: source.height,
      presetId: source.presetId,
      name: `${source.name} copy`,
      x: pos.x,
      y: pos.y,
    })
    const boardEls = elementsOnArtboard(elements, source.id)
    const { elements: copies } = duplicateElements(
      boardEls,
      boardEls.map((el) => el.id),
      0,
      0,
    )
    const created = copies.map((el) => ({ ...el, artboardId: next.id }))
    setArtboards((prev) => [...prev, next])
    setElements((prev) => [...prev, ...created])
    setActiveArtboardId(next.id)
    setSelectedIds([])
    setArtboardSelected(true)
    setEditingGroupId(null)
  }

  const deleteArtboard = () => {
    if (artboards.length <= 1) return
    recordHistory()
    const remaining = artboards.filter((ab) => ab.id !== activeArtboardId)
    const nextActive = remaining[remaining.length - 1]
    setArtboards(remaining)
    setElements((prev) => prev.filter((el) => el.artboardId !== activeArtboardId))
    setActiveArtboardId(nextActive.id)
    setSelectedIds([])
    setArtboardSelected(true)
    setEditingGroupId(null)
  }

  const onZoomChange = (z: number) => setZoom(clamp(z, MIN_ZOOM, MAX_ZOOM))

  const onViewChange = useCallback((next: { pan?: Point; zoom?: number }) => {
    if (next.zoom != null && next.pan != null) {
      setZoom(clamp(next.zoom, MIN_ZOOM, MAX_ZOOM))
      setPan(next.pan)
      return
    }
    if (next.zoom != null) setZoom(clamp(next.zoom, MIN_ZOOM, MAX_ZOOM))
    if (next.pan != null) setPan(next.pan)
  }, [])

  const fitArtboard = () => {
    const wrap = stageWrapRef.current
    if (!wrap) return
    const pad = 80
    const ab = activeArtboard
    const zw = (wrap.clientWidth - pad) / ab.width
    const zh = (wrap.clientHeight - pad) / ab.height
    const next = clamp(Math.min(zw, zh), MIN_ZOOM, MAX_ZOOM)
    setZoom(next)
    setPan({
      x: (wrap.clientWidth - ab.width * next) / 2 - ab.x * next,
      y: (wrap.clientHeight - ab.height * next) / 2 - ab.y * next,
    })
  }

  useEffect(() => {
    const wrap = stageWrapRef.current
    if (!wrap) return
    const ab = initialBoard
    const pad = 80
    const zw = (wrap.clientWidth - pad) / ab.width
    const zh = (wrap.clientHeight - pad) / ab.height
    const next = clamp(Math.min(zw, zh), MIN_ZOOM, MAX_ZOOM)
    setZoom(next)
    setPan({
      x: (wrap.clientWidth - ab.width * next) / 2,
      y: (wrap.clientHeight - ab.height * next) / 2,
    })
  }, [initialBoard])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) {
          const gid = sharedGroupId(elements, selectedIds)
          if (!gid) return
          recordHistory()
          setElements((prev) => ungroup(prev, gid))
          setEditingGroupId(null)
          return
        }
        if (!canGroup(elements, selectedIds)) return
        recordHistory()
        setElements((prev) => groupElements(prev, selectedIds))
        setEditingGroupId(null)
        return
      }

      if (e.key === 'Escape') {
        if (editingGroupId) {
          setEditingGroupId(null)
          return
        }
        setSelectedIds([])
        setArtboardSelected(false)
        setPlaceType(null)
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && artboardSelected && !selectedIds.length) {
        if (artboards.length <= 1) return
        e.preventDefault()
        recordHistory()
        const remaining = artboards.filter((ab) => ab.id !== activeArtboardId)
        const nextActive = remaining[remaining.length - 1]
        setArtboards(remaining)
        setElements((prev) => prev.filter((el) => el.artboardId !== activeArtboardId))
        setActiveArtboardId(nextActive.id)
        setSelectedIds([])
        setArtboardSelected(true)
        setEditingGroupId(null)
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault()
        recordHistory()
        setElements((prev) => prev.filter((el) => !selectedIds.includes(el.id)))
        setSelectedIds([])
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && selectedIds.length) {
        e.preventDefault()
        const ids = expandSelectionForGroups(elements, selectedIds, editingGroupId)
        clipboardRef.current = elements
          .filter((el) => ids.includes(el.id))
          .map((el) => ({ ...el }))
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v' && clipboardRef.current.length) {
        e.preventDefault()
        recordHistory()
        const clipIds = clipboardRef.current.map((el) => el.id)
        const { elements: copies, ids } = duplicateElements(clipboardRef.current, clipIds, 16, 16)
        const boardEls = elementsOnArtboard(elements, activeArtboardId)
        const z0 = nextZ(boardEls)
        const created = copies.map((el, i) => ({
          ...el,
          z: z0 + i,
          artboardId: activeArtboardId,
        }))
        setElements((prev) => [...prev, ...created])
        setSelectedIds(ids)
        setArtboardSelected(false)
        setEditingGroupId(null)
        clipboardRef.current = created.map((el) => ({ ...el }))
        return
      }

      if (selectedIds.length && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        recordHistory()
        const step = e.shiftKey ? 8 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        setElements((prev) =>
          prev.map((el) =>
            selectedIds.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el,
          ),
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    selectedIds,
    editingGroupId,
    elements,
    recordHistory,
    undo,
    artboardSelected,
    artboards,
    activeArtboardId,
  ])

  const handleUngroup = (groupId: string) => {
    recordHistory()
    setElements((prev) => ungroup(prev, groupId))
    setEditingGroupId(null)
  }

  const handleGroup = (ids: string[] = selectedIds) => {
    const boardIds = new Set(
      ids
        .map((id) => elements.find((el) => el.id === id)?.artboardId)
        .filter(Boolean),
    )
    if (boardIds.size !== 1) return
    if (!canGroup(elements, ids)) return
    recordHistory()
    const next = groupElements(elements, ids)
    setElements(next)
    setSelectedIds(expandSelectionForGroups(next, ids, null))
    setEditingGroupId(null)
  }

  const handleRenameGroup = (groupId: string, name: string) => {
    recordHistory()
    setElements((prev) => renameGroup(prev, groupId, name))
  }

  const handleSave = () => {
    const doc = serializeWireframe({
      artboards,
      activeArtboardId,
      snapOn,
      elements,
    })
    downloadWireframe(doc)
  }

  const handleOpen = async (file: File) => {
    try {
      const doc = await readWireframeFile(file)
      recordHistory()
      setArtboards(doc.artboards)
      setActiveArtboardId(doc.activeArtboardId)
      setSnapOn(doc.snapOn)
      setElements(doc.elements)
      setSelectedIds([])
      setArtboardSelected(false)
      setEditingGroupId(null)
      setPlaceType(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open .wireframe file'
      window.alert(message)
    }
  }

  const scopeZ = (fn: (scoped: WireElement[]) => WireElement[]) => {
    const boardId =
      elements.find((el) => selectedIds.includes(el.id))?.artboardId || activeArtboardId
    setElements((prev) => mapArtboardElements(prev, boardId, fn))
  }

  return (
    <div className="app-shell">
      <Toolbar
        artboard={activeArtboard}
        zoom={zoom}
        snapOn={snapOn}
        canDeleteArtboard={artboards.length > 1}
        onPreset={onPreset}
        onSizeChange={onSizeChange}
        onZoomChange={onZoomChange}
        onToggleSnap={() => {
          recordHistory()
          setSnapOn((s) => !s)
        }}
        onAddArtboard={addArtboard}
        onDuplicateArtboard={duplicateArtboard}
        onDeleteArtboard={deleteArtboard}
        onExport={() => exportArtboardPng(activeArtboard, activeElements)}
        onFit={fitArtboard}
        onSave={handleSave}
        onOpen={handleOpen}
        onUndo={undo}
        canUndo={canUndo}
      />

      <div className="app-body">
        <SidePanel
          tab={sideTab}
          onTab={setSideTab}
          placeType={placeType}
          onPlaceType={setPlaceType}
          onPaletteDragStart={startPaletteDrag}
          elements={activeElements}
          selectedIds={selectedIds}
          onSelect={(ids) => {
            setSelectedIds(ids)
            setArtboardSelected(false)
          }}
          onReorderTree={(keys) => {
            recordHistory()
            setElements((prev) =>
              mapArtboardElements(prev, activeArtboardId, (scoped) =>
                reorderLayerTree(scoped, keys),
              ),
            )
          }}
          onReorderGroupChildren={(groupId, childIds) => {
            recordHistory()
            setElements((prev) =>
              mapArtboardElements(prev, activeArtboardId, (scoped) =>
                reorderGroupChildren(scoped, groupId, childIds),
              ),
            )
          }}
          dragId={dragLayerId}
          onDragId={setDragLayerId}
          editingGroupId={editingGroupId}
          onEditGroup={setEditingGroupId}
          onGroup={handleGroup}
          onUngroup={handleUngroup}
          onRenameGroup={handleRenameGroup}
          canGroupSelection={canGroup(elements, selectedIds)}
        />

        <div className="stage-wrap" ref={stageWrapRef}>
          <Canvas
            artboards={artboards}
            activeArtboardId={activeArtboardId}
            elements={elements}
            selectedIds={selectedIds}
            artboardSelected={artboardSelected}
            snapOn={snapOn}
            placeType={placeType}
            onSelect={setSelectedIds}
            onActiveArtboard={setActiveArtboardId}
            onArtboardSelected={setArtboardSelected}
            onMoveElements={(updates) => {
              const map = Object.fromEntries(updates.map((u) => [u.id, u]))
              setElements((prev) =>
                prev.map((el) => {
                  const u = map[el.id]
                  if (!u) return el
                  return { ...el, x: u.x, y: u.y, artboardId: u.artboardId }
                }),
              )
            }}
            onMoveArtboard={(id, x, y) => {
              setArtboards((prev) => prev.map((ab) => (ab.id === id ? { ...ab, x, y } : ab)))
            }}
            onResizeElement={(id, box) => {
              setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...box } : el)))
            }}
            onResizeGroup={(origins, oldBounds, newBounds) => {
              setElements((prev) => scaleElementsToBounds(prev, origins, oldBounds, newBounds))
            }}
            onEditStart={recordHistory}
            onPlace={place}
            onClearPlace={() => setPlaceType(null)}
            pan={pan}
            zoom={zoom}
            onPanChange={setPan}
            onViewChange={onViewChange}
            editingGroupId={editingGroupId}
            onEditGroup={setEditingGroupId}
            onGroup={handleGroup}
            onUngroup={handleUngroup}
          />
        </div>

        {paletteDrag && (
          <div
            className="palette-drag-ghost"
            style={{ left: paletteDrag.x + 12, top: paletteDrag.y + 12 }}
          >
            {paletteDrag.type}
          </div>
        )}

        <Inspector
          elements={elements}
          selectedIds={selectedIds}
          onUpdate={updateElement}
          onBringForward={() => {
            recordHistory()
            scopeZ((scoped) => bringForward(scoped, selectedIds))
          }}
          onSendBackward={() => {
            recordHistory()
            scopeZ((scoped) => sendBackward(scoped, selectedIds))
          }}
          onBringToFront={() => {
            recordHistory()
            scopeZ((scoped) => bringToFront(scoped, selectedIds))
          }}
          onSendToBack={() => {
            recordHistory()
            scopeZ((scoped) => sendToBack(scoped, selectedIds))
          }}
          onDelete={() => {
            recordHistory()
            setElements((prev) => prev.filter((el) => !selectedIds.includes(el.id)))
            setSelectedIds([])
          }}
          onUngroup={handleUngroup}
          onGroup={handleGroup}
          onRenameGroup={handleRenameGroup}
          canGroupSelection={canGroup(elements, selectedIds)}
          editingGroupId={editingGroupId}
          onEditGroup={setEditingGroupId}
        />
      </div>
    </div>
  )
}
