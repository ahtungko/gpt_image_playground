import type { AppSettings } from '../types'

export const API_MAX_COUNT = 4

export function getBackendTaskLimit(settings: AppSettings): number | null {
  if (settings.keyRole !== 'user') return null
  if (settings.keyMaxRunningTasks == null) return null

  const value = Math.floor(Number(settings.keyMaxRunningTasks))
  return Number.isFinite(value) ? Math.max(0, value) : null
}

export function isKeyBlockedByTaskLimit(settings: AppSettings): boolean {
  const limit = getBackendTaskLimit(settings)
  return limit === 0
}

export function getMaxSelectableCount(settings: AppSettings): number {
  const limit = getBackendTaskLimit(settings)
  if (limit == null) return API_MAX_COUNT
  return Math.min(API_MAX_COUNT, Math.max(1, limit))
}

export function clampCountForSettings(value: number, settings: AppSettings): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : 1
  return Math.max(1, Math.min(getMaxSelectableCount(settings), normalized || 1))
}
