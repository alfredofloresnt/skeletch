import { useCallback, useEffect, useRef, useState } from 'react'
import Canvas from './components/Canvas'
import Inspector from './components/Inspector'
import SidePanel from './components/SidePanel'
import Toolbar from './components/Toolbar'
import {
  bringForward,
  bringToFront,
  createComposed,
  createElement,
  duplicateElements,
  expandSelectionForGroups,
  isComposedKind,
  nextZ,
  reorderLayerTree,
  scaleElementsToBounds,
  sendBackward,
  sendToBack,
  ungroup,
} from './lib/elements'
import { exportArtboardPng } from './lib/exportPng'
import { FRAME_PRESETS, MAX_ZOOM, MIN_ZOOM } from './lib/constants'
import { clamp } from './lib/geometry'
import {
  downloadWireframe,
  readWireframeFile,
  serializeWireframe,
} from './lib/wireframeFormat'
import './App.css'

const DEFAULT_PRESET = FRAME_PRESETS[0]

export default function App() {
  const [artboard, setArtboard] = useState({
    width: DEFAULT_PRESET.width,
    height: DEFAULT_PRESET.height,
  })
  const [presetId, setPresetId] = useState(DEFAULT_PRESET.id)
  const [elements, setElements] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [snapOn, setSnapOn] = useState(true)
  const [placeType, setPlaceType] = useState(null)
  const [sideTab, setSideTab] = useState('elements')
  const [dragLayerId, setDragLayerId] = useState(null)
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [pan, setPan] = useState({ x: 80, y: 60 })
  const [zoom, setZoom] = useState(0.7)
  const [paletteDrag, setPaletteDrag] = useState(null) // { type, x, y }
  const stageWrapRef = useRef(null)
  const clipboardRef = useRef([])
  const paletteDragRef = useRef(null)

  const updateElement = useCallback((id, patch) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)))
  }, [])

  const place = useCallback(
    (type, x, y) => {
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
    [snapOn],
  )

  const startPaletteDrag = useCallback(
    (type, clientX, clientY) => {
      window.getSelection()?.removeAllRanges()
      const state = { type, x: clientX, y: clientY }
      paletteDragRef.current = state
      setPaletteDrag({ ...state })

      const onMove = (e) => {
        if (!paletteDragRef.current) return
        paletteDragRef.current = {
          ...paletteDragRef.current,
          x: e.clientX,
          y: e.clientY,
        }
        setPaletteDrag({ ...paletteDragRef.current })
      }

      const onUp = (e) => {
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

  const onPreset = (id) => {
    setPresetId(id)
    const preset = FRAME_PRESETS.find((p) => p.id === id)
    if (preset) {
      setArtboard({ width: preset.width, height: preset.height })
    }
  }

  const onSizeChange = (patch) => {
    setPresetId('custom')
    setArtboard((prev) => ({ ...prev, ...patch }))
  }

  const onZoomChange = (z) => setZoom(clamp(z, MIN_ZOOM, MAX_ZOOM))

  const onViewChange = useCallback((next) => {
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
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

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
  }, [selectedIds, editingGroupId, elements])

  const handleUngroup = (groupId) => {
    setElements((prev) => ungroup(prev, groupId))
    setEditingGroupId(null)
  }

  const handleSave = () => {
    const doc = serializeWireframe({ artboard, presetId, snapOn, elements })
    downloadWireframe(doc)
  }

  const handleOpen = async (file) => {
    try {
      const doc = await readWireframeFile(file)
      setArtboard(doc.artboard)
      setPresetId(doc.presetId)
      setSnapOn(doc.snapOn)
      setElements(doc.elements)
      setSelectedIds([])
      setEditingGroupId(null)
      setPlaceType(null)
    } catch (err) {
      window.alert(err.message || 'Could not open .wireframe file')
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
        onToggleSnap={() => setSnapOn((s) => !s)}
        onExport={() => exportArtboardPng(artboard, elements)}
        onFit={fitArtboard}
        onSave={handleSave}
        onOpen={handleOpen}
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
          onReorderTree={(keys) => setElements((prev) => reorderLayerTree(prev, keys))}
          dragId={dragLayerId}
          onDragId={setDragLayerId}
          editingGroupId={editingGroupId}
          onEditGroup={setEditingGroupId}
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
            onResizeElement={(id, box) => updateElement(id, box)}
            onResizeGroup={(ids, oldBounds, newBounds) => {
              setElements((prev) => scaleElementsToBounds(prev, ids, oldBounds, newBounds))
            }}
            onPlace={place}
            onClearPlace={() => setPlaceType(null)}
            pan={pan}
            zoom={zoom}
            onPanChange={setPan}
            onViewChange={onViewChange}
            editingGroupId={editingGroupId}
            onEditGroup={setEditingGroupId}
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
          onBringForward={() => setElements((prev) => bringForward(prev, selectedIds))}
          onSendBackward={() => setElements((prev) => sendBackward(prev, selectedIds))}
          onBringToFront={() => setElements((prev) => bringToFront(prev, selectedIds))}
          onSendToBack={() => setElements((prev) => sendToBack(prev, selectedIds))}
          onDelete={() => {
            setElements((prev) => prev.filter((el) => !selectedIds.includes(el.id)))
            setSelectedIds([])
          }}
          onUngroup={handleUngroup}
          editingGroupId={editingGroupId}
          onEditGroup={setEditingGroupId}
        />
      </div>
    </div>
  )
}
