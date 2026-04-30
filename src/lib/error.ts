import type { TaskErrorKind } from '../types'
import { translate, type Locale, type MessageKey } from './i18n'

export interface NormalizedTaskError {
  kind: TaskErrorKind
  message: string
  detail: string
  status?: number
  code?: string
}

const ERROR_MESSAGE_KEYS: Record<TaskErrorKind, MessageKey> = {
  auth: 'error.kind.auth',
  quota: 'error.kind.quota',
  rate_limit: 'error.kind.rate_limit',
  content_policy: 'error.kind.content_policy',
  no_image: 'error.kind.no_image',
  network: 'error.kind.network',
  timeout: 'error.kind.timeout',
  server: 'error.kind.server',
  unknown: 'error.kind.unknown',
}

export class AppError extends Error {
  kind: TaskErrorKind
  detail: string
  status?: number
  code?: string

  constructor(error: NormalizedTaskError) {
    super(error.message)
    this.name = 'AppError'
    this.kind = error.kind
    this.detail = error.detail
    this.status = error.status
    this.code = error.code
  }
}

export function friendlyErrorMessage(kind: TaskErrorKind, locale?: Locale): string {
  return translate(locale, ERROR_MESSAGE_KEYS[kind])
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

function statusFromDetail(detail: string): number | undefined {
  const match = detail.match(/\bHTTP\s+(\d{3})\b/i)
  return match ? Number(match[1]) : undefined
}

function cleanDetail(detail: string): string {
  return detail.replace(/\r\n/g, '\n').trim()
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function classifyError(detail: string, status?: number, code?: string): TaskErrorKind {
  const effectiveStatus = status ?? statusFromDetail(detail)
  const text = `${code ?? ''} ${detail}`.toLowerCase()

  if (
    effectiveStatus === 401 ||
    effectiveStatus === 403 ||
    hasAny(text, [
      /\binvalid[_\s-]?api[_\s-]?key\b/,
      /\bincorrect api key\b/,
      /\bunauthori[sz]ed\b/,
      /\bforbidden\b/,
      /\bauthentication\b/,
      /\bpermission denied\b/,
      /\brevoked\b/,
      /\bdeactivated\b/,
      /\binactive api key\b/,
      /\bdisabled api key\b/,
      /\bapi key\b.*\b(disabled|deactivated|inactive|revoked)\b/,
      /\bkey\b.*\b(disabled|deactivated|inactive|revoked)\b/,
    ])
  ) {
    return 'auth'
  }

  if (
    hasAny(text, [
      /\binsufficient[_\s-]?quota\b/,
      /\bquota\b/,
      /\bbilling\b/,
      /\bcredit(?:s)?\b/,
      /\bhard limit\b/,
      /\bpayment\b/,
      /\bno quota\b/,
      /\bout of quota\b/,
    ])
  ) {
    return 'quota'
  }

  if (
    effectiveStatus === 429 ||
    hasAny(text, [
      /\brate[_\s-]?limit(?:ed)?\b/,
      /\btoo many requests\b/,
      /\bslow down\b/,
      /\brequests per\b/,
      /\brunning tasks?\b/,
    ])
  ) {
    return 'rate_limit'
  }

  if (
    hasAny(text, [
      /\bcontent[_\s-]?policy\b/,
      /\bsafety\b/,
      /\bmoderation\b/,
      /\bnot allowed\b/,
      /\bdisallowed\b/,
      /\bunsafe\b/,
      /\bpolicy violation\b/,
    ])
  ) {
    return 'content_policy'
  }

  if (
    hasAny(text, [
      /\babort(?:ed)?\b/,
      /\btimeout\b/,
      /\btimed out\b/,
    ])
  ) {
    return 'timeout'
  }

  if (
    hasAny(text, [
      /\bfailed to fetch\b/,
      /\bnetworkerror\b/,
      /\bnetwork error\b/,
      /\bcors\b/,
      /\bload failed\b/,
      /\binternet disconnected\b/,
    ])
  ) {
    return 'network'
  }

  if (effectiveStatus != null && effectiveStatus >= 500) {
    return 'server'
  }

  if (
    hasAny(text, [
      /\bapi returned no (?:usable )?image data\b/,
      /\bno image\b/,
      /\bno usable image\b/,
      /\bresponded with text\b/,
      /\bdo you want me to\b/,
      /\bthis is actually\b/,
      /\binstead of\b/,
    ])
  ) {
    return 'no_image'
  }

  return 'unknown'
}

export function createAppError(
  detail: string,
  options: {
    kind?: TaskErrorKind
    status?: number
    code?: string
    locale?: Locale
  } = {},
): AppError {
  const normalizedDetail = cleanDetail(detail) || (options.status ? `HTTP ${options.status}` : 'Unknown error')
  const kind = options.kind ?? classifyError(normalizedDetail, options.status, options.code)
  return new AppError({
    kind,
    message: friendlyErrorMessage(kind, options.locale),
    detail: normalizedDetail,
    status: options.status,
    code: options.code,
  })
}

export function normalizeCaughtError(err: unknown, locale?: Locale): NormalizedTaskError {
  if (err instanceof AppError) {
    return {
      kind: err.kind,
      message: friendlyErrorMessage(err.kind, locale),
      detail: err.detail,
      status: err.status,
      code: err.code,
    }
  }

  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    const detail = err.message || 'Request aborted'
    return {
      kind: 'timeout',
      message: friendlyErrorMessage('timeout', locale),
      detail,
    }
  }

  if (err instanceof Error) {
    const detail = cleanDetail(err.message || err.name || 'Unknown error')
    const kind = err.name === 'AbortError'
      ? 'timeout'
      : classifyError(detail)
    return {
      kind,
      message: friendlyErrorMessage(kind, locale),
      detail,
    }
  }

  const detail = cleanDetail(stringifyUnknown(err))
  const kind = classifyError(detail)
  return {
    kind,
    message: friendlyErrorMessage(kind, locale),
    detail,
  }
}
