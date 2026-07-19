# Skeletch

A low-fidelity wireframe editor for sketching UI layouts in the browser. Built with React, TypeScript, and Vite — no extra runtime dependencies.

**[Open Skeletch →](https://alfredofloresnt.github.io/skeletch/)**

## Features

- **Shapes & widgets** — rectangles, circles, triangles, lines, text, and image placeholders, plus composed UI: input, search, button, checkbox, switch, slider, dropdown, card, slideshow, and grid
- **Canvas** — freeform pan/zoom artboard with 8px grid snap, multi-select, and frame presets (Phone / Tablet / Desktop) or custom size
- **Groups & layers** — group elements, double-click to edit inside a group, reorder in the Layers tab, and control depth in the inspector
- **Inspector** — position, size, text, stroke, fill, opacity, corner radius, and layer depth
- **Portable files** — save and open `.wireframe` JSON documents; export the artboard as PNG

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
| Delete | Delete / Backspace |
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

Pushes to `main` build and publish to GitHub Pages via Actions (`.github/workflows/deploy.yml`).

Demo: https://alfredofloresnt.github.io/skeletch/
