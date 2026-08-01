const MAX_SVG_BYTES = 2_000_000

export type ImportedSvg = {
  dataUrl: string
  width: number
  height: number
}

function numericLength(value: string | null): number | null {
  if (!value || value.trim().endsWith('%')) return null
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i)
  if (!match) return null
  const number = Number(match[1])
  return Number.isFinite(number) && number > 0 ? number : null
}

function extractSvgMarkup(value: string): string | null {
  const start = value.search(/<svg[\s>]/i)
  if (start < 0) return null
  const endMatch = /<\/svg\s*>/gi
  endMatch.lastIndex = start
  let match: RegExpExecArray | null = null
  let last: RegExpExecArray | null = null
  while ((match = endMatch.exec(value))) last = match
  return last ? value.slice(start, last.index + last[0].length) : null
}

function safeReference(value: string): boolean {
  const trimmed = value.trim()
  return (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('data:image/') ||
    trimmed === 'none'
  )
}

/** Remove active content and external resource references before embedding the SVG. */
function sanitizeSvg(svgText: string): SVGSVGElement {
  if (svgText.length > MAX_SVG_BYTES) throw new Error('SVG is too large')
  const markup = extractSvgMarkup(svgText)
  if (!markup) throw new Error('No SVG markup found')

  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
  if (doc.querySelector('parsererror')) throw new Error('Invalid SVG')
  const root = doc.documentElement
  if (root.localName.toLowerCase() !== 'svg') throw new Error('Invalid SVG root')

  root
    .querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, style')
    .forEach((node) => node.remove())

  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value
      if (name.startsWith('on')) {
        element.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'xlink:href' || name === 'src') && !safeReference(value)) {
        element.removeAttribute(attr.name)
        continue
      }
      if (/url\s*\(/i.test(value) && !/url\s*\(\s*['"]?#/i.test(value)) {
        element.removeAttribute(attr.name)
      }
    }
  }

  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return root as unknown as SVGSVGElement
}

export function importSvg(svgText: string): ImportedSvg {
  const root = sanitizeSvg(svgText)
  const viewBox = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)

  const viewBoxWidth =
    viewBox?.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0
      ? viewBox[2]
      : null
  const viewBoxHeight =
    viewBox?.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0
      ? viewBox[3]
      : null

  const width = numericLength(root.getAttribute('width')) || viewBoxWidth || 160
  const height = numericLength(root.getAttribute('height')) || viewBoxHeight || 120
  const serialized = new XMLSerializer().serializeToString(root)

  return {
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`,
    width,
    height,
  }
}

export function hasSvgTransfer(data: DataTransfer | null): boolean {
  if (!data) return false
  // Browsers often hide filenames and MIME types until drop.
  if ([...data.types].includes('Files')) return true
  return (
    [...data.items].some(
      (item) =>
        item.type === 'image/svg+xml' ||
        item.type === 'text/plain' ||
        item.type === 'text/html',
    ) ||
    [...data.files].some(
      (file) => file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'),
    )
  )
}

/** Read SVG from a clipboard or file drop, including raw copied markup. */
export async function readSvgFromTransfer(data: DataTransfer | null): Promise<string | null> {
  if (!data) return null

  const file =
    [...data.files].find(
      (entry) =>
        entry.type === 'image/svg+xml' || entry.name.toLowerCase().endsWith('.svg'),
    ) ||
    [...data.items]
      .find((entry) => entry.type === 'image/svg+xml' && entry.kind === 'file')
      ?.getAsFile()
  if (file) return extractSvgMarkup(await file.text())

  for (const type of ['image/svg+xml', 'text/plain', 'text/html']) {
    const value = data.getData(type)
    const markup = extractSvgMarkup(value)
    if (markup) return markup
  }

  return null
}
