import type { AppSettings, ImageApiResponse, KeyRole, TaskParams } from '../types'
import { getActiveApiProfile, getCustomProviderDefinition } from './apiProfiles'
import { dataUrlToBlob } from './canvasImage'
import { callFalAiImageApi } from './falAiImageApi'
import {
  assertImageInputPayloadSize,
  fetchImageUrlAsDataUrl,
  mergeActualParams,
  MIME_MAP,
  normalizeBase64Image,
  type CallApiOptions,
  type CallApiResult,
} from './imageApiShared'
import { callOpenAICompatibleImageApi } from './openaiCompatibleImageApi'
import { normalizeBaseUrl } from './devProxy'
import { createAppError } from './error'

export type { CallApiOptions, CallApiResult } from './imageApiShared'
export { normalizeBaseUrl } from './devProxy'

const BACKGROUND_TASK_POLL_INTERVAL_MS = 2500

type BackgroundImageTaskStatus = 'queued' | 'running' | 'success' | 'error'

interface BackgroundImageTask {
  id?: string
  status?: BackgroundImageTaskStatus
  data?: ImageApiResponse['data']
  error?: string
  size?: string
}

interface BackgroundImageTaskListResponse {
  items?: BackgroundImageTask[]
  missing_ids?: string[]
}

export interface BackendKeyProfile {
  role: KeyRole
  name: string
  generate_remaining?: number | null
  edit_remaining?: number | null
  max_running_tasks?: number | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeBackendRootUrl(baseUrl: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return ''

  try {
    const url = new URL(normalizedBaseUrl)
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments[segments.length - 1] === 'v1') segments.pop()
    const pathname = segments.length ? `/${segments.join('/')}` : ''
    return `${url.origin}${pathname}`
  } catch {
    return normalizedBaseUrl.replace(/\/v1\/?$/i, '').replace(/\/+$/, '')
  }
}

function buildBackendApiUrl(settings: AppSettings, path: string): string {
  const rootUrl = normalizeBackendRootUrl(settings.baseUrl)
  const endpointPath = path.replace(/^\/+/, '')
  return rootUrl ? `${rootUrl}/${endpointPath}` : `/${endpointPath}`
}

function createRequestHeaders(settings: AppSettings): Record<string, string> {
  return {
    Authorization: `Bearer ${settings.apiKey}`,
    'Cache-Control': 'no-store, no-cache, max-age=0',
    Pragma: 'no-cache',
  }
}

async function readJsonResponse<T>(response: Response, settings: AppSettings): Promise<T> {
  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    let code: string | undefined
    try {
      const payload = await response.json() as Record<string, unknown>
      const error = payload.error
      if (error && typeof error === 'object') {
        const errorRecord = error as Record<string, unknown>
        if (typeof errorRecord.message === 'string') detail = errorRecord.message
        if (typeof errorRecord.code === 'string') code = errorRecord.code
      } else if (typeof error === 'string') {
        detail = error
      } else if (typeof payload.message === 'string') {
        detail = payload.message
      } else if (typeof payload.detail === 'string') {
        detail = payload.detail
      }
    } catch {
      try {
        const text = await response.text()
        if (text.trim()) detail = text.trim()
      } catch {
        /* ignore */
      }
    }
    throw createAppError(detail, { status: response.status, code, locale: settings.language })
  }
  return await response.json() as T
}

function backgroundTaskSize(size: string): string | undefined {
  const trimmed = size.trim()
  if (!trimmed || trimmed === 'auto') return undefined

  const match = trimmed.match(/^(\d+)\s*[xX×]\s*(\d+)$/)
  if (!match) return trimmed

  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return trimmed

  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

function imagePromptForSettings(settings: AppSettings, prompt: string): string {
  return settings.codexCli
    ? `Use the following text as the complete prompt. Do not rewrite it:\n${prompt}`
    : prompt
}

export function canUseBackgroundImageTasks(
  settings: AppSettings,
  params: TaskParams,
  options: { hasMask?: boolean; provider?: string } = {},
): boolean {
  const provider = options.provider ?? getActiveApiProfile(settings).provider
  return Boolean(
    settings.backgroundTasks &&
    provider === 'openai' &&
    settings.apiMode === 'images' &&
    !options.hasMask &&
    params.n > 0,
  )
}

export function createBackgroundImageTaskIds(localTaskId: string, params: TaskParams): string[] {
  const count = Math.max(1, Math.floor(Number(params.n) || 1))
  return Array.from({ length: count }, (_, index) =>
    count === 1 ? localTaskId : `${localTaskId}-${index + 1}`,
  )
}

export async function fetchBackendKeyProfile(settings: AppSettings): Promise<BackendKeyProfile | null> {
  if (!settings.apiKey.trim()) return null

  const response = await fetch(buildBackendApiUrl(settings, '/auth/login'), {
    method: 'POST',
    headers: {
      ...createRequestHeaders(settings),
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

  if (response.status === 404 || response.status === 405) return null

  const payload = await readJsonResponse<{
    ok?: boolean
    role?: KeyRole
    name?: string
    generate_remaining?: number | null
    edit_remaining?: number | null
    max_running_tasks?: number | null
  }>(response, settings)

  if (!payload?.ok || !payload.role) return null

  return {
    role: payload.role,
    name: typeof payload.name === 'string' ? payload.name : '',
    generate_remaining: payload.generate_remaining ?? null,
    edit_remaining: payload.edit_remaining ?? null,
    max_running_tasks: payload.max_running_tasks ?? null,
  }
}

async function submitBackgroundGenerationTask(opts: CallApiOptions, taskId: string): Promise<BackgroundImageTask> {
  const { settings, params } = opts
  const body: Record<string, unknown> = {
    client_task_id: taskId,
    prompt: imagePromptForSettings(settings, opts.prompt),
    model: settings.model,
  }
  const size = backgroundTaskSize(params.size)
  if (size) body.size = size

  const response = await fetch(buildBackendApiUrl(settings, '/api/image-tasks/generations'), {
    method: 'POST',
    headers: {
      ...createRequestHeaders(settings),
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  })

  return readJsonResponse<BackgroundImageTask>(response, settings)
}

async function submitBackgroundEditTask(opts: CallApiOptions, taskId: string): Promise<BackgroundImageTask> {
  const { settings, params, inputImageDataUrls } = opts
  const formData = new FormData()
  formData.append('client_task_id', taskId)
  formData.append('prompt', imagePromptForSettings(settings, opts.prompt))
  formData.append('model', settings.model)
  const size = backgroundTaskSize(params.size)
  if (size) formData.append('size', size)

  const imageBlobs = await Promise.all(inputImageDataUrls.map((dataUrl) => dataUrlToBlob(dataUrl)))
  assertImageInputPayloadSize(imageBlobs.reduce((sum, blob) => sum + blob.size, 0))

  for (let i = 0; i < imageBlobs.length; i++) {
    const blob = imageBlobs[i]
    const ext = blob.type.split('/')[1] || 'png'
    formData.append('image[]', blob, `input-${i + 1}.${ext}`)
  }

  const response = await fetch(buildBackendApiUrl(settings, '/api/image-tasks/edits'), {
    method: 'POST',
    headers: createRequestHeaders(settings),
    cache: 'no-store',
    body: formData,
  })

  return readJsonResponse<BackgroundImageTask>(response, settings)
}

async function submitBackgroundImageTasks(opts: CallApiOptions, taskIds: string[]): Promise<BackgroundImageTask[]> {
  const submitted: BackgroundImageTask[] = []
  for (const taskId of taskIds) {
    submitted.push(
      opts.inputImageDataUrls.length > 0
        ? await submitBackgroundEditTask(opts, taskId)
        : await submitBackgroundGenerationTask(opts, taskId),
    )
  }
  return submitted
}

async function fetchBackgroundImageTasks(settings: AppSettings, taskIds: string[]): Promise<BackgroundImageTaskListResponse> {
  const params = new URLSearchParams({ ids: taskIds.join(',') })
  const response = await fetch(`${buildBackendApiUrl(settings, '/api/image-tasks')}?${params.toString()}`, {
    method: 'GET',
    headers: createRequestHeaders(settings),
    cache: 'no-store',
  })

  return readJsonResponse<BackgroundImageTaskListResponse>(response, settings)
}

async function collectBackgroundTaskImages(opts: CallApiOptions, tasks: BackgroundImageTask[]): Promise<string[]> {
  const mime = MIME_MAP[opts.params.output_format] || 'image/png'
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), opts.settings.timeout * 1000)

  try {
    const images: string[] = []
    for (const task of tasks) {
      const data = Array.isArray(task.data) ? task.data : []
      for (const item of data) {
        const b64 = item.b64_json
        if (b64) {
          images.push(normalizeBase64Image(b64, mime))
          continue
        }
        if (typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
          images.push(await fetchImageUrlAsDataUrl(item.url, mime, controller.signal))
        }
      }
    }
    return images
  } finally {
    clearTimeout(timeoutId)
  }
}

async function pollBackgroundImageTasks(opts: CallApiOptions, taskIds: string[]): Promise<CallApiResult> {
  while (true) {
    const payload = await fetchBackgroundImageTasks(opts.settings, taskIds)
    const tasks = Array.isArray(payload.items) ? payload.items : []
    const missingIds = Array.isArray(payload.missing_ids) ? payload.missing_ids : []

    if (missingIds.length) {
      throw createAppError(`Background image task not found: ${missingIds.join(', ')}`, {
        kind: 'server',
        locale: opts.settings.language,
      })
    }

    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const orderedTasks = taskIds.map((taskId) => taskById.get(taskId)).filter(Boolean) as BackgroundImageTask[]
    const running = orderedTasks.some((task) => task.status === 'queued' || task.status === 'running')

    if (orderedTasks.length === taskIds.length && !running) {
      const successfulTasks = orderedTasks.filter((task) => task.status === 'success')
      if (successfulTasks.length > 0) {
        const images = await collectBackgroundTaskImages(opts, successfulTasks)
        if (!images.length) {
          throw createAppError('API returned no usable image data', {
            kind: 'no_image',
            locale: opts.settings.language,
          })
        }
        return {
          images,
          actualParams: mergeActualParams({ n: images.length }),
          actualParamsList: images.map(() => mergeActualParams({ n: 1 })),
          revisedPrompts: images.map(() => undefined),
        }
      }

      const firstError = orderedTasks.find((task) => task.error)?.error
      throw createAppError(firstError || 'Background image task failed', {
        locale: opts.settings.language,
      })
    }

    await sleep(BACKGROUND_TASK_POLL_INTERVAL_MS)
  }
}

export async function callBackgroundImageApi(opts: CallApiOptions & { taskIds: string[] }): Promise<CallApiResult> {
  const taskIds = opts.taskIds.length ? opts.taskIds : createBackgroundImageTaskIds(`${Date.now()}`, opts.params)
  await submitBackgroundImageTasks(opts, taskIds)
  return pollBackgroundImageTasks(opts, taskIds)
}

export async function callImageApi(opts: CallApiOptions): Promise<CallApiResult> {
  const profile = getActiveApiProfile(opts.settings)
  if (profile.provider === 'fal') return callFalAiImageApi(opts, profile)

  return callOpenAICompatibleImageApi(opts, profile, getCustomProviderDefinition(opts.settings, profile.provider))
}
