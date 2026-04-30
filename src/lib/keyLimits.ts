import type { AppSettings, TaskRecord } from '../types'

export const API_MAX_COUNT = 4
export interface KeyLimitOptions {
  isEdit?: boolean
}

export function getBackendTaskLimit(settings: AppSettings): number | null {
  if (settings.keyRole !== 'user') return null
  if (settings.keyMaxRunningTasks == null) return null

  const value = Math.floor(Number(settings.keyMaxRunningTasks))
  return Number.isFinite(value) ? Math.max(0, value) : null
}

export function getRemainingQuota(settings: AppSettings, options: KeyLimitOptions = {}): number | null {
  if (settings.keyRole !== 'user') return null
  const raw = options.isEdit ? settings.keyEditRemaining : settings.keyGenerateRemaining
  if (raw == null) return null
  const value = Math.floor(Number(raw))
  return Number.isFinite(value) ? Math.max(0, value) : null
}

export function isKeyBlockedByQuota(settings: AppSettings, options: KeyLimitOptions = {}): boolean {
  return getRemainingQuota(settings, options) === 0
}

export function isKeyBlockedByTaskLimit(settings: AppSettings, tasks: TaskRecord[] = []): boolean {
  const limit = getBackendTaskLimit(settings)
  if (limit === 0) return true
  const available = getAvailableTaskSlots(settings, tasks)
  return available === 0
}

export function getRunningTaskSlots(tasks: TaskRecord[]): number {
  return tasks.reduce((sum, task) => {
    if (task.status !== 'running') return sum
    if (task.backgroundTaskIds?.length) return sum + task.backgroundTaskIds.length
    return sum + 1
  }, 0)
}

export function getAvailableTaskSlots(settings: AppSettings, tasks: TaskRecord[]): number | null {
  const limit = getBackendTaskLimit(settings)
  if (limit == null) return null
  return Math.max(0, limit - getRunningTaskSlots(tasks))
}

export function getMaxSelectableCount(
  settings: AppSettings,
  tasks: TaskRecord[] = [],
  options: KeyLimitOptions = {},
): number {
  const limit = getBackendTaskLimit(settings)
  const quotaRemaining = getRemainingQuota(settings, options)
  let countLimit = API_MAX_COUNT
  if (limit != null) {
    const effectiveTaskLimit = settings.backgroundTasks
      ? (getAvailableTaskSlots(settings, tasks) ?? limit)
      : limit
    countLimit = Math.min(countLimit, Math.max(1, effectiveTaskLimit))
  }
  if (quotaRemaining != null) {
    countLimit = Math.min(countLimit, Math.max(1, quotaRemaining))
  }
  return countLimit
}

export function clampCountForSettings(
  value: number,
  settings: AppSettings,
  tasks: TaskRecord[] = [],
  options: KeyLimitOptions = {},
): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : 1
  return Math.max(1, Math.min(getMaxSelectableCount(settings, tasks, options), normalized || 1))
}
