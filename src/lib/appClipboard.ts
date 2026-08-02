/** Marker written to the system clipboard when copying canvas elements. */
export const APP_CLIPBOARD_PREFIX = 'skeletch-clipboard:v1'

export function appClipboardMarker(): string {
  return APP_CLIPBOARD_PREFIX
}

export function isAppClipboardText(text: string | null | undefined): boolean {
  return Boolean(text?.startsWith(APP_CLIPBOARD_PREFIX))
}

/** True when the paste payload is our in-app element copy (not an external image/SVG). */
export function isAppClipboardTransfer(data: DataTransfer | null): boolean {
  if (!data) return false
  return isAppClipboardText(data.getData('text/plain'))
}

/** Replace the system clipboard so a prior image/SVG no longer wins on paste. */
export async function writeAppClipboardMarker(): Promise<void> {
  const marker = appClipboardMarker()
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(marker)
      return
    }
  } catch {
    /* fall through */
  }
}
