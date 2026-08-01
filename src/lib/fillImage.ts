import type { AtomicType, WireElement } from './types'

const FILLABLE: AtomicType[] = ['rect', 'circle', 'triangle', 'image']

export function canAcceptFillImage(el: WireElement): boolean {
  return FILLABLE.includes(el.type)
}

/** Read the first image from a paste/drop clipboard as a data URL. */
export function readClipboardImage(data: DataTransfer | null): Promise<string | null> {
  if (!data) return Promise.resolve(null)

  const item = [...data.items].find((entry) => entry.type.startsWith('image/'))
  const file = item?.getAsFile() || [...data.files].find((f) => f.type.startsWith('image/'))
  if (!file) return Promise.resolve(null)

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null
      resolve(result?.startsWith('data:image/') ? result : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

/** Draw an image inside a box with object-fit: cover. */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih || w <= 0 || h <= 0) return
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}
