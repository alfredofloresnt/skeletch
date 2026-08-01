# Skeletch

A low-fidelity wireframe editor for sketching UI layouts in the browser. Built with React, TypeScript, and Vite — no extra runtime dependencies.

**[Open Skeletch →](https://alfredofloresnt.github.io/skeletch/)**

## Features

- **Icon tool rail** — place rectangles, circles, triangles, lines, and text from a compact left toolbar; bottom icons open drawers for Components, Document, Artboards, and Layers
- **Shapes & widgets** — atomic shapes plus composed UI: image (rect + diagonals), input, search, button, checkbox, switch, slider, dropdown, card, slideshow, and grid
- **Multi-artboard canvas** — place multiple boards (Phone / Tablet / Desktop / custom sizes) on one infinite stage; create boards from the Artboards drawer; drag elements between boards
- **Document drawer** — design variables (color/number, bindable to Fill, font size, corner radius)
- **Custom components** — save a selection as a reusable component from Layers, Components, or Inspector; stored in the `.wireframe` and placeable from Components
- **Groups & layers** — group elements, double-click to edit inside a group, reorder layers for the active board, and control depth in the inspector
- **Inspector** — position, size, text, stroke, fill, opacity, corner radius, and layer depth
- **Portable files** — save and open `.wireframe` JSON documents (v2 multi-artboard; includes variables and components; v1 files migrate); export the active artboard as PNG

## Shortcuts

| Action | Keys |
| --- | --- |
| Pan | Space + drag, or middle-mouse drag |
| Zoom | Scroll |
| Multi-select | ⌘/Ctrl + click, or marquee |
| Undo | ⌘/Ctrl + Z |
| Copy / Paste | ⌘/Ctrl + C / V |
| Group / Ungroup | ⌘/Ctrl + G / ⌘/Ctrl + Shift + G |
| Nudge | Arrow keys (Shift for 8px) |
| Delete | Delete / Backspace (elements, or selected artboard) |
| Clear selection | Esc |

## Develop

```bash
npm install
npm run dev
```

App: [http://localhost:5173/skeletch/](http://localhost:5173/skeletch/)

```bash
npm run build    # production build → dist/
npm run preview  # preview the production build
npm run lint     # oxlint
```

## Deploy


Demo: https://alfredofloresnt.github.io/skeletch/
