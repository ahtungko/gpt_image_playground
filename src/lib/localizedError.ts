import { translate, type Locale, type MessageKey } from './i18n'

export function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function knownErrorKey(message: string): MessageKey | null {
  if (/Canvas is not supported by this browser/i.test(message)) return 'mask.canvasUnsupported'
  if (/Image load failed/i.test(message)) return 'error.imageLoadFailed'
  if (/Image export failed/i.test(message)) return 'mask.exportFailed'
  if (/Mask size does not match the mask target image/i.test(message)) return 'mask.sizeMismatchRedraw'
  if (/Mask size does not match the current image/i.test(message)) return 'mask.sizeMismatch'
  if (/遮罩主图已不存在/.test(message)) return 'mask.targetMissing'
  if (/请先涂抹需要编辑的区域/.test(message)) return 'mask.paintRequired'
  return null
}

export function localizeKnownError(err: unknown, locale?: Locale): string {
  const message = errorToString(err)
  const key = knownErrorKey(message)
  return key ? translate(locale, key) : message
}
