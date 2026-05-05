import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppSettings,
  TaskParams,
  InputImage,
  MaskDraft,
  TaskRecord,
  ExportData,
} from './types'
import { DEFAULT_SETTINGS, DEFAULT_PARAMS } from './types'
import {
  getAllTasks,
  putTask,
  deleteTask as dbDeleteTask,
  clearTasks as dbClearTasks,
  getImage,
  getAllImages,
  putImage,
  deleteImage,
  clearImages,
  storeImage,
  hashDataUrl,
} from './lib/db'
import {
  callBackgroundImageApi,
  callImageApi,
  canUseBackgroundImageTasks,
  createBackgroundImageTaskIds,
  fetchBackendKeyProfile,
} from './lib/api'
import { normalizeCaughtError } from './lib/error'
import { validateMaskMatchesImage } from './lib/canvasImage'
import { localizeKnownError } from './lib/localizedError'
import { clampCountForSettings, getAvailableTaskSlots, isKeyBlockedByQuota, isKeyBlockedByTaskLimit } from './lib/keyLimits'
import { orderInputImagesForMask } from './lib/mask'
import { normalizeImageSize } from './lib/size'
import { normalizeLocale, translate, type MessageKey } from './lib/i18n'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'

// ===== Image cache =====
// 内存缓存，id → dataUrl，避免每次从 IndexedDB 读取

const imageCache = new Map<string, string>()

export function getCachedImage(id: string): string | undefined {
  return imageCache.get(id)
}

export async function ensureImageCached(id: string): Promise<string | undefined> {
  if (imageCache.has(id)) return imageCache.get(id)
  const rec = await getImage(id)
  if (rec) {
    imageCache.set(id, rec.dataUrl)
    return rec.dataUrl
  }
  return undefined
}

function orderImagesWithMaskFirst(images: InputImage[], maskTargetImageId: string | null | undefined) {
  if (!maskTargetImageId) return images
  const maskIdx = images.findIndex((img) => img.id === maskTargetImageId)
  if (maskIdx <= 0) return images
  const next = [...images]
  const [maskImage] = next.splice(maskIdx, 1)
  next.unshift(maskImage)
  return next
}

// ===== Store 类型 =====

interface AppState {
  // 设置
  settings: AppSettings
  setSettings: (s: Partial<AppSettings>) => void
  dismissedCodexCliPrompts: string[]
  dismissCodexCliPrompt: (key: string) => void

  // 输入
  prompt: string
  setPrompt: (p: string) => void
  inputImages: InputImage[]
  addInputImage: (img: InputImage) => void
  removeInputImage: (idx: number) => void
  clearInputImages: () => void
  setInputImages: (imgs: InputImage[]) => void
  moveInputImage: (fromIdx: number, toIdx: number) => void
  maskDraft: MaskDraft | null
  setMaskDraft: (draft: MaskDraft | null) => void
  clearMaskDraft: () => void
  maskEditorImageId: string | null
  setMaskEditorImageId: (id: string | null) => void

  // 参数
  params: TaskParams
  setParams: (p: Partial<TaskParams>) => void

  // 任务列表
  tasks: TaskRecord[]
  setTasks: (t: TaskRecord[]) => void

  // 搜索和筛选
  searchQuery: string
  setSearchQuery: (q: string) => void
  filterStatus: 'all' | 'running' | 'done' | 'error'
  setFilterStatus: (status: AppState['filterStatus']) => void
  filterFavorite: boolean
  setFilterFavorite: (f: boolean) => void

  // 多选
  selectedTaskIds: string[]
  setSelectedTaskIds: (ids: string[] | ((prev: string[]) => string[])) => void
  toggleTaskSelection: (id: string, force?: boolean) => void
  clearSelection: () => void

  // UI
  detailTaskId: string | null
  setDetailTaskId: (id: string | null) => void
  lightboxImageId: string | null
  lightboxImageList: string[]
  setLightboxImageId: (id: string | null, list?: string[]) => void
  showSettings: boolean
  setShowSettings: (v: boolean) => void

  // Toast
  toast: { message: string; type: 'info' | 'success' | 'error' } | null
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void

  // Confirm dialog
  confirmDialog: {
    title: string
    message: string
    confirmText?: string
    showCancel?: boolean
    icon?: 'info'
    minConfirmDelayMs?: number
    messageAlign?: 'left' | 'center'
    tone?: 'danger' | 'warning'
    action: () => void
    cancelAction?: () => void
  } | null
  setConfirmDialog: (d: AppState['confirmDialog']) => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Settings
      settings: { ...DEFAULT_SETTINGS },
      setSettings: (s) => set((st) => ({
        settings: {
          ...st.settings,
          ...s,
          baseUrl: DEFAULT_SETTINGS.baseUrl,
          apiMode:
            s.apiMode === 'images' || s.apiMode === 'responses'
              ? s.apiMode
              : st.settings.apiMode ?? DEFAULT_SETTINGS.apiMode,
          codexCli: s.codexCli ?? st.settings.codexCli ?? DEFAULT_SETTINGS.codexCli,
          apiProxy: s.apiProxy ?? st.settings.apiProxy ?? DEFAULT_SETTINGS.apiProxy,
          backgroundTasks: s.backgroundTasks ?? st.settings.backgroundTasks ?? DEFAULT_SETTINGS.backgroundTasks,
          language: normalizeLocale(s.language ?? st.settings.language ?? DEFAULT_SETTINGS.language),
          keyRole: s.keyRole ?? st.settings.keyRole ?? DEFAULT_SETTINGS.keyRole,
          keyName: s.keyName ?? st.settings.keyName ?? DEFAULT_SETTINGS.keyName,
          keyGenerateRemaining: s.keyGenerateRemaining ?? st.settings.keyGenerateRemaining ?? DEFAULT_SETTINGS.keyGenerateRemaining,
          keyEditRemaining: s.keyEditRemaining ?? st.settings.keyEditRemaining ?? DEFAULT_SETTINGS.keyEditRemaining,
          keyMaxRunningTasks: s.keyMaxRunningTasks ?? st.settings.keyMaxRunningTasks ?? DEFAULT_SETTINGS.keyMaxRunningTasks,
        },
      })),
      dismissedCodexCliPrompts: [],
      dismissCodexCliPrompt: (key) => set((st) => ({
        dismissedCodexCliPrompts: st.dismissedCodexCliPrompts.includes(key)
          ? st.dismissedCodexCliPrompts
          : [...st.dismissedCodexCliPrompts, key],
      })),

      // Input
      prompt: '',
      setPrompt: (prompt) => set({ prompt }),
      inputImages: [],
      addInputImage: (img) =>
        set((s) => {
          if (s.inputImages.find((i) => i.id === img.id)) return s
          return { inputImages: [...s.inputImages, img] }
        }),
      removeInputImage: (idx) =>
        set((s) => {
          const removed = s.inputImages[idx]
          const shouldClearMask = removed?.id === s.maskDraft?.targetImageId
          return {
            inputImages: s.inputImages.filter((_, i) => i !== idx),
            ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
          }
        }),
      clearInputImages: () =>
        set((s) => {
          for (const img of s.inputImages) imageCache.delete(img.id)
          return { inputImages: [], maskDraft: null, maskEditorImageId: null }
        }),
      setInputImages: (imgs) =>
        set((s) => {
          const inputImages = orderImagesWithMaskFirst(imgs, s.maskDraft?.targetImageId)
          const shouldClearMask =
            Boolean(s.maskDraft) && !inputImages.some((img) => img.id === s.maskDraft?.targetImageId)
          return {
            inputImages,
            ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
          }
        }),
      moveInputImage: (fromIdx, toIdx) =>
        set((s) => {
          const images = [...s.inputImages]
          if (fromIdx < 0 || fromIdx >= images.length) return s
          const maskTargetImageId = s.maskDraft?.targetImageId
          if (maskTargetImageId && images[fromIdx]?.id === maskTargetImageId) return s
          const minTargetIdx = maskTargetImageId && images.some((img) => img.id === maskTargetImageId) ? 1 : 0
          const targetIdx = Math.max(minTargetIdx, Math.min(images.length, toIdx))
          const insertIdx = fromIdx < targetIdx ? targetIdx - 1 : targetIdx
          if (insertIdx === fromIdx) return s
          const [moved] = images.splice(fromIdx, 1)
          images.splice(insertIdx, 0, moved)
          return { inputImages: images }
        }),
      maskDraft: null,
      setMaskDraft: (maskDraft) =>
        set((s) => ({
          maskDraft,
          inputImages: orderImagesWithMaskFirst(s.inputImages, maskDraft?.targetImageId),
        })),
      clearMaskDraft: () => set({ maskDraft: null }),
      maskEditorImageId: null,
      setMaskEditorImageId: (maskEditorImageId) => set({ maskEditorImageId }),

      // Params
      params: { ...DEFAULT_PARAMS },
      setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),

      // Tasks
      tasks: [],
      setTasks: (tasks) => set({ tasks }),

      // Search & Filter
      searchQuery: '',
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      filterStatus: 'all',
      setFilterStatus: (filterStatus) => set({ filterStatus }),
      filterFavorite: false,
      setFilterFavorite: (filterFavorite) => set({ filterFavorite }),

      // Selection
      selectedTaskIds: [],
      setSelectedTaskIds: (updater) => set((s) => ({
        selectedTaskIds: typeof updater === 'function' ? updater(s.selectedTaskIds) : updater
      })),
      toggleTaskSelection: (id, force) => set((s) => {
        const isSelected = s.selectedTaskIds.includes(id)
        const shouldSelect = force !== undefined ? force : !isSelected
        if (shouldSelect === isSelected) return s
        return {
          selectedTaskIds: shouldSelect
            ? [...s.selectedTaskIds, id]
            : s.selectedTaskIds.filter((x) => x !== id)
        }
      }),
      clearSelection: () => set({ selectedTaskIds: [] }),

      // UI
      detailTaskId: null,
      setDetailTaskId: (detailTaskId) => set({ detailTaskId }),
      lightboxImageId: null,
      lightboxImageList: [],
      setLightboxImageId: (lightboxImageId, list) =>
        set({ lightboxImageId, lightboxImageList: list ?? (lightboxImageId ? [lightboxImageId] : []) }),
      showSettings: false,
      setShowSettings: (showSettings) => set({ showSettings }),

      // Toast
      toast: null,
      showToast: (message, type = 'info') => {
        set({ toast: { message, type } })
        setTimeout(() => {
          set((s) => (s.toast?.message === message ? { toast: null } : s))
        }, 3000)
      },

      // Confirm
      confirmDialog: null,
      setConfirmDialog: (confirmDialog) => set({ confirmDialog }),
    }),
    {
      name: 'gpt-image-playground',
      partialize: (state) => ({
        settings: {
          ...state.settings,
          baseUrl: '',
        },
        params: state.params,
        dismissedCodexCliPrompts: state.dismissedCodexCliPrompts,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<AppState> | undefined
        const persistedSettings = (persistedState?.settings ?? {}) as Partial<AppSettings>
        return {
          ...current,
          ...persistedState,
          settings: {
            ...current.settings,
            ...persistedSettings,
            baseUrl: DEFAULT_SETTINGS.baseUrl,
            apiMode:
              persistedSettings.apiMode === 'images' || persistedSettings.apiMode === 'responses'
                ? persistedSettings.apiMode
                : DEFAULT_SETTINGS.apiMode,
            codexCli: persistedSettings.codexCli ?? DEFAULT_SETTINGS.codexCli,
            apiProxy: persistedSettings.apiProxy ?? DEFAULT_SETTINGS.apiProxy,
            backgroundTasks: persistedSettings.backgroundTasks ?? DEFAULT_SETTINGS.backgroundTasks,
            language: normalizeLocale(persistedSettings.language ?? DEFAULT_SETTINGS.language),
            keyRole: persistedSettings.keyRole ?? DEFAULT_SETTINGS.keyRole,
            keyName: persistedSettings.keyName ?? DEFAULT_SETTINGS.keyName,
            keyGenerateRemaining: persistedSettings.keyGenerateRemaining ?? DEFAULT_SETTINGS.keyGenerateRemaining,
            keyEditRemaining: persistedSettings.keyEditRemaining ?? DEFAULT_SETTINGS.keyEditRemaining,
            keyMaxRunningTasks: persistedSettings.keyMaxRunningTasks ?? DEFAULT_SETTINGS.keyMaxRunningTasks,
          },
        }
      },
    },
  ),
)

// ===== Actions =====

let uid = 0
function genId(): string {
  return Date.now().toString(36) + (++uid).toString(36) + Math.random().toString(36).slice(2, 6)
}

export function getCodexCliPromptKey(settings: AppSettings): string {
  return `${settings.baseUrl}\n${settings.apiKey}`
}

function exportableSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    baseUrl: '',
    apiKey: '',
    keyRole: null,
    keyName: '',
    keyGenerateRemaining: null,
    keyEditRemaining: null,
    keyMaxRunningTasks: null,
  }
}

function tStore(key: MessageKey, values?: Record<string, string | number | boolean | null | undefined>) {
  return translate(useStore.getState().settings.language, key, values)
}

async function syncLatestKeyProfile(settings: AppSettings): Promise<AppSettings> {
  if (!settings.apiKey.trim()) return settings

  try {
    const profile = await fetchBackendKeyProfile(settings)
    const nextSettings: Partial<AppSettings> = profile
      ? {
          keyRole: profile.role,
          keyName: profile.name || '',
          keyGenerateRemaining: profile.generate_remaining ?? null,
          keyEditRemaining: profile.edit_remaining ?? null,
          keyMaxRunningTasks: profile.max_running_tasks ?? null,
        }
      : {
          keyRole: null,
          keyName: '',
          keyGenerateRemaining: null,
          keyEditRemaining: null,
          keyMaxRunningTasks: null,
        }
    useStore.getState().setSettings(nextSettings)
    return { ...useStore.getState().settings, ...nextSettings }
  } catch {
    return useStore.getState().settings
  }
}

export function showCodexCliPrompt(force = false, reason = tStore('store.codexReasonPromptRevised')) {
  const state = useStore.getState()
  const settings = state.settings
  const promptKey = getCodexCliPromptKey(settings)
  if (!force && (settings.codexCli || state.dismissedCodexCliPrompts.includes(promptKey))) return

  state.setConfirmDialog({
    title: tStore('store.codexDetectedTitle'),
    message: tStore('store.codexDetectedMessage', { reason }),
    confirmText: tStore('common.enable'),
    action: () => {
      const state = useStore.getState()
      state.dismissCodexCliPrompt(promptKey)
      state.setSettings({ codexCli: true })
    },
    cancelAction: () => useStore.getState().dismissCodexCliPrompt(promptKey),
  })
}

function normalizeParamsForSettings(
  params: TaskParams,
  settings: AppSettings,
  tasks: TaskRecord[] = [],
  options: { isEdit?: boolean } = {},
): TaskParams {
  return {
    ...params,
    size: normalizeImageSize(params.size) || DEFAULT_PARAMS.size,
    quality: settings.codexCli ? DEFAULT_PARAMS.quality : params.quality,
    n: clampCountForSettings(Number(params.n) || DEFAULT_PARAMS.n, settings, tasks, options),
  }
}

/** 初始化：从 IndexedDB 加载任务和图片缓存，清理孤立图片 */
export async function initStore() {
  const tasks = await getAllTasks()
  useStore.getState().setTasks(tasks)

  // 收集所有任务引用的图片 id
  const referencedIds = new Set<string>()
  for (const t of tasks) {
    for (const id of t.inputImageIds || []) referencedIds.add(id)
    if (t.maskImageId) referencedIds.add(t.maskImageId)
    for (const id of t.outputImages || []) referencedIds.add(id)
  }

  // 预加载所有图片到缓存，同时清理孤立图片
  const images = await getAllImages()
  for (const img of images) {
    if (referencedIds.has(img.id)) {
      imageCache.set(img.id, img.dataUrl)
    } else {
      await deleteImage(img.id)
    }
  }

  for (const task of tasks) {
    if (task.status !== 'running') continue
    if (task.backgroundTaskIds?.length) {
      executeTask(task.id)
    } else {
      updateTaskInStore(task.id, {
        status: 'error',
        error: tStore('store.interruptedTask'),
        errorDetail: tStore('store.interruptedTaskDetail'),
        errorKind: 'timeout',
        finishedAt: Date.now(),
        elapsed: Date.now() - task.createdAt,
      })
    }
  }
}

/** 提交新任务 */
export async function submitTask(options: { allowFullMask?: boolean } = {}) {
  const { settings: initialSettings, prompt, inputImages, maskDraft, params, showToast, setConfirmDialog } =
    useStore.getState()
  const currentTasks = useStore.getState().tasks
  const settings = await syncLatestKeyProfile(initialSettings)

  if (!settings.apiKey) {
    showToast(tStore('store.apiKeyRequired'), 'error')
    useStore.getState().setShowSettings(true)
    return
  }
  if (isKeyBlockedByTaskLimit(settings, currentTasks)) {
    showToast(tStore('store.keyTaskLimitZero'), 'error')
    return
  }
  const isEdit = inputImages.length > 0 || Boolean(maskDraft)
  if (isKeyBlockedByQuota(settings, { isEdit })) {
    showToast(tStore('store.keyQuotaReached'), 'error')
    return
  }

  if (!prompt.trim()) {
    showToast(tStore('store.promptRequired'), 'error')
    return
  }

  let orderedInputImages = inputImages
  let maskImageId: string | null = null
  let maskTargetImageId: string | null = null

  if (maskDraft) {
    try {
      orderedInputImages = orderInputImagesForMask(inputImages, maskDraft.targetImageId)
      const coverage = await validateMaskMatchesImage(maskDraft.maskDataUrl, orderedInputImages[0].dataUrl)
      if (coverage === 'full' && !options.allowFullMask) {
        setConfirmDialog({
          title: tStore('store.confirmFullMaskTitle'),
          message: tStore('store.confirmFullMaskMessage'),
          confirmText: tStore('store.continueSubmit'),
          tone: 'warning',
          action: () => {
            void submitTask({ allowFullMask: true })
          },
        })
        return
      }
      maskImageId = await storeImage(maskDraft.maskDataUrl, 'mask')
      imageCache.set(maskImageId, maskDraft.maskDataUrl)
      maskTargetImageId = maskDraft.targetImageId
    } catch (err) {
      if (!inputImages.some((img) => img.id === maskDraft.targetImageId)) {
        useStore.getState().clearMaskDraft()
      }
      showToast(localizeKnownError(err, useStore.getState().settings.language), 'error')
      return
    }
  }

  // 持久化输入图片到 IndexedDB（此前只在内存缓存中）
  for (const img of orderedInputImages) {
    await storeImage(img.dataUrl)
  }

  const normalizedParams = normalizeParamsForSettings(params, settings, currentTasks, { isEdit })
  if (
    normalizedParams.size !== params.size ||
    normalizedParams.quality !== params.quality ||
    normalizedParams.n !== params.n
  ) {
    useStore.getState().setParams({
      size: normalizedParams.size,
      quality: normalizedParams.quality,
      n: normalizedParams.n,
    })
  }

  const taskId = genId()
  const backgroundTaskIds = canUseBackgroundImageTasks(settings, normalizedParams, {
    hasMask: Boolean(maskImageId),
  })
    ? createBackgroundImageTaskIds(taskId, normalizedParams)
    : undefined
  const requiredTaskSlots = backgroundTaskIds?.length ?? 1
  const availableTaskSlots = getAvailableTaskSlots(settings, currentTasks)
  if (availableTaskSlots != null && availableTaskSlots < requiredTaskSlots) {
    showToast(tStore('store.keyTaskLimitReached', { count: availableTaskSlots }), 'error')
    return
  }
  const task: TaskRecord = {
    id: taskId,
    prompt: prompt.trim(),
    params: normalizedParams,
    inputImageIds: orderedInputImages.map((i) => i.id),
    maskTargetImageId,
    maskImageId,
    outputImages: [],
    backgroundTaskIds,
    status: 'running',
    error: null,
    errorDetail: null,
    errorKind: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
  }

  const latestTasks = useStore.getState().tasks
  useStore.getState().setTasks([task, ...latestTasks])
  useStore.getState().setPrompt('')
  useStore.getState().clearInputImages()
  await putTask(task)

  // 异步调用 API
  executeTask(taskId)
}

const activeExecutions = new Set<string>()

async function executeTask(taskId: string) {
  if (activeExecutions.has(taskId)) return
  activeExecutions.add(taskId)
  const { settings } = useStore.getState()
  const task = useStore.getState().tasks.find((t) => t.id === taskId)
  if (!task) {
    activeExecutions.delete(taskId)
    return
  }

  try {
    // 获取输入图片 data URLs
    const inputDataUrls: string[] = []
    for (const imgId of task.inputImageIds) {
      const dataUrl = await ensureImageCached(imgId)
      if (!dataUrl) throw new Error(tStore('store.inputImageMissing'))
      inputDataUrls.push(dataUrl)
    }
    let maskDataUrl: string | undefined
    if (task.maskImageId) {
      maskDataUrl = await ensureImageCached(task.maskImageId)
      if (!maskDataUrl) throw new Error(tStore('store.maskImageMissing'))
    }

    const callOptions = {
      settings,
      prompt: task.prompt,
      params: task.params,
      inputImageDataUrls: inputDataUrls,
      maskDataUrl,
    }
    const result = task.backgroundTaskIds?.length
      ? await callBackgroundImageApi({ ...callOptions, taskIds: task.backgroundTaskIds })
      : await callImageApi(callOptions)

    // 存储输出图片
    const outputIds: string[] = []
    for (const dataUrl of result.images) {
      const imgId = await storeImage(dataUrl, 'generated')
      imageCache.set(imgId, dataUrl)
      outputIds.push(imgId)
    }
    const actualParamsByImage = result.actualParamsList?.reduce<Record<string, Partial<TaskParams>>>((acc, params, index) => {
      const imgId = outputIds[index]
      if (imgId && params && Object.keys(params).length > 0) acc[imgId] = params
      return acc
    }, {})
    const revisedPromptByImage = result.revisedPrompts?.reduce<Record<string, string>>((acc, revisedPrompt, index) => {
      const imgId = outputIds[index]
      if (imgId && revisedPrompt && revisedPrompt.trim()) acc[imgId] = revisedPrompt
      return acc
    }, {})
    const promptWasRevised = result.revisedPrompts?.some(
      (revisedPrompt) => revisedPrompt?.trim() && revisedPrompt.trim() !== task.prompt.trim(),
    )
    const hasRevisedPromptValue = result.revisedPrompts?.some((revisedPrompt) => revisedPrompt?.trim())
    if (!settings.codexCli && !task.backgroundTaskIds?.length) {
      if (promptWasRevised) {
        showCodexCliPrompt()
      } else if (!hasRevisedPromptValue) {
        showCodexCliPrompt(false, tStore('store.codexReasonMissingOfficialInfo'))
      }
    }

    // 更新任务
    updateTaskInStore(taskId, {
      outputImages: outputIds,
      actualParams: { ...result.actualParams, n: outputIds.length },
      actualParamsByImage: actualParamsByImage && Object.keys(actualParamsByImage).length > 0 ? actualParamsByImage : undefined,
      revisedPromptByImage: revisedPromptByImage && Object.keys(revisedPromptByImage).length > 0 ? revisedPromptByImage : undefined,
      status: 'done',
      error: null,
      errorDetail: null,
      errorKind: null,
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })

    useStore.getState().showToast(tStore('store.generationComplete', { count: outputIds.length }), 'success')
    const currentMask = useStore.getState().maskDraft
    if (
      maskDataUrl &&
      currentMask &&
      currentMask.targetImageId === task.maskTargetImageId &&
      currentMask.maskDataUrl === maskDataUrl
    ) {
      useStore.getState().clearMaskDraft()
    }
  } catch (err) {
    const normalizedError = normalizeCaughtError(err, settings.language)
    updateTaskInStore(taskId, {
      status: 'error',
      error: normalizedError.message,
      errorDetail: normalizedError.detail,
      errorKind: normalizedError.kind,
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })
    useStore.getState().setDetailTaskId(taskId)
  }

  // 释放输入图片的内存缓存（已持久化到 IndexedDB，后续按需从 DB 加载）
  for (const imgId of task.inputImageIds) {
    imageCache.delete(imgId)
  }
  activeExecutions.delete(taskId)
}

export function updateTaskInStore(taskId: string, patch: Partial<TaskRecord>) {
  const { tasks, setTasks } = useStore.getState()
  const updated = tasks.map((t) =>
    t.id === taskId ? { ...t, ...patch } : t,
  )
  setTasks(updated)
  const task = updated.find((t) => t.id === taskId)
  if (task) putTask(task)
}

/** 重试失败的任务：创建新任务并执行 */
export async function retryTask(task: TaskRecord) {
  const { settings: initialSettings, tasks, showToast } = useStore.getState()
  const settings = await syncLatestKeyProfile(initialSettings)
  if (isKeyBlockedByTaskLimit(settings, tasks)) {
    showToast(tStore('store.keyTaskLimitZero'), 'error')
    return
  }
  const isEdit = task.inputImageIds.length > 0 || Boolean(task.maskImageId)
  if (isKeyBlockedByQuota(settings, { isEdit })) {
    showToast(tStore('store.keyQuotaReached'), 'error')
    return
  }
  const normalizedParams = normalizeParamsForSettings(task.params, settings, tasks, { isEdit })
  const taskId = genId()
  const backgroundTaskIds = canUseBackgroundImageTasks(settings, normalizedParams, {
    hasMask: Boolean(task.maskImageId),
  })
    ? createBackgroundImageTaskIds(taskId, normalizedParams)
    : undefined
  const requiredTaskSlots = backgroundTaskIds?.length ?? 1
  const availableTaskSlots = getAvailableTaskSlots(settings, tasks)
  if (availableTaskSlots != null && availableTaskSlots < requiredTaskSlots) {
    showToast(tStore('store.keyTaskLimitReached', { count: availableTaskSlots }), 'error')
    return
  }
  const newTask: TaskRecord = {
    id: taskId,
    prompt: task.prompt,
    params: normalizedParams,
    inputImageIds: [...task.inputImageIds],
    maskTargetImageId: task.maskTargetImageId ?? null,
    maskImageId: task.maskImageId ?? null,
    outputImages: [],
    backgroundTaskIds,
    status: 'running',
    error: null,
    errorDetail: null,
    errorKind: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
  }

  const latestTasks = useStore.getState().tasks
  useStore.getState().setTasks([newTask, ...latestTasks])
  await putTask(newTask)

  executeTask(taskId)
}

/** 复用配置 */
export async function reuseConfig(task: TaskRecord) {
  const { setPrompt, setParams, setInputImages, setMaskDraft, clearMaskDraft, showToast } = useStore.getState()
  setPrompt(task.prompt)
  setParams(task.params)

  // 恢复输入图片
  const imgs: InputImage[] = []
  for (const imgId of task.inputImageIds) {
    const dataUrl = await ensureImageCached(imgId)
    if (dataUrl) {
      imgs.push({ id: imgId, dataUrl })
    }
  }
  setInputImages(imgs)
  const maskTargetImageId = task.maskTargetImageId ?? (task.maskImageId ? task.inputImageIds[0] : null)
  if (maskTargetImageId && task.maskImageId && imgs.some((img) => img.id === maskTargetImageId)) {
    const maskDataUrl = await ensureImageCached(task.maskImageId)
    if (maskDataUrl) {
      setMaskDraft({
        targetImageId: maskTargetImageId,
        maskDataUrl,
        updatedAt: Date.now(),
      })
    } else {
      clearMaskDraft()
    }
  } else {
    clearMaskDraft()
  }
  showToast(tStore('store.reusedConfig'), 'success')
}

/** 编辑输出：将输出图加入输入 */
export async function editOutputs(task: TaskRecord) {
  const { inputImages, addInputImage, showToast } = useStore.getState()
  if (!task.outputImages?.length) return

  let added = 0
  for (const imgId of task.outputImages) {
    if (inputImages.find((i) => i.id === imgId)) continue
    const dataUrl = await ensureImageCached(imgId)
    if (dataUrl) {
      addInputImage({ id: imgId, dataUrl })
      added++
    }
  }
  showToast(tStore('store.outputsAdded', { count: added }), 'success')
}

/** 删除多条任务 */
export async function removeMultipleTasks(taskIds: string[]) {
  const { tasks, setTasks, inputImages, showToast, clearSelection, selectedTaskIds } = useStore.getState()
  
  if (!taskIds.length) return

  const toDelete = new Set(taskIds)
  const remaining = tasks.filter(t => !toDelete.has(t.id))

  // 收集所有被删除任务的关联图片
  const deletedImageIds = new Set<string>()
  for (const t of tasks) {
    if (toDelete.has(t.id)) {
      for (const id of t.inputImageIds || []) deletedImageIds.add(id)
      if (t.maskImageId) deletedImageIds.add(t.maskImageId)
      for (const id of t.outputImages || []) deletedImageIds.add(id)
    }
  }

  setTasks(remaining)
  for (const id of taskIds) {
    await dbDeleteTask(id)
  }

  // 找出其他任务仍引用的图片
  const stillUsed = new Set<string>()
  for (const t of remaining) {
    for (const id of t.inputImageIds || []) stillUsed.add(id)
    if (t.maskImageId) stillUsed.add(t.maskImageId)
    for (const id of t.outputImages || []) stillUsed.add(id)
  }
  for (const img of inputImages) stillUsed.add(img.id)

  // 删除孤立图片
  for (const imgId of deletedImageIds) {
    if (!stillUsed.has(imgId)) {
      await deleteImage(imgId)
      imageCache.delete(imgId)
    }
  }

  // 如果删除的任务在选中列表中，则移除
  const newSelection = selectedTaskIds.filter(id => !toDelete.has(id))
  if (newSelection.length !== selectedTaskIds.length) {
    useStore.getState().setSelectedTaskIds(newSelection)
  }

  showToast(tStore('store.recordsDeleted', { count: taskIds.length }), 'success')
}

/** 删除单条任务 */
export async function removeTask(task: TaskRecord) {
  const { tasks, setTasks, inputImages, showToast } = useStore.getState()

  // 收集此任务关联的图片
  const taskImageIds = new Set([
    ...(task.inputImageIds || []),
    ...(task.maskImageId ? [task.maskImageId] : []),
    ...(task.outputImages || []),
  ])

  // 从列表移除
  const remaining = tasks.filter((t) => t.id !== task.id)
  setTasks(remaining)
  await dbDeleteTask(task.id)

  // 找出其他任务仍引用的图片
  const stillUsed = new Set<string>()
  for (const t of remaining) {
    for (const id of t.inputImageIds || []) stillUsed.add(id)
    if (t.maskImageId) stillUsed.add(t.maskImageId)
    for (const id of t.outputImages || []) stillUsed.add(id)
  }
  for (const img of inputImages) stillUsed.add(img.id)

  // 删除孤立图片
  for (const imgId of taskImageIds) {
    if (!stillUsed.has(imgId)) {
      await deleteImage(imgId)
      imageCache.delete(imgId)
    }
  }

  showToast(tStore('store.recordDeleted'), 'success')
}

/** 清空所有数据（含配置重置） */
export async function clearAllData() {
  await dbClearTasks()
  await clearImages()
  imageCache.clear()
  const { setTasks, clearInputImages, clearMaskDraft, setSettings, setParams, showToast } = useStore.getState()
  setTasks([])
  clearInputImages()
  useStore.setState({ dismissedCodexCliPrompts: [] })
  clearMaskDraft()
  setSettings({ ...DEFAULT_SETTINGS })
  setParams({ ...DEFAULT_PARAMS })
  showToast(tStore('store.allDataCleared'), 'success')
}

/** 从 dataUrl 解析出 MIME 扩展名和二进制数据 */
function dataUrlToBytes(dataUrl: string): { ext: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/)
  const ext = match?.[1] ?? 'png'
  const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { ext, bytes }
}

/** 将二进制数据还原为 dataUrl */
function bytesToDataUrl(bytes: Uint8Array, filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png'
  const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
  const mime = mimeMap[ext] ?? 'image/png'
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:${mime};base64,${btoa(binary)}`
}

/** 导出数据为 ZIP */
export async function exportData() {
  try {
    const tasks = await getAllTasks()
    const images = await getAllImages()
    const { settings } = useStore.getState()
    const exportedAt = Date.now()
    const imageCreatedAtFallback = new Map<string, number>()

    for (const task of tasks) {
      for (const id of [
        ...(task.inputImageIds || []),
        ...(task.maskImageId ? [task.maskImageId] : []),
        ...(task.outputImages || []),
      ]) {
        const prev = imageCreatedAtFallback.get(id)
        if (prev == null || task.createdAt < prev) {
          imageCreatedAtFallback.set(id, task.createdAt)
        }
      }
    }

    const imageFiles: ExportData['imageFiles'] = {}
    const zipFiles: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]> = {}

    for (const img of images) {
      const { ext, bytes } = dataUrlToBytes(img.dataUrl)
      const path = `images/${img.id}.${ext}`
      const createdAt = img.createdAt ?? imageCreatedAtFallback.get(img.id) ?? exportedAt
      imageFiles[img.id] = { path, createdAt, source: img.source }
      zipFiles[path] = [bytes, { mtime: new Date(createdAt) }]
    }

    const manifest: ExportData = {
      version: 2,
      exportedAt: new Date(exportedAt).toISOString(),
      settings: exportableSettings(settings),
      tasks,
      imageFiles,
    }

    zipFiles['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { mtime: new Date(exportedAt) }]

    const zipped = zipSync(zipFiles, { level: 6 })
    const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gpt-image-playground-${Date.now()}.zip`
    a.click()
    URL.revokeObjectURL(url)
    useStore.getState().showToast(tStore('store.dataExported'), 'success')
  } catch (e) {
    useStore
      .getState()
      .showToast(
        tStore('store.exportFailed', { error: e instanceof Error ? e.message : String(e) }),
        'error',
      )
  }
}

/** 导入 ZIP 数据 */
export async function importData(file: File) {
  try {
    const buffer = await file.arrayBuffer()
    const unzipped = unzipSync(new Uint8Array(buffer))

    const manifestBytes = unzipped['manifest.json']
    if (!manifestBytes) throw new Error(tStore('store.zipMissingManifest'))

    const data: ExportData = JSON.parse(strFromU8(manifestBytes))
    if (!data.tasks || !data.imageFiles) throw new Error(tStore('store.invalidDataFormat'))

    // 还原图片
    for (const [id, info] of Object.entries(data.imageFiles)) {
      const bytes = unzipped[info.path]
      if (!bytes) continue
      const dataUrl = bytesToDataUrl(bytes, info.path)
      await putImage({ id, dataUrl, createdAt: info.createdAt, source: info.source })
      imageCache.set(id, dataUrl)
    }

    for (const task of data.tasks) {
      await putTask(task)
    }

    if (data.settings) {
      const currentSettings = useStore.getState().settings
      useStore.getState().setSettings({
        ...data.settings,
        baseUrl: DEFAULT_SETTINGS.baseUrl,
        apiKey: currentSettings.apiKey,
      })
    }

    const tasks = await getAllTasks()
    useStore.getState().setTasks(tasks)
    useStore
      .getState()
      .showToast(tStore('store.importedRecords', { count: data.tasks.length }), 'success')
  } catch (e) {
    useStore
      .getState()
      .showToast(
        tStore('store.importFailed', { error: e instanceof Error ? e.message : String(e) }),
        'error',
      )
  }
}

/** 添加图片到输入（文件上传）—— 仅放入内存缓存，不写 IndexedDB */
export async function addImageFromFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) return
  const dataUrl = await fileToDataUrl(file)
  const id = await hashDataUrl(dataUrl)
  imageCache.set(id, dataUrl)
  useStore.getState().addInputImage({ id, dataUrl })
}

/** 添加图片到输入（右键菜单）—— 支持 data/blob/http URL */
export async function addImageFromUrl(src: string): Promise<void> {
  const res = await fetch(src)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) throw new Error(tStore('store.invalidImage'))
  const dataUrl = await blobToDataUrl(blob)
  const id = await hashDataUrl(dataUrl)
  imageCache.set(id, dataUrl)
  useStore.getState().addInputImage({ id, dataUrl })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
