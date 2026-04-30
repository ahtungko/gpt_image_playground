import type { AppSettings, ImageApiResponse, ResponsesApiResponse, TaskParams } from '../types'
import { dataUrlToBlob, imageDataUrlToPngBlob, maskDataUrlToPngBlob } from './canvasImage'
import { buildApiUrl, isApiProxyAvailable, normalizeBaseUrl, readClientDevProxyConfig } from './devProxy'
import { createAppError } from './error'
import type { Locale } from './i18n'

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const MAX_MASK_EDIT_FILE_BYTES = 50 * 1024 * 1024
const MAX_IMAGE_INPUT_PAYLOAD_BYTES = 512 * 1024 * 1024

export { normalizeBaseUrl } from './devProxy'

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

function normalizeBase64Image(value: string, fallbackMime: string): string {
  return value.startsWith('data:') ? value : `data:${fallbackMime};base64,${value}`
}

function formatMiB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

function getDataUrlEncodedByteSize(dataUrl: string): number {
  return dataUrl.length
}

function getDataUrlDecodedByteSize(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return dataUrl.length

  const meta = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)
  if (!/;base64/i.test(meta)) return decodeURIComponent(payload).length

  const normalized = payload.replace(/\s/g, '')
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding)
}

function assertMaxBytes(label: string, bytes: number, maxBytes: number) {
  if (bytes > maxBytes) {
    throw new Error(`${label} too large: ${formatMiB(bytes)}; limit is ${formatMiB(maxBytes)}`)
  }
}

function assertImageInputPayloadSize(bytes: number) {
  assertMaxBytes('Total image input payload size', bytes, MAX_IMAGE_INPUT_PAYLOAD_BYTES)
}

function assertMaskEditFileSize(label: string, bytes: number) {
  assertMaxBytes(label, bytes, MAX_MASK_EDIT_FILE_BYTES)
}

async function blobToDataUrl(blob: Blob, fallbackMime: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''

  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000)
    binary += String.fromCharCode(...chunk)
  }

  return `data:${blob.type || fallbackMime};base64,${btoa(binary)}`
}

async function fetchImageUrlAsDataUrl(url: string, fallbackMime: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`Image URL download failed: HTTP ${response.status}`)
  }

  return blobToDataUrl(await response.blob(), fallbackMime)
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function extractApiErrorPayload(payload: unknown, fallbackToJson = true): { detail?: string; code?: string } {
  if (typeof payload === 'string') return { detail: payload }
  if (!payload || typeof payload !== 'object') return {}

  const record = payload as Record<string, unknown>
  const error = record.error
  let detail: string | undefined
  let code: string | undefined

  if (typeof error === 'string') {
    detail = error
  } else if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>
    detail = firstString(
      errorRecord.message,
      errorRecord.detail,
      errorRecord.description,
      errorRecord.error,
    )
    code = firstString(errorRecord.code, errorRecord.type, errorRecord.param)
  }

  detail = detail ?? firstString(
    record.message,
    record.detail,
    record.error_description,
    record.error_message,
  )
  code = code ?? firstString(record.code, record.type)

  if (!detail && fallbackToJson) {
    try {
      detail = JSON.stringify(payload)
    } catch {
      detail = String(payload)
    }
  }

  return { detail, code }
}

async function getApiError(response: Response, locale?: Locale) {
  let raw = ''
  try {
    raw = await response.text()
  } catch {
    /* ignore */
  }

  let payload: unknown
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = raw
    }
  }

  const { detail, code } = extractApiErrorPayload(payload)
  return createAppError(detail || raw || `HTTP ${response.status}`, {
    status: response.status,
    code,
    locale,
  })
}

function createRequestHeaders(settings: AppSettings): Record<string, string> {
  return {
    Authorization: `Bearer ${settings.apiKey}`,
    'Cache-Control': 'no-store, no-cache, max-age=0',
    Pragma: 'no-cache',
  }
}

function createResponsesImageTool(
  params: TaskParams,
  isEdit: boolean,
  settings: AppSettings,
  maskDataUrl?: string,
): Record<string, unknown> {
  const tool: Record<string, unknown> = {
    type: 'image_generation',
    action: isEdit ? 'edit' : 'generate',
    size: params.size,
    output_format: params.output_format,
  }

  if (!settings.codexCli) {
    tool.quality = params.quality
  }

  if (params.output_format !== 'png' && params.output_compression != null) {
    tool.output_compression = params.output_compression
  }

  if (maskDataUrl) {
    tool.input_image_mask = {
      image_url: maskDataUrl,
    }
  }

  return tool
}

function createResponsesInput(prompt: string, inputImageDataUrls: string[]): unknown {
  const text = `Use the following text as the complete prompt. Do not rewrite it:\n${prompt}`
  if (!inputImageDataUrls.length) return text

  return [
    {
      role: 'user',
      content: [
        { type: 'input_text', text },
        ...inputImageDataUrls.map((dataUrl) => ({
          type: 'input_image',
          image_url: dataUrl,
        })),
      ],
    },
  ]
}

export interface CallApiOptions {
  settings: AppSettings
  prompt: string
  params: TaskParams
  /** 输入图片的 data URL 列表 */
  inputImageDataUrls: string[]
  maskDataUrl?: string
}

export interface CallApiResult {
  /** base64 data URL 列表 */
  images: string[]
  /** API 返回的实际生效参数 */
  actualParams?: Partial<TaskParams>
  /** 每张图片对应的实际生效参数 */
  actualParamsList?: Array<Partial<TaskParams> | undefined>
  /** 每张图片对应的 API 改写提示词 */
  revisedPrompts?: Array<string | undefined>
}

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

const BACKGROUND_TASK_POLL_INTERVAL_MS = 2500

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

function backgroundTaskSize(size: string): string | undefined {
  const trimmed = size.trim()
  if (!trimmed || trimmed === 'auto') return undefined

  const match = trimmed.match(/^(\d+)\s*[xX?]\s*(\d+)$/)
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
    ? `Use the following text as the complete prompt. Do not rewrite it:
${prompt}`
    : prompt
}

export function canUseBackgroundImageTasks(
  settings: AppSettings,
  params: TaskParams,
  options: { hasMask?: boolean } = {},
): boolean {
  return Boolean(
    settings.backgroundTasks &&
    settings.apiMode === 'images' &&
    !options.hasMask &&
    params.n > 0
  )
}

export function createBackgroundImageTaskIds(localTaskId: string, params: TaskParams): string[] {
  const count = Math.max(1, Math.floor(Number(params.n) || 1))
  return Array.from({ length: count }, (_, index) =>
    count === 1 ? localTaskId : `${localTaskId}-${index + 1}`,
  )
}

function collectTextFields(value: unknown, texts: string[], depth = 0) {
  if (depth > 5 || value == null) return
  if (Array.isArray(value)) {
    for (const item of value) collectTextFields(item, texts, depth + 1)
    return
  }
  if (typeof value !== 'object') return

  const record = value as Record<string, unknown>
  for (const key of ['text', 'output_text', 'message', 'refusal']) {
    const text = record[key]
    if (typeof text === 'string' && text.trim()) texts.push(text.trim())
  }
  for (const key of ['content', 'output', 'result', 'error']) {
    collectTextFields(record[key], texts, depth + 1)
  }
}

function extractTextFromResponsesOutput(payload: ResponsesApiResponse): string {
  const output = payload.output
  if (!Array.isArray(output)) return ''

  const texts: string[] = []
  for (const item of output) {
    if (item?.type === 'image_generation_call') continue
    collectTextFields(item, texts)
  }

  return Array.from(new Set(texts)).join('\n\n')
}

type ResponsesImageResult = NonNullable<ResponsesApiResponse['output']>[number]['result']

function getResponseImageResult(result: ResponsesImageResult, fallbackMime: string): string | null {
  if (typeof result === 'string' && result.trim()) {
    return normalizeBase64Image(result, fallbackMime)
  }
  if (!result || typeof result !== 'object') return null

  const record = result as Record<string, unknown>
  const image = firstString(record.b64_json, record.image, record.data)
  return image ? normalizeBase64Image(image, fallbackMime) : null
}

function parseResponsesImageResults(payload: ResponsesApiResponse, fallbackMime: string, locale?: Locale): Array<{
  image: string
  actualParams?: Partial<TaskParams>
  revisedPrompt?: string
}> {
  const output = payload.output
  if (!Array.isArray(output) || !output.length) {
    const payloadError = extractApiErrorPayload(payload, false).detail
    throw createAppError(payloadError || 'API returned no image data', {
      kind: payloadError ? undefined : 'no_image',
      locale,
    })
  }

  const results: Array<{ image: string; actualParams?: Partial<TaskParams>; revisedPrompt?: string }> = []

  for (const item of output) {
    if (item?.type !== 'image_generation_call') continue

    const image = getResponseImageResult(item.result, fallbackMime)
    if (image) {
      results.push({
        image,
        actualParams: mergeActualParams(pickActualParams(item)),
        revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined,
      })
    }
  }

  if (!results.length) {
    const payloadError = extractApiErrorPayload(payload, false).detail
    const textDetail = extractTextFromResponsesOutput(payload)
    throw createAppError(payloadError || textDetail || 'API returned no usable image data', {
      kind: payloadError ? undefined : 'no_image',
      locale,
    })
  }

  return results
}

function pickActualParams(source: unknown): Partial<TaskParams> {
  if (!source || typeof source !== 'object') return {}
  const record = source as Record<string, unknown>
  const actualParams: Partial<TaskParams> = {}

  if (typeof record.size === 'string') actualParams.size = record.size
  if (record.quality === 'auto' || record.quality === 'low' || record.quality === 'medium' || record.quality === 'high') {
    actualParams.quality = record.quality
  }
  if (record.output_format === 'png' || record.output_format === 'jpeg' || record.output_format === 'webp') {
    actualParams.output_format = record.output_format
  }
  if (typeof record.output_compression === 'number') actualParams.output_compression = record.output_compression
  if (record.moderation === 'auto' || record.moderation === 'low') actualParams.moderation = record.moderation
  if (typeof record.n === 'number') actualParams.n = record.n

  return actualParams
}

function mergeActualParams(...sources: Array<Partial<TaskParams>>): Partial<TaskParams> | undefined {
  const merged = Object.assign({}, ...sources.filter((source) => Object.keys(source).length))
  return Object.keys(merged).length ? merged : undefined
}

async function readJsonResponse<T>(response: Response, locale?: Locale): Promise<T> {
  if (!response.ok) {
    throw await getApiError(response, locale)
  }
  return await response.json() as T
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

  return readJsonResponse<BackgroundImageTask>(response, settings.language)
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

  return readJsonResponse<BackgroundImageTask>(response, settings.language)
}

async function submitBackgroundImageTasks(
  opts: CallApiOptions,
  taskIds: string[],
): Promise<BackgroundImageTask[]> {
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

async function fetchBackgroundImageTasks(
  settings: AppSettings,
  taskIds: string[],
): Promise<BackgroundImageTaskListResponse> {
  const params = new URLSearchParams({ ids: taskIds.join(',') })
  const response = await fetch(`${buildBackendApiUrl(settings, '/api/image-tasks')}?${params.toString()}`, {
    method: 'GET',
    headers: createRequestHeaders(settings),
    cache: 'no-store',
  })

  return readJsonResponse<BackgroundImageTaskListResponse>(response, settings.language)
}

async function collectBackgroundTaskImages(
  opts: CallApiOptions,
  tasks: BackgroundImageTask[],
): Promise<string[]> {
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
        if (isHttpUrl(item.url)) {
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

export async function callBackgroundImageApi(
  opts: CallApiOptions & { taskIds: string[] },
): Promise<CallApiResult> {
  const taskIds = opts.taskIds.length ? opts.taskIds : createBackgroundImageTaskIds(`${Date.now()}`, opts.params)
  await submitBackgroundImageTasks(opts, taskIds)
  return pollBackgroundImageTasks(opts, taskIds)
}

export async function callImageApi(opts: CallApiOptions): Promise<CallApiResult> {
  return opts.settings.apiMode === 'responses'
    ? callResponsesImageApi(opts)
    : callImagesApi(opts)
}

async function callImagesApi(opts: CallApiOptions): Promise<CallApiResult> {
  const n = opts.params.n > 0 ? opts.params.n : 1
  if (opts.settings.codexCli && n > 1) {
    return callImagesApiConcurrent(opts, n)
  }

  return callImagesApiSingle(opts)
}

async function callImagesApiConcurrent(opts: CallApiOptions, n: number): Promise<CallApiResult> {
  const singleOpts = { ...opts, params: { ...opts.params, n: 1, quality: 'auto' as const } }
  const results = await Promise.allSettled(
    Array.from({ length: n }).map(() => callImagesApiSingle(singleOpts)),
  )

  const successfulResults = results
    .filter((r): r is PromiseFulfilledResult<CallApiResult> => r.status === 'fulfilled')
    .map((r) => r.value)

  if (successfulResults.length === 0) {
    const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (firstError) throw firstError.reason
    throw new Error('All concurrent requests failed')
  }

  const images = successfulResults.flatMap((r) => r.images)
  const actualParamsList = successfulResults.flatMap((r) =>
    r.actualParamsList?.length ? r.actualParamsList : r.images.map(() => r.actualParams),
  )
  const revisedPrompts = successfulResults.flatMap((r) =>
    r.revisedPrompts?.length ? r.revisedPrompts : r.images.map(() => undefined),
  )
  const actualParams = mergeActualParams(
    successfulResults[0]?.actualParams ?? {},
    { n: images.length },
  )

  return { images, actualParams, actualParamsList, revisedPrompts }
}

async function callImagesApiSingle(opts: CallApiOptions): Promise<CallApiResult> {
  const { settings, prompt: originalPrompt, params, inputImageDataUrls } = opts
  const prompt = imagePromptForSettings(settings, originalPrompt)
  const isEdit = inputImageDataUrls.length > 0
  const mime = MIME_MAP[params.output_format] || 'image/png'
  const proxyConfig = readClientDevProxyConfig()
  const useApiProxy = settings.apiProxy && isApiProxyAvailable(proxyConfig)
  const requestHeaders = createRequestHeaders(settings)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), settings.timeout * 1000)

  try {
    let response: Response

    if (isEdit) {
      const formData = new FormData()
      formData.append('model', settings.model)
      formData.append('prompt', prompt)
      formData.append('size', params.size)
      formData.append('output_format', params.output_format)
      formData.append('moderation', params.moderation)

      if (!settings.codexCli) {
        formData.append('quality', params.quality)
      }

      if (params.output_format !== 'png' && params.output_compression != null) {
        formData.append('output_compression', String(params.output_compression))
      }
      if (params.n > 1) {
        formData.append('n', String(params.n))
      }

      const imageBlobs: Blob[] = []
      for (let i = 0; i < inputImageDataUrls.length; i++) {
        const dataUrl = inputImageDataUrls[i]
        const blob = opts.maskDataUrl && i === 0
          ? await imageDataUrlToPngBlob(dataUrl)
          : await dataUrlToBlob(dataUrl)
        imageBlobs.push(blob)
      }

      const maskBlob = opts.maskDataUrl ? await maskDataUrlToPngBlob(opts.maskDataUrl) : null
      if (opts.maskDataUrl) {
        assertMaskEditFileSize('Mask target image file', imageBlobs[0]?.size ?? 0)
        assertMaskEditFileSize('Mask file', maskBlob?.size ?? 0)
      }
      assertImageInputPayloadSize(
        imageBlobs.reduce((sum, blob) => sum + blob.size, 0) + (maskBlob?.size ?? 0),
      )

      for (let i = 0; i < imageBlobs.length; i++) {
        const blob = imageBlobs[i]
        const ext = blob.type.split('/')[1] || 'png'
        formData.append('image[]', blob, `input-${i + 1}.${ext}`)
      }

      if (maskBlob) {
        formData.append('mask', maskBlob, 'mask.png')
      }

      response = await fetch(buildApiUrl(settings.baseUrl, 'images/edits', proxyConfig, useApiProxy), {
        method: 'POST',
        headers: requestHeaders,
        cache: 'no-store',
        body: formData,
        signal: controller.signal,
      })
    } else {
      const body: Record<string, unknown> = {
        model: settings.model,
        prompt,
        size: params.size,
        output_format: params.output_format,
        moderation: params.moderation,
      }

      if (!settings.codexCli) {
        body.quality = params.quality
      }

      if (params.output_format !== 'png' && params.output_compression != null) {
        body.output_compression = params.output_compression
      }
      if (params.n > 1) {
        body.n = params.n
      }

      response = await fetch(buildApiUrl(settings.baseUrl, 'images/generations', proxyConfig, useApiProxy), {
        method: 'POST',
        headers: {
          ...requestHeaders,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    }

    if (!response.ok) {
      throw await getApiError(response, settings.language)
    }

    const payload = await response.json() as ImageApiResponse
    const data = payload.data
    if (!Array.isArray(data) || !data.length) {
      const payloadError = extractApiErrorPayload(payload, false).detail
      throw createAppError(payloadError || 'API returned no image data', {
        kind: payloadError ? undefined : 'no_image',
        locale: settings.language,
      })
    }

    const images: string[] = []
    const revisedPrompts: Array<string | undefined> = []
    for (const item of data) {
      const b64 = item.b64_json
      if (b64) {
        images.push(normalizeBase64Image(b64, mime))
        revisedPrompts.push(typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined)
        continue
      }

      if (isHttpUrl(item.url)) {
        images.push(await fetchImageUrlAsDataUrl(item.url, mime, controller.signal))
        revisedPrompts.push(typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined)
      }
    }

    if (!images.length) {
      const payloadError = extractApiErrorPayload(payload, false).detail
      throw createAppError(payloadError || 'API returned no usable image data', {
        kind: payloadError ? undefined : 'no_image',
        locale: settings.language,
      })
    }

    const actualParams = mergeActualParams(
      pickActualParams(payload),
    )
    return {
      images,
      actualParams,
      actualParamsList: images.map(() => actualParams),
      revisedPrompts,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function callResponsesImageApi(opts: CallApiOptions): Promise<CallApiResult> {
  const n = opts.params.n > 0 ? opts.params.n : 1
  if (n === 1) {
    return callResponsesImageApiSingle(opts)
  }

  const promises = Array.from({ length: n }).map(() => callResponsesImageApiSingle(opts))
  const results = await Promise.allSettled(promises)
  
  const successfulResults = results
    .filter((r): r is PromiseFulfilledResult<CallApiResult> => r.status === 'fulfilled')
    .map((r) => r.value)

  if (successfulResults.length === 0) {
    const firstError = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (firstError) throw firstError.reason
    throw new Error('All concurrent requests failed')
  }

  const images = successfulResults.flatMap((r) => r.images)
  const actualParamsList = successfulResults.flatMap((r) =>
    r.actualParamsList?.length ? r.actualParamsList : r.images.map(() => r.actualParams),
  )
  const revisedPrompts = successfulResults.flatMap((r) =>
    r.revisedPrompts?.length ? r.revisedPrompts : r.images.map(() => undefined),
  )
  const actualParams = mergeActualParams(
    successfulResults[0]?.actualParams ?? {},
    images.length === opts.params.n ? { n: opts.params.n } : { n: images.length },
  )

  return { images, actualParams, actualParamsList, revisedPrompts }
}

async function callResponsesImageApiSingle(opts: CallApiOptions): Promise<CallApiResult> {
  const { settings, prompt, params, inputImageDataUrls } = opts
  const mime = MIME_MAP[params.output_format] || 'image/png'
  const proxyConfig = readClientDevProxyConfig()
  const useApiProxy = settings.apiProxy && isApiProxyAvailable(proxyConfig)
  const requestHeaders = createRequestHeaders(settings)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), settings.timeout * 1000)

  try {
    if (opts.maskDataUrl) {
      assertMaskEditFileSize('Mask target image file', getDataUrlDecodedByteSize(inputImageDataUrls[0] ?? ''))
      assertMaskEditFileSize('Mask file', getDataUrlDecodedByteSize(opts.maskDataUrl))
    }
    assertImageInputPayloadSize(
      inputImageDataUrls.reduce((sum, dataUrl) => sum + getDataUrlEncodedByteSize(dataUrl), 0) +
        (opts.maskDataUrl ? getDataUrlEncodedByteSize(opts.maskDataUrl) : 0),
    )

    const body = {
      model: settings.model,
      input: createResponsesInput(prompt, inputImageDataUrls),
      tools: [createResponsesImageTool(params, inputImageDataUrls.length > 0, settings, opts.maskDataUrl)],
      tool_choice: 'required',
    }

    const response = await fetch(buildApiUrl(settings.baseUrl, 'responses', proxyConfig, useApiProxy), {
      method: 'POST',
      headers: {
        ...requestHeaders,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw await getApiError(response, settings.language)
    }

    const payload = await response.json() as ResponsesApiResponse
    const imageResults = parseResponsesImageResults(payload, mime, settings.language)
    const actualParams = mergeActualParams(
      imageResults[0]?.actualParams ?? {},
    )
    return {
      images: imageResults.map((result) => result.image),
      actualParams,
      actualParamsList: imageResults.map((result) =>
        mergeActualParams(result.actualParams ?? {}),
      ),
      revisedPrompts: imageResults.map((result) => result.revisedPrompt),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
