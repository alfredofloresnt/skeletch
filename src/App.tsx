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
  addComponent,
  canSaveSelection,
  nextComponentDefaultName,
  removeComponent,
  renameComponent,
  selectionToParts,
} from './lib/customComponents'
import {
  bringForward,
  bringToFront,
  canGroup,
  createComposed,
  createDrawnElement,
  createElement,
  createFromParts,
  createPathElement,
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
import {
  appClipboardMarker,
  isAppClipboardTransfer,
  writeAppClipboardMarker,
} from './lib/appClipboard'
import { exportArtboardPng, exportArtboardsZip } from './lib/exportPng'
import { canAcceptFillImage, loadHtmlImage, readClipboardImage } from './lib/fillImage'
import { importSvg, readSvgFromTransfer } from './lib/importSvg'
import { FRAME_PRESETS, MAX_ZOOM, MIN_SIZE, MIN_ZOOM } from './lib/constants'
import {
  applyRotationAroundCenter,
  boundsCenter,
  clamp,
  getBounds,
} from './lib/geometry'
import type {
  Artboard,
  CustomComponentDef,
  DesignVariable,
  PenDraft,
  PlaceTool,
  Point,
  WireElement,
} from './lib/types'
import { isCustomPlace, isDrawTool } from './lib/types'
import {
  clearVariableBindings,
  renameVariable,
  syncElementsToVariable,
  updateVariableValue,
} from './lib/variables'
import {
  downloadWireframe,
  readWireframeFile,
  serializeWireframe,
} from './lib/wireframeFormat'
import type { SideTab } from './components/SidePanel'
import './App.css'

const HISTORY_LIMIT = 100
const DEFAULT_PASTE_IMAGE_W = 320
const DEFAULT_PASTE_IMAGE_H = 240

type HistorySnapshot = {
  artboards: Artboard[]
  activeArtboardId: string
  snapOn: boolean
  elements: WireElement[]
  variables: DesignVariable[]
  components: CustomComponentDef[]
  selectedIds: string[]
  editingGroupId: string | null
  artboardSelected: boolean
}

type PaletteDrag = { tool: PlaceTool; label: string; x: number; y: number }

export default function App() {
  const initialBoard = useMemo(() => defaultArtboard(), [])
  const [artboards, setArtboards] = useState<Artboard[]>([initialBoard])
  const [activeArtboardId, setActiveArtboardId] = useState(initialBoard.id)
  const [elements, setElements] = useState<WireElement[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [artboardSelected, setArtboardSelected] = useState(false)
  /** Extra artboards picked with Shift; only counts while it includes the active board. */
  const [artboardSelection, setArtboardSelection] = useState<string[]>([])
  const [snapOn, setSnapOn] = useState(true)
  const [placeTool, setPlaceTool] = useState<PlaceTool | null>(null)
  const [components, setComponents] = useState<CustomComponentDef[]>([])
  const [variables, setVariables] = useState<DesignVariable[]>([])
  const [sideTab, setSideTab] = useState<SideTab | null>(null)
  const [dragLayerId, setDragLayerId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [editingPathId, setEditingPathId] = useState<string | null>(null)
  const [penDraft, setPenDraft] = useState<PenDraft | null>(null)
  const [pan, setPan] = useState<Point>({ x: 80, y: 60 })
  const [zoom, setZoom] = useState(0.7)
  const [paletteDrag, setPaletteDrag] = useState<PaletteDrag | null>(null)
  const stageWrapRef = useRef<HTMLDivElement>(null)
  const clipboardRef = useRef<WireElement[]>([])
  const paletteDragRef = useRef<PaletteDrag | null>(null)
  const editingTextIdRef = useRef<string | null>(null)
  const penDraftRef = useRef<PenDraft | null>(null)
  const componentsRef = useRef(components)
  componentsRef.current = components
  editingTextIdRef.current = editingTextId
  penDraftRef.current = penDraft
  const historyRef = useRef<HistorySnapshot[]>([])
  const documentRef = useRef<HistorySnapshot | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  const activeArtboard =
    artboards.find((ab) => ab.id === activeArtboardId) || artboards[0] || initialBoard
  const activeElements = elementsOnArtboard(elements, activeArtboard.id)
  const selectedArtboardIds = useMemo(() => {
    if (!artboardSelected || selectedIds.length) return []
    const ids = artboardSelection.filter((id) => artboards.some((ab) => ab.id === id))
    return ids.includes(activeArtboardId) ? ids : [activeArtboardId]
  }, [artboardSelected, selectedIds.length, artboardSelection, artboards, activeArtboardId])

  const selectSingleArtboard = (selected: boolean) => {
    setArtboardSelected(selected)
    setArtboardSelection([])
  }

  const toggleArtboardSelection = (id: string) => {
    let next: string[]
    if (selectedArtboardIds.includes(id)) {
      next = selectedArtboardIds.filter((x) => x !== id)
      if (!next.length) return
    } else {
      next = [...selectedArtboardIds, id]
    }
    setArtboardSelection(next)
    setActiveArtboardId(selectedArtboardIds.includes(id) ? next[next.length - 1] : id)
    setSelectedIds([])
    setArtboardSelected(true)
    setEditingGroupId(null)
  }

  const exportArtboards = async (boardIds: string[]) => {
    try {
      const boards = artboards.filter((ab) => boardIds.includes(ab.id))
      if (boards.length > 1) {
        await exportArtboardsZip(boards, elements)
      } else if (boards.length === 1) {
        await exportArtboardPng(boards[0], elementsOnArtboard(elements, boards[0].id))
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not export')
    }
  }

  documentRef.current = {
    artboards,
    activeArtboardId,
    snapOn,
    elements,
    variables,
    components,
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
      variables: current.variables.map((v) => ({ ...v })),
      components: current.components.map((c) => ({
        ...c,
        parts: c.parts.map((p) => ({ ...p })),
      })),
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
    setVariables(previous.variables)
    setComponents(previous.components)
    setSelectedIds(previous.selectedIds)
    setEditingGroupId(previous.editingGroupId)
    setEditingTextId(null)
    setEditingPathId(null)
    setPenDraft(null)
    setArtboardSelected(previous.artboardSelected)
    setPlaceTool(null)
    setCanUndo(historyRef.current.length > 0)
  }, [])

  const updateElement = useCallback(
    (id: string, patch: Partial<WireElement>) => {
      recordHistory()
      setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)))
    },
    [recordHistory],
  )

  const updateElements = useCallback(
    (ids: string[], patch: Partial<WireElement>) => {
      if (!ids.length) return
      recordHistory()
      const idSet = new Set(ids)
      setElements((prev) => prev.map((el) => (idSet.has(el.id) ? { ...el, ...patch } : el)))
    },
    [recordHistory],
  )

  const place = useCallback(
    (
      tool: PlaceTool,
      x: number,
      y: number,
      artboardId: string,
      size?: { w: number; h: number },
    ) => {
      const currentElements = documentRef.current?.elements || []
      const boardEls = currentElements.filter((el) => el.artboardId === artboardId)
      const z0 = nextZ(boardEls)
      let created: WireElement[]

      if (isCustomPlace(tool)) {
        const def = componentsRef.current.find((c) => c.id === tool.customId)
        if (!def) return
        created = createFromParts(def.parts, {
          name: def.name,
          groupKind: 'custom',
          cx: x,
          cy: y,
          startZ: z0,
          snapOn,
          artboardId,
        })
      } else if (isComposedKind(tool)) {
        created = createComposed(tool, x, y, z0, snapOn, artboardId)
      } else {
        created = [
          size && isDrawTool(tool)
            ? createDrawnElement(tool, { x, y, w: size.w, h: size.h }, z0, artboardId)
            : createElement(tool, x, y, z0, snapOn, artboardId),
        ]
      }

      recordHistory()
      setActiveArtboardId(artboardId)
      setArtboardSelected(false)
      setElements((prev) => [...prev, ...created])
      setSelectedIds(created.map((el) => el.id))
      setEditingGroupId(null)
      if (tool === 'text' && created[0]) setEditingTextId(created[0].id)
    },
    [recordHistory, snapOn],
  )

  const commitTextEdit = useCallback(
    (id: string, text: string) => {
      if (editingTextIdRef.current === id) {
        setEditingTextId(null)
        setSelectedIds([id])
        setArtboardSelected(false)
      }
      // Read from the ref so this callback stays stable across element edits.
      const current = documentRef.current?.elements.find((el) => el.id === id)
      if (!current || current.type !== 'text' || (current.text || '') === text) return
      updateElement(id, { text })
    },
    [updateElement],
  )

  const cancelTextEdit = useCallback((id: string) => {
    setEditingTextId((current) => (current === id ? null : current))
  }, [])

  const placeImportedSvg = useCallback(
    (svgText: string, artboardId: string, center?: Point) => {
      const board = artboards.find((ab) => ab.id === artboardId)
      if (!board) return

      let asset
      try {
        asset = importSvg(svgText)
      } catch {
        return
      }

      const maxW = board.width * 0.5
      const maxH = board.height * 0.5
      const scale = Math.min(1, maxW / asset.width, maxH / asset.height)
      const w = Math.max(MIN_SIZE, Math.round(asset.width * scale))
      const h = Math.max(MIN_SIZE, Math.round(asset.height * scale))
      const cx = center?.x ?? board.width / 2
      const cy = center?.y ?? board.height / 2
      const z = nextZ(elementsOnArtboard(elements, board.id))
      const el = {
        ...createElement('image', cx, cy, z, snapOn, board.id),
        x: Math.round(cx - w / 2),
        y: Math.round(cy - h / 2),
        w,
        h,
        fillImage: asset.dataUrl,
        fillVar: null,
        name: 'SVG',
      }

      recordHistory()
      setElements((prev) => [...prev, el])
      setActiveArtboardId(board.id)
      setSelectedIds([el.id])
      setArtboardSelected(false)
      setEditingGroupId(null)
      setEditingTextId(null)
      setEditingPathId(null)
      setPenDraft(null)
    },
    [artboards, elements, recordHistory, snapOn],
  )

  const commitPenPath = useCallback(
    (closed: boolean) => {
      const draft = penDraftRef.current
      if (!draft || draft.vertices.length < 2) {
        setPenDraft(null)
        return
      }
      const boardEls = (documentRef.current?.elements || []).filter(
        (el) => el.artboardId === draft.artboardId,
      )
      const created = createPathElement({
        vertices: draft.vertices,
        closed,
        z: nextZ(boardEls),
        artboardId: draft.artboardId,
      })
      if (!created) {
        setPenDraft(null)
        return
      }
      recordHistory()
      setActiveArtboardId(draft.artboardId)
      setArtboardSelected(false)
      setElements((prev) => [...prev, created])
      setSelectedIds([created.id])
      setEditingGroupId(null)
      setEditingPathId(null)
      setPenDraft(null)
      setPlaceTool(null)
    },
    [recordHistory],
  )

  const startPaletteDrag = useCallback(
    (tool: PlaceTool, label: string, clientX: number, clientY: number) => {
      window.getSelection()?.removeAllRanges()
      const state = { tool, label, x: clientX, y: clientY }
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
        const target =
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
        place(drag.tool, local.x, local.y, target.id)
        // Back to Select so the new element can be moved right away.
        setPlaceTool(null)
        window.getSelection()?.removeAllRanges()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [pan.x, pan.y, zoom, place, activeArtboardId],
  )

  const saveSelectionAsComponent = useCallback(() => {
    const ids = expandSelectionForGroups(elements, selectedIds, editingGroupId)
    const selected = elements.filter((el) => ids.includes(el.id))
    const parts = selectionToParts(selected)
    if (!parts) {
      window.alert('Select elements on one artboard to save as a component.')
      return
    }
    const suggested = nextComponentDefaultName(components)
    const name = window.prompt('Component name', suggested)
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed) return
    recordHistory()
    setComponents(addComponent(components, parts, trimmed))
    setSideTab('document')
  }, [elements, selectedIds, editingGroupId, components, recordHistory])

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

  const addArtboardPreset = (presetId: string) => {
    const preset = FRAME_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    recordHistory()
    const pos = nextArtboardPosition(artboards)
    const next = createArtboard({
      width: preset.width,
      height: preset.height,
      presetId: preset.id,
      name: preset.label,
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
    selectSingleArtboard(true)
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
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        const ids = elements.filter((el) => el.artboardId === activeArtboardId).map((el) => el.id)
        if (!ids.length) return
        setSelectedIds(expandSelectionForGroups(elements, ids, editingGroupId))
        setArtboardSelected(false)
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
        if (editingTextId) {
          setEditingTextId(null)
          return
        }
        if (editingPathId) {
          setEditingPathId(null)
          return
        }
        if (penDraft) {
          setPenDraft(null)
          return
        }
        if (editingGroupId) {
          setEditingGroupId(null)
          return
        }
        setSelectedIds([])
        setArtboardSelected(false)
        setPlaceTool(null)
        return
      }

      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        if (penDraft && penDraft.vertices.length >= 2) {
          e.preventDefault()
          commitPenPath(false)
          return
        }
        if (editingPathId) {
          e.preventDefault()
          setEditingPathId(null)
          return
        }
        if (selectedIds.length === 1) {
          const el = elements.find((item) => item.id === selectedIds[0])
          if (el?.type === 'text') {
            e.preventDefault()
            setEditingTextId(el.id)
            return
          }
          if (el?.type === 'path') {
            e.preventDefault()
            setEditingPathId(el.id)
            return
          }
        }
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        penDraft &&
        !editingTextId
      ) {
        e.preventDefault()
        if (penDraft.vertices.length <= 1) {
          setPenDraft(null)
        } else {
          setPenDraft({
            ...penDraft,
            vertices: penDraft.vertices.slice(0, -1),
            draggingHandle: false,
          })
        }
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
        selectSingleArtboard(true)
        setEditingGroupId(null)
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault()
        recordHistory()
        setElements((prev) => prev.filter((el) => !selectedIds.includes(el.id)))
        setSelectedIds([])
        setEditingTextId(null)
        setEditingPathId(null)
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
            selectedIds.includes(el.id) && !el.locked ? { ...el, x: el.x + dx, y: el.y + dy } : el,
          ),
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    selectedIds,
    editingGroupId,
    editingTextId,
    editingPathId,
    penDraft,
    commitPenPath,
    elements,
    recordHistory,
    undo,
    artboardSelected,
    artboards,
    activeArtboardId,
  ])

  useEffect(() => {
    const isEditingField = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      const tag = el?.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el?.isContentEditable)
    }

    const pasteAppClipboard = () => {
      if (!clipboardRef.current.length) return false
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
      return true
    }

    const onCopy = (e: ClipboardEvent) => {
      if (isEditingField(e.target) || editingTextId) return
      if (!selectedIds.length) return
      const ids = expandSelectionForGroups(elements, selectedIds, editingGroupId)
      const copied = elements.filter((el) => ids.includes(el.id)).map((el) => ({ ...el }))
      if (!copied.length) return
      clipboardRef.current = copied
      e.preventDefault()
      e.clipboardData?.setData('text/plain', appClipboardMarker())
      void writeAppClipboardMarker()
    }

    const onPaste = async (e: ClipboardEvent) => {
      if (isEditingField(e.target) || editingTextId) return

      const data = e.clipboardData

      // Last in-app element copy owns the system clipboard — prefer it over a stale image.
      if (isAppClipboardTransfer(data) && clipboardRef.current.length) {
        e.preventDefault()
        pasteAppClipboard()
        return
      }

      const fillableIds = selectedIds.filter((id) => {
        const el = elements.find((item) => item.id === id)
        return el ? canAcceptFillImage(el) : false
      })
      const svgText = await readSvgFromTransfer(data)
      if (svgText) {
        e.preventDefault()
        const board = artboards.find((ab) => ab.id === activeArtboardId) || artboards[0]
        if (board) placeImportedSvg(svgText, board.id)
        return
      }

      const hasClipboardImage = Boolean(
        data &&
          ([...data.items].some((item) => item.type.startsWith('image/')) ||
            [...data.files].some((file) => file.type.startsWith('image/'))),
      )

      if (hasClipboardImage && (fillableIds.length || selectedIds.length === 0)) {
        e.preventDefault()
        const dataUrl = await readClipboardImage(data)
        if (!dataUrl) return
        recordHistory()

        if (fillableIds.length) {
          setElements((prev) =>
            prev.map((el) =>
              fillableIds.includes(el.id)
                ? { ...el, fillImage: dataUrl, fillVar: null }
                : el,
            ),
          )
          return
        }

        // No selection: create a rectangle filled with the pasted image.
        const board = artboards.find((ab) => ab.id === activeArtboardId) || artboards[0]
        if (!board) return
        let w = DEFAULT_PASTE_IMAGE_W
        let h = DEFAULT_PASTE_IMAGE_H
        try {
          const img = await loadHtmlImage(dataUrl)
          const iw = img.naturalWidth || img.width
          const ih = img.naturalHeight || img.height
          if (iw > 0 && ih > 0) {
            const maxW = board.width * 0.5
            const maxH = board.height * 0.5
            const scale = Math.min(1, maxW / iw, maxH / ih)
            w = Math.max(MIN_SIZE, Math.round(iw * scale))
            h = Math.max(MIN_SIZE, Math.round(ih * scale))
          }
        } catch {
          /* keep defaults */
        }
        const boardEls = elementsOnArtboard(elements, board.id)
        const el = {
          ...createDrawnElement(
            'rect',
            {
              x: Math.round((board.width - w) / 2),
              y: Math.round((board.height - h) / 2),
              w,
              h,
            },
            nextZ(boardEls),
            board.id,
          ),
          fillImage: dataUrl,
          fillVar: null,
        }
        setElements((prev) => [...prev, el])
        setSelectedIds([el.id])
        setArtboardSelected(false)
        setEditingGroupId(null)
        setEditingTextId(null)
        return
      }

      if (!clipboardRef.current.length) return
      e.preventDefault()
      pasteAppClipboard()
    }

    window.addEventListener('copy', onCopy)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('paste', onPaste)
    }
  }, [
    selectedIds,
    elements,
    editingGroupId,
    editingTextId,
    recordHistory,
    activeArtboardId,
    artboards,
    placeImportedSvg,
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

  const handleToggleLock = (ids: string[] = selectedIds) => {
    const targets = elements.filter((el) => ids.includes(el.id))
    if (!targets.length) return
    const lock = !targets.every((el) => el.locked)
    recordHistory()
    setElements((prev) =>
      prev.map((el) => (ids.includes(el.id) ? { ...el, locked: lock || undefined } : el)),
    )
  }

  const handleRenameGroup = (groupId: string, name: string) => {
    recordHistory()
    setElements((prev) => renameGroup(prev, groupId, name))
  }

  /** Set selection orientation (degrees). Spins a single element; orbits a group/component. */
  const handleRotateSelection = (degrees: number) => {
    const selected = elements.filter((el) => selectedIds.includes(el.id))
    if (!selected.length) return
    if (selected.length === 1) {
      recordHistory()
      setElements((prev) =>
        prev.map((el) =>
          el.id === selected[0].id ? { ...el, rotation: degrees } : el,
        ),
      )
      return
    }
    const bounds = getBounds(selected)
    if (!bounds) return
    const reference = selected[0].rotation || 0
    const delta = degrees - reference
    if (!delta) {
      recordHistory()
      setElements((prev) =>
        prev.map((el) =>
          selectedIds.includes(el.id) ? { ...el, rotation: degrees } : el,
        ),
      )
      return
    }
    recordHistory()
    const rotated = applyRotationAroundCenter(selected, boundsCenter(bounds), delta)
    const map = Object.fromEntries(rotated.map((el) => [el.id, el]))
    setElements((prev) => prev.map((el) => map[el.id] || el))
  }

  const handleAddVariable = (variable: DesignVariable) => {
    recordHistory()
    setVariables((prev) => [...prev, variable])
  }

  const handleUpdateVariable = (
    id: string,
    patch: { name?: string; value?: string | number },
  ) => {
    // Value changes sync elements and need undo; live rename skips history spam
    if (patch.value != null) recordHistory()
    let next = variables
    if (patch.name != null) next = renameVariable(next, id, patch.name)
    if (patch.value != null) next = updateVariableValue(next, id, patch.value)
    setVariables(next)
    const updated = next.find((v) => v.id === id)
    if (updated && patch.value != null) {
      setElements((els) => syncElementsToVariable(els, updated))
    }
  }

  const handleDeleteVariable = (id: string) => {
    recordHistory()
    setVariables((prev) => prev.filter((v) => v.id !== id))
    setElements((prev) => clearVariableBindings(prev, id))
  }

  const handleSave = () => {
    const doc = serializeWireframe({
      artboards,
      activeArtboardId,
      snapOn,
      elements,
      variables,
      components,
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
      setVariables(doc.variables || [])
      setComponents(doc.components || [])
      setSelectedIds([])
      setArtboardSelected(false)
      setEditingGroupId(null)
      setPlaceTool(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open .wireframe file'
      window.alert(message)
    }
  }

  const canSaveComponent = useMemo(() => {
    const ids = new Set(expandSelectionForGroups(elements, selectedIds, editingGroupId))
    return canSaveSelection(elements.filter((el) => ids.has(el.id)))
  }, [elements, selectedIds, editingGroupId])
  const canGroupSelection = useMemo(() => canGroup(elements, selectedIds), [elements, selectedIds])

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
        selectedExportCount={Math.max(selectedArtboardIds.length, 1)}
        totalExportCount={artboards.length}
        onExportSelected={() =>
          exportArtboards(selectedArtboardIds.length ? selectedArtboardIds : [activeArtboardId])
        }
        onExportAll={() => exportArtboards(artboards.map((ab) => ab.id))}
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
          placeTool={placeTool}
          onPlaceTool={(tool) => {
            setPenDraft(null)
            setEditingPathId(null)
            setPlaceTool(tool)
          }}
          onPaletteDragStart={startPaletteDrag}
          components={components}
          onRenameComponent={(id, name) => {
            recordHistory()
            setComponents(renameComponent(components, id, name))
          }}
          onDeleteComponent={(id) => {
            recordHistory()
            setComponents(removeComponent(components, id))
          }}
          onSaveAsComponent={saveSelectionAsComponent}
          canSaveAsComponent={canSaveComponent}
          variables={variables}
          onAddVariable={handleAddVariable}
          onUpdateVariable={handleUpdateVariable}
          onDeleteVariable={handleDeleteVariable}
          artboards={artboards}
          activeArtboardId={activeArtboardId}
          selectedArtboardIds={selectedArtboardIds}
          onSelectArtboard={(id) => {
            setActiveArtboardId(id)
            setSelectedIds([])
            selectSingleArtboard(true)
            setEditingGroupId(null)
          }}
          onToggleArtboard={toggleArtboardSelection}
          onAddArtboard={addArtboard}
          onAddArtboardPreset={addArtboardPreset}
          onDuplicateArtboard={duplicateArtboard}
          onDeleteArtboard={deleteArtboard}
          canDeleteArtboard={artboards.length > 1}
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
          onToggleLock={handleToggleLock}
          onRenameGroup={handleRenameGroup}
          canGroupSelection={canGroupSelection}
        />

        <div className="stage-wrap" ref={stageWrapRef}>
          <Canvas
            artboards={artboards}
            activeArtboardId={activeArtboardId}
            elements={elements}
            selectedIds={selectedIds}
            selectedArtboardIds={selectedArtboardIds}
            snapOn={snapOn}
            placeTool={placeTool}
            onSelect={setSelectedIds}
            onActiveArtboard={setActiveArtboardId}
            onArtboardSelected={selectSingleArtboard}
            onToggleArtboard={toggleArtboardSelection}
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
            onCornerRadiusChange={(id, cornerRadius) => {
              setElements((prev) =>
                prev.map((el) => (el.id === id ? { ...el, cornerRadius } : el)),
              )
            }}
            onRotateElements={(updates) => {
              const map = Object.fromEntries(updates.map((u) => [u.id, u]))
              setElements((prev) =>
                prev.map((el) => {
                  const u = map[el.id]
                  if (!u) return el
                  return { ...el, x: u.x, y: u.y, rotation: u.rotation }
                }),
              )
            }}
            onEditStart={recordHistory}
            onPlace={place}
            onClearPlace={() => {
              setPenDraft(null)
              setPlaceTool(null)
            }}
            pan={pan}
            zoom={zoom}
            onPanChange={setPan}
            onViewChange={onViewChange}
            editingGroupId={editingGroupId}
            onEditGroup={setEditingGroupId}
            editingTextId={editingTextId}
            onEditText={setEditingTextId}
            onCommitText={commitTextEdit}
            onCancelTextEdit={cancelTextEdit}
            editingPathId={editingPathId}
            onEditPath={setEditingPathId}
            onUpdatePathElement={(id, patch) => {
              setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)))
            }}
            penDraft={penDraft}
            onPenDraftChange={setPenDraft}
            onCommitPenPath={commitPenPath}
            onImportSvg={placeImportedSvg}
            onGroup={handleGroup}
            onUngroup={handleUngroup}
          onToggleLock={handleToggleLock}
          />
        </div>

        {paletteDrag && (
          <div
            className="palette-drag-ghost"
            style={{ left: paletteDrag.x + 12, top: paletteDrag.y + 12 }}
          >
            {paletteDrag.label}
          </div>
        )}

        <Inspector
          elements={elements}
          selectedIds={selectedIds}
          variables={variables}
          onUpdate={updateElements}
          onAddVariable={handleAddVariable}
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
            setEditingTextId(null)
          }}
          onUngroup={handleUngroup}
          onGroup={handleGroup}
          onRenameGroup={handleRenameGroup}
          onSaveAsComponent={saveSelectionAsComponent}
          canSaveAsComponent={canSaveComponent}
          canGroupSelection={canGroupSelection}
          onRotateSelection={handleRotateSelection}
          editingGroupId={editingGroupId}
          onEditGroup={setEditingGroupId}
        />
      </div>
    </div>
  )
}
