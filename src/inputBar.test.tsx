import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_SETTINGS, normalizeSettings } from './lib/apiProfiles'
import { DEFAULT_PARAMS, type AppSettings, type TaskRecord } from './types'

const storeMock = vi.hoisted(() => {
  let state: any
  const useStore = ((selector: (value: any) => any) => selector(state)) as any

  return {
    useStore,
    setState(nextState: any) {
      state = nextState
    },
    getState() {
      return state
    },
  }
})

vi.mock('./store', () => ({
  useStore: storeMock.useStore,
  submitTask: vi.fn(),
  addImageFromFile: vi.fn(),
  updateTaskInStore: vi.fn(),
  removeMultipleTasks: vi.fn(),
  getCachedImage: vi.fn(),
  ensureImageCached: vi.fn(),
}))

import InputBar from './components/InputBar'

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-a',
    prompt: 'prompt',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: [],
    maskTargetImageId: null,
    maskImageId: null,
    outputImages: [],
    status: 'done',
    error: null,
    createdAt: 1,
    finishedAt: 2,
    elapsed: 1,
    ...overrides,
  }
}

function makeSettings(overrides: Partial<AppSettings> = {}) {
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    language: 'en',
    ...overrides,
  })
  const activeProfile = settings.profiles.find((profile) => profile.id === settings.activeProfileId)
  if (activeProfile) activeProfile.apiKey = 'test-key'
  settings.apiKey = 'test-key'
  return settings
}

function renderInputBar() {
  return renderToStaticMarkup(React.createElement(InputBar)).replace(/\s+/g, ' ')
}

describe('InputBar count control', () => {
  beforeEach(() => {
    ;(globalThis as any).window = {
      innerWidth: 1280,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout,
      clearTimeout,
    }
    ;(globalThis as any).document = {
      body: { style: {} },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    storeMock.setState({
      prompt: 'draw a cat',
      setPrompt: vi.fn(),
      inputImages: [],
      removeInputImage: vi.fn(),
      clearInputImages: vi.fn(),
      params: { ...DEFAULT_PARAMS, n: 2 },
      setParams: vi.fn(),
      settings: makeSettings({
        keyRole: 'user',
        keyMaxRunningTasks: 2,
      }),
      reusedTaskApiProfileId: null,
      setShowSettings: vi.fn(),
      setLightboxImageId: vi.fn(),
      showToast: vi.fn(),
      setConfirmDialog: vi.fn(),
      selectedTaskIds: [],
      setSelectedTaskIds: vi.fn(),
      clearSelection: vi.fn(),
      tasks: [task({ id: 'running-task', status: 'running', finishedAt: null, elapsed: null })],
      filterStatus: 'all',
      filterFavorite: false,
      searchQuery: '',
      maskDraft: null,
      clearMaskDraft: vi.fn(),
      setMaskEditorImageId: vi.fn(),
      moveInputImage: vi.fn(),
    })
  })

  it('keeps the merged frontend count selector behavior for capped user keys', () => {
    const html = renderInputBar()

    expect(html).toContain('Count · max 2')
    expect(html).not.toMatch(/Count(?:[^<]*)<\/span>\s*<input[^>]*type="number"/)
  })
})
