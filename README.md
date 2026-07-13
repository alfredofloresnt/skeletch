# Wireframe

Low-fidelity wireframe editor built with React (no extra runtime dependencies).

## Run

```bash
npm install
npm run dev
```

## Features

- Drag or click-place atomic shapes: rectangle, circle, line, text, image placeholder
- Composed widgets (Input, Button, Checkbox, Dropdown, Card, Grid) built from atoms and grouped
- Double-click a group to edit atoms; Ungroup in the inspector
- Freeform canvas: scroll to zoom, Space+drag (or middle-mouse) to pan
- Grid snap (8px), multi-select (⌘/Ctrl+click or marquee)
- Layers tab with drag reorder; layer depth in the inspector
- Frame presets (Phone / Tablet / Desktop) plus custom size
- Save / Open portable `.wireframe` files (JSON) across devices
- Export artboard as PNG
- Full inspector: position, size, text, stroke, fill, opacity, corner radius, layer depth
