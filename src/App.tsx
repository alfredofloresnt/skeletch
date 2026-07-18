import { useCallback, useEffect, useRef, useState } from 'react'
import Canvas from './components/Canvas'
import Inspector from './components/Inspector'
import SidePanel from './components/SidePanel'
import Toolbar from './components/Toolbar'
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

const DEFAULT_PRESET = FRAME_PRESETS[0]
const HISTORY_LIMIT = 100

type HistorySnapshot = {
  artboard: Artboard
  presetId: string
  snapOn: boolean
  elements: WireElement[]
  selectedIds: string[]
  editingGroupId: string | null
}

type PaletteDrag = { type: PlaceType; x: number; y: number }

export default function App() {
  const [artboard, setArtboard] = useState<Artboard>({
    width: DEFAULT_PRESET.width,
    height: DEFAULT_PRESET.height,
  })
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET.id)
  const [elements, setElements] = useState<WireElement[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
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

  documentRef.current = {
    artboard,
    presetId,
    snapOn,
    elements,
    selectedIds,
    editingGroupId,
  }

  const recordHistory = useCallback(() => {
    const current = documentRef.current
    if (!current) return
    historyRef.current.push({
      ...current,
      artboard: { ...current.artboard },
      elements: current.elements.map((el) => ({ ...el })),
      selectedIds: [...current.selectedIds],
    })
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift()
    setCanUndo(true)
  }, [])

  const undo = useCallback(() => {
    const previous = historyRef.current.pop()
    if (!previous) return
    setArtboard(previous.artboard)
    setPresetId(previous.presetId)
    setSnapOn(previous.snapOn)
    setElements(previous.elements)
    setSelectedIds(previous.selectedIds)
    setEditingGroupId(previous.editingGroupId)
    setPlaceType(null)
    setCanUndo(historyRef.current.length > 0)
  }, [])

  const updateElement = useCallback((id: string, patch: Partial<WireElement>) => {
    recordHistory()
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)))
  }, [recordHistory])

  const place = useCallback(
    (type: PlaceType, x: number, y: number) => {
      recordHistory()
      setElements((prev) => {
        if (isComposedKind(type)) {
          const created = createComposed(type, x, y, nextZ(prev), snapOn)
          setSelectedIds(created.map((el) => el.id))
          setEditingGroupId(null)
          return [...prev, ...created]
        }
        const el = createElement(type, x, y, nextZ(prev), snapOn)
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

        const x = (e.clientX - rect.left - pan.x) / zoom
        const y = (e.clientY - rect.top - pan.y) / zoom
        place(drag.type, x, y)
        setPlaceType(null)
        window.getSelection()?.removeAllRanges()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [pan.x, pan.y, zoom, place],
  )

  const onPreset = (id: string) => {
    recordHistory()
    setPresetId(id)
    const preset = FRAME_PRESETS.find((p) => p.id === id)
    if (preset) {
      setArtboard({ width: preset.width, height: preset.height })
    }
  }

  const onSizeChange = (patch: Partial<Artboard>) => {
    recordHistory()
    setPresetId('custom')
    setArtboard((prev) => ({ ...prev, ...patch }))
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
    const zw = (wrap.clientWidth - pad) / artboard.width
    const zh = (wrap.clientHeight - pad) / artboard.height
    const next = clamp(Math.min(zw, zh), MIN_ZOOM, MAX_ZOOM)
    setZoom(next)
    setPan({
      x: (wrap.clientWidth - artboard.width * next) / 2,
      y: (wrap.clientHeight - artboard.height * next) / 2,
    })
  }

  useEffect(() => {
    const wrap = stageWrapRef.current
    if (!wrap) return
    const pad = 80
    const zw = (wrap.clientWidth - pad) / DEFAULT_PRESET.width
    const zh = (wrap.clientHeight - pad) / DEFAULT_PRESET.height
    const next = clamp(Math.min(zw, zh), MIN_ZOOM, MAX_ZOOM)
    setZoom(next)
    setPan({
      x: (wrap.clientWidth - DEFAULT_PRESET.width * next) / 2,
      y: (wrap.clientHeight - DEFAULT_PRESET.height * next) / 2,
    })
  }, [])

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
        setPlaceType(null)
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
        // Rebase z on top of current document
        const z0 = nextZ(elements)
        const created = copies.map((el, i) => ({ ...el, z: z0 + i }))
        setElements((prev) => [...prev, ...created])
        setSelectedIds(ids)
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
  }, [selectedIds, editingGroupId, elements, recordHistory, undo])

  const handleUngroup = (groupId: string) => {
    recordHistory()
    setElements((prev) => ungroup(prev, groupId))
    setEditingGroupId(null)
  }

  const handleGroup = (ids: string[] = selectedIds) => {
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
    const doc = serializeWireframe({ artboard, presetId, snapOn, elements })
    downloadWireframe(doc)
  }

  const handleOpen = async (file: File) => {
    try {
      const doc = await readWireframeFile(file)
      recordHistory()
      setArtboard(doc.artboard)
      setPresetId(doc.presetId)
      setSnapOn(doc.snapOn)
      setElements(doc.elements)
      setSelectedIds([])
      setEditingGroupId(null)
      setPlaceType(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open .wireframe file'
      window.alert(message)
    }
  }

  return (
    <div className="app-shell">
      <Toolbar
        artboard={artboard}
        presetId={presetId}
        zoom={zoom}
        snapOn={snapOn}
        onPreset={onPreset}
        onSizeChange={onSizeChange}
        onZoomChange={onZoomChange}
        onToggleSnap={() => {
          recordHistory()
          setSnapOn((s) => !s)
        }}
        onExport={() => exportArtboardPng(artboard, elements)}
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
          elements={elements}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onReorderTree={(keys) => {
            recordHistory()
            setElements((prev) => reorderLayerTree(prev, keys))
          }}
          onReorderGroupChildren={(groupId, childIds) => {
            recordHistory()
            setElements((prev) => reorderGroupChildren(prev, groupId, childIds))
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
            artboard={artboard}
            elements={elements}
            selectedIds={selectedIds}
            snapOn={snapOn}
            placeType={placeType}
            onSelect={setSelectedIds}
            onMoveElements={(updates) => {
              const map = Object.fromEntries(updates.map((u) => [u.id, u]))
              setElements((prev) =>
                prev.map((el) => (map[el.id] ? { ...el, x: map[el.id].x, y: map[el.id].y } : el)),
              )
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
            setElements((prev) => bringForward(prev, selectedIds))
          }}
          onSendBackward={() => {
            recordHistory()
            setElements((prev) => sendBackward(prev, selectedIds))
          }}
          onBringToFront={() => {
            recordHistory()
            setElements((prev) => bringToFront(prev, selectedIds))
          }}
          onSendToBack={() => {
            recordHistory()
            setElements((prev) => sendToBack(prev, selectedIds))
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
