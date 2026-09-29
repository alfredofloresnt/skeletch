import { COMPOSED_TYPES, FRAME_PRESETS } from './constants'
import { WIREFRAME_VERSION } from './wireframeFormat'

export type AgentPromptMode = 'create' | 'clone'

const PRESET_LIST = FRAME_PRESETS.map(
  (p) => `"${p.id}" (${p.width}×${p.height})`,
).join(', ')

const GROUP_KINDS = [...COMPOSED_TYPES.map((c) => `"${c.type}"`), '"group"'].join(', ')

const SCHEMA = `\`\`\`ts
// Root document — save as <name>.wireframe (plain JSON, UTF-8)
interface WireframeDocument {
  format: "wireframe"              // literal
  version: ${WIREFRAME_VERSION}                       // literal
  savedAt?: string                 // ISO date
  artboards: Artboard[]            // at least one
  activeArtboardId: string         // id of one artboard
  snapOn: boolean                  // 8px grid snapping in the editor
  elements: WireElement[]
  variables?: DesignVariable[]
  components?: CustomComponentDef[]
}

interface Artboard {
  id: string                       // unique, e.g. "ab_home"
  name: string
  x: number; y: number             // world position; place boards side by side with an 80px gap
  width: number; height: number    // 100..4000
  presetId: string                 // ${PRESET_LIST} or "custom"
}

type AtomicType = "rect" | "circle" | "triangle" | "line" | "text" | "image" | "path"

interface WireElement {
  id: string                       // unique across the document
  type: AtomicType
  artboardId: string               // must match an Artboard.id
  name?: string                    // layer name
  x: number; y: number             // top-left, relative to the artboard origin
  w: number; h: number             // size in px (see "line" below)
  z: number                        // stacking order; unique, higher = on top
  rotation?: number                // degrees, clockwise, around the box center
  fill?: Paint                     // shape fill; for "text" it is the text color
  fillImage?: string | null        // only "data:image/..." URLs (cover fit); otherwise null
  stroke?: Paint
  strokeWidth?: number             // px, 0 = no stroke
  opacity?: number                 // 0..1
  cornerRadius?: number            // rect / image only
  text?: string                    // "text" only; "\\n" for line breaks
  fontSize?: number                // "text" only, px
  textAlign?: "left" | "middle" | "right"
  verticalAlign?: "top" | "middle" | "bottom"
  pathClosed?: boolean             // "path" only
  pathVertices?: PathVertex[]      // "path" only, coordinates normalized 0..100 inside the box
  groupId?: string | null          // elements sharing a groupId move/select together
  groupName?: string               // shown in the layers panel
  groupKind?: string               // ${GROUP_KINDS}
  fillVar?: string | null          // DesignVariable id (color) bound to fill
  fontSizeVar?: string | null      // DesignVariable id (number) bound to fontSize
  cornerRadiusVar?: string | null  // DesignVariable id (number) bound to cornerRadius
}

// Paint: "#rrggbb" | "transparent"
//   | "linear-gradient(<deg>deg, <color> <0-100>%, <color> <0-100>%)"  (exactly 2 stops, 0deg = up)
//   | "radial-gradient(circle, <color> <0-100>%, <color> <0-100>%)"    (exactly 2 stops)
type Paint = string

interface PathVertex {
  x: number; y: number             // anchor, 0..100 in the element box
  in?: { x: number; y: number }    // incoming Bézier handle, offset relative to the anchor
  out?: { x: number; y: number }   // outgoing Bézier handle, offset relative to the anchor
}

interface DesignVariable {
  id: string
  name: string                     // no leading "$"
  type: "color" | "number"
  value: string | number           // "#rrggbb" for color
}

interface CustomComponentDef {     // reusable component library
  id: string
  name: string
  // WireElement fields without id/z/artboardId/group*/…Var; x/y relative to the component's top-left
  parts: Omit<WireElement, "id" | "z" | "artboardId" | "groupId" | "groupName" | "groupKind"
    | "fillVar" | "fontSizeVar" | "cornerRadiusVar">[]
}
\`\`\``

const RULES = `## Rules
- Output ONE valid JSON object that matches the schema. No comments, no trailing commas, no markdown around it when writing the file.
- Only the listed fields exist; unknown fields are dropped and invalid colors become "#1a1a1a".
- Colors are lowercase 6-digit hex ("#1f6feb") or "transparent". No rgb(), hsl(), or color names.
- Coordinates are artboard-local pixels. Keep every element inside its artboard.
- "z" must be unique; draw backgrounds first (low z), then content, then text (high z).
- "rect": box; use cornerRadius for rounded corners.
- "circle": ellipse filling its box.
- "triangle": points up (top-center, bottom-right, bottom-left).
- "line": starts at (x, y) and ends at (x + w, y + h); w/h may be negative or 0. Uses stroke only.
- "text": single text block. Set fill to the text color, stroke "transparent", strokeWidth 0. Size the box to fit the text (≈ fontSize × 1.2 per line, ≈ 0.55 × fontSize per character).
- "image": placeholder box with an X unless fillImage is a data URL. Use it for photos, avatars, illustrations, and maps.
- "path": vector shape (icons, logos, curves). Vertices are normalized to the element box (0..100 on both axes).
- Composite widgets (buttons, inputs, cards…) are several atomic elements that share the same groupId, groupName, and groupKind.
- For repeated values (brand colors, spacing, font sizes), define variables and set both the literal value and the *Var binding, e.g. fill: "#1f6feb", fillVar: "var_primary".
- Defaults when unsure: stroke "#1a1a1a", strokeWidth 2 for shapes, opacity 1, rotation 0.`

const EXAMPLE = `## Minimal example
\`\`\`json
{
  "format": "wireframe",
  "version": ${WIREFRAME_VERSION},
  "artboards": [
    { "id": "ab_login", "name": "Login", "x": 0, "y": 0, "width": 390, "height": 844, "presetId": "phone" }
  ],
  "activeArtboardId": "ab_login",
  "snapOn": true,
  "variables": [
    { "id": "var_primary", "name": "primary", "type": "color", "value": "#1f6feb" }
  ],
  "elements": [
    { "id": "el_bg", "type": "rect", "artboardId": "ab_login", "name": "Background",
      "x": 0, "y": 0, "w": 390, "h": 844, "z": 1,
      "fill": "linear-gradient(180deg, #ffffff 0%, #eef2f7 100%)", "stroke": "transparent", "strokeWidth": 0, "opacity": 1 },
    { "id": "el_title", "type": "text", "artboardId": "ab_login", "name": "Title",
      "x": 24, "y": 120, "w": 342, "h": 40, "z": 2, "text": "Welcome back", "fontSize": 32,
      "textAlign": "left", "verticalAlign": "middle", "fill": "#1a1a1a", "stroke": "transparent", "strokeWidth": 0, "opacity": 1 },
    { "id": "el_btn_bg", "type": "rect", "artboardId": "ab_login", "name": "Button · bg",
      "x": 24, "y": 720, "w": 342, "h": 52, "z": 3, "cornerRadius": 12,
      "fill": "#1f6feb", "fillVar": "var_primary", "stroke": "transparent", "strokeWidth": 0, "opacity": 1,
      "groupId": "grp_signin", "groupName": "Sign in button", "groupKind": "button" },
    { "id": "el_btn_label", "type": "text", "artboardId": "ab_login", "name": "Button · label",
      "x": 24, "y": 720, "w": 342, "h": 52, "z": 4, "text": "Sign in", "fontSize": 16,
      "textAlign": "middle", "verticalAlign": "middle", "fill": "#ffffff", "stroke": "transparent", "strokeWidth": 0, "opacity": 1,
      "groupId": "grp_signin", "groupName": "Sign in button", "groupKind": "button" }
  ]
}
\`\`\``

const INTRO: Record<AgentPromptMode, string> = {
  create: `You are generating a UI mockup for Skeletch, a wireframe/mockup editor. Skeletch opens portable \`.wireframe\` files (JSON).

## Task
Create a new \`.wireframe\` document for the design I describe below. Pick the artboard preset that fits the target device, use one artboard per screen, and lay elements out on an 8px grid with consistent spacing, alignment, and a clear visual hierarchy.

Design to create:
<describe the screens, content, and style here>`,
  clone: `You are generating a UI mockup for Skeletch, a wireframe/mockup editor. Skeletch opens portable \`.wireframe\` files (JSON).

## Task
Clone the reference UI I provide (screenshot, URL, or existing code) into a \`.wireframe\` document that is as faithful as possible:
- Use one artboard per screen. Match the reference dimensions (e.g. 390×844 phone, 1440×900 desktop); use "custom" when none of the presets fit.
- Measure positions and sizes from the reference and reproduce them in artboard-local pixels.
- Copy all visible text verbatim, with matching font sizes, alignment, and colors.
- Sample exact colors as hex. Turn repeated colors and sizes into variables.
- Rebuild icons and logos as "path" elements when practical; use "image" placeholders for photos and illustrations.
- Group each widget (button, input, card, nav item…) with a shared groupId and a fitting groupKind.
- Keep the layer order: backgrounds → containers → content → text.

Reference to clone:
<attach or paste the screenshot / URL / code here>`,
}

export function buildAgentPrompt(mode: AgentPromptMode): string {
  return [
    INTRO[mode],
    '## .wireframe schema',
    SCHEMA,
    RULES,
    EXAMPLE,
    '## Output\nReturn only the complete `.wireframe` JSON (or write it to a `.wireframe` file). I will load it in Skeletch with Open.',
  ].join('\n\n')
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to the legacy path (e.g. insecure context).
    }
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  if (!ok) throw new Error('Clipboard unavailable')
}
