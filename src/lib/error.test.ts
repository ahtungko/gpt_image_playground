import { describe, expect, it } from 'vitest'
import { classifyError, normalizeCaughtError } from './error'

describe('error normalization', () => {
  it('classifies common API/browser failures', () => {
    expect(classifyError('API key has been disabled')).toBe('auth')
    expect(classifyError('insufficient_quota: billing hard limit reached', 429)).toBe('quota')
    expect(classifyError('Too many requests', 429)).toBe('rate_limit')
    expect(classifyError('Request was blocked by content_policy')).toBe('content_policy')
    expect(classifyError('Failed to fetch')).toBe('network')
    expect(classifyError('This is actually an image of a kitten. Do you want me to generate another?')).toBe('no_image')
  })

  it('keeps raw detail while returning a friendly message', () => {
    const detail = 'API key has been disabled'
    const normalized = normalizeCaughtError(new Error(detail), 'en')

    expect(normalized.kind).toBe('auth')
    expect(normalized.message).toContain('API key')
    expect(normalized.detail).toBe(detail)
  })
})
