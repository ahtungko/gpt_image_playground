import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../types'
import { clampCountForSettings, getMaxSelectableCount, isKeyBlockedByTaskLimit } from './keyLimits'

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
})
