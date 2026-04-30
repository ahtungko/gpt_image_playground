import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, DEFAULT_SETTINGS } from '../types'
import { clampCountForSettings, getMaxSelectableCount, getRunningTaskSlots, isKeyBlockedByQuota, isKeyBlockedByTaskLimit } from './keyLimits'

describe('keyLimits', () => {
  it('keeps normal max count at 4 by default', () => {
    expect(getMaxSelectableCount(DEFAULT_SETTINGS)).toBe(4)
    expect(clampCountForSettings(9, DEFAULT_SETTINGS)).toBe(4)
  })

  it('clamps count to backend task limit when background tasks are enabled', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      backgroundTasks: true,
      keyRole: 'user' as const,
      keyMaxRunningTasks: 2,
    }

    expect(getMaxSelectableCount(settings)).toBe(2)
    expect(clampCountForSettings(4, settings)).toBe(2)
  })

  it('clamps count by backend task limit even in direct mode', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      backgroundTasks: false,
      keyRole: 'user' as const,
      keyMaxRunningTasks: 1,
    }

    expect(getMaxSelectableCount(settings)).toBe(1)
    expect(clampCountForSettings(4, settings)).toBe(1)
  })

  it('marks zero task limit as blocked', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      keyRole: 'user' as const,
      keyMaxRunningTasks: 0,
    }

    expect(isKeyBlockedByTaskLimit(settings)).toBe(true)
  })

  it('clamps count by remaining quota', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      keyRole: 'user' as const,
      keyGenerateRemaining: 1,
      keyMaxRunningTasks: 3,
    }

    expect(getMaxSelectableCount(settings)).toBe(1)
    expect(clampCountForSettings(4, settings)).toBe(1)
    expect(isKeyBlockedByQuota({ ...settings, keyGenerateRemaining: 0 })).toBe(true)
  })

  it('uses remaining running task slots for background tasks', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      backgroundTasks: true,
      keyRole: 'user' as const,
      keyMaxRunningTasks: 3,
    }
    const tasks = [
      {
        id: 't1',
        prompt: 'a',
        params: { ...DEFAULT_PARAMS, n: 1 },
        inputImageIds: [],
        outputImages: [],
        backgroundTaskIds: ['a', 'b'],
        status: 'running' as const,
        error: null,
        createdAt: 0,
        finishedAt: null,
        elapsed: null,
      },
    ]

    expect(getRunningTaskSlots(tasks as any)).toBe(2)
    expect(getMaxSelectableCount(settings, tasks as any)).toBe(1)
    expect(isKeyBlockedByTaskLimit(settings, [
      ...tasks,
      {
        ...tasks[0],
        id: 't2',
        backgroundTaskIds: ['c'],
      },
    ] as any)).toBe(true)
  })
})
