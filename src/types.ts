import { getDefaultLocale, type Locale } from './lib/i18n'

// ===== 设置 =====

export type ApiMode = 'images' | 'responses'
export type ApiProvider = 'openai' | 'fal'
export type KeyRole = 'admin' | 'user'

export interface ApiProfile {
  id: string
  name: string
  provider: ApiProvider
  baseUrl: string
  apiKey: string
  model: string
  timeout: number
  apiMode: ApiMode
  codexCli: boolean
  apiProxy: boolean
}

export interface AppSettings {
  baseUrl: string
  apiKey: string
  model: string
  timeout: number
  apiMode: ApiMode
  codexCli: boolean
  apiProxy: boolean
  backgroundTasks: boolean
  clearInputAfterSubmit: boolean
  language: Locale
  profiles: ApiProfile[]
  activeProfileId: string
  keyRole: KeyRole | null
  keyName: string
  keyGenerateRemaining: number | null
  keyEditRemaining: number | null
  keyMaxRunningTasks: number | null
}

const DEFAULT_BASE_URL = import.meta.env.VITE_DEFAULT_API_URL?.trim() || 'https://api.openai.com/v1'
const DEFAULT_BACKGROUND_TASKS = !/\/\/api\.openai\.com(?:\/|$)/i.test(DEFAULT_BASE_URL)
const DEFAULT_OPENAI_PROFILE_ID = 'default-openai'
export const DEFAULT_IMAGES_MODEL = 'gpt-image-2'
export const DEFAULT_RESPONSES_MODEL = 'gpt-5.5'

export const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: DEFAULT_BASE_URL,
  apiKey: '',
  model: DEFAULT_IMAGES_MODEL,
  timeout: 300,
  apiMode: 'images',
  codexCli: false,
  apiProxy: false,
  backgroundTasks: DEFAULT_BACKGROUND_TASKS,
  clearInputAfterSubmit: false,
  language: getDefaultLocale(),
  profiles: [
    {
      id: DEFAULT_OPENAI_PROFILE_ID,
      name: 'Default',
      provider: 'openai',
      baseUrl: DEFAULT_BASE_URL,
      apiKey: '',
      model: DEFAULT_IMAGES_MODEL,
      timeout: 300,
      apiMode: 'images',
      codexCli: false,
      apiProxy: false,
    },
  ],
  activeProfileId: DEFAULT_OPENAI_PROFILE_ID,
  keyRole: null,
  keyName: '',
  keyGenerateRemaining: null,
  keyEditRemaining: null,
  keyMaxRunningTasks: null,
}

// ===== 任务参数 =====

export interface TaskParams {
  size: string
  quality: 'auto' | 'low' | 'medium' | 'high'
  output_format: 'png' | 'jpeg' | 'webp'
  output_compression: number | null
  moderation: 'auto' | 'low'
  n: number
}

export const DEFAULT_PARAMS: TaskParams = {
  size: 'auto',
  quality: 'auto',
  output_format: 'png',
  output_compression: null,
  moderation: 'auto',
  n: 1,
}

// ===== 输入图片（UI 层面） =====

export interface InputImage {
  id: string
  dataUrl: string
}

export interface MaskDraft {
  targetImageId: string
  maskDataUrl: string
  updatedAt: number
}

// ===== 任务记录 =====

export type TaskStatus = 'running' | 'done' | 'error'
export type TaskErrorKind =
  | 'auth'
  | 'quota'
  | 'rate_limit'
  | 'content_policy'
  | 'no_image'
  | 'network'
  | 'timeout'
  | 'server'
  | 'unknown'

export interface TaskRecord {
  id: string
  prompt: string
  params: TaskParams
  apiProvider?: ApiProvider
  apiProfileName?: string
  apiModel?: string
  falRequestId?: string
  falEndpoint?: string
  falRecoverable?: boolean
  actualParams?: Partial<TaskParams>
  actualParamsByImage?: Record<string, Partial<TaskParams>>
  revisedPromptByImage?: Record<string, string>
  inputImageIds: string[]
  maskTargetImageId?: string | null
  maskImageId?: string | null
  outputImages: string[]
  backgroundTaskIds?: string[]
  status: TaskStatus
  error: string | null
  errorDetail?: string | null
  errorKind?: TaskErrorKind | null
  createdAt: number
  finishedAt: number | null
  elapsed: number | null
  isFavorite?: boolean
}

// ===== IndexedDB 存储的图片 =====

export interface StoredImage {
  id: string
  dataUrl: string
  createdAt?: number
  source?: 'upload' | 'generated' | 'mask'
}

// ===== API 请求体 =====

export interface ImageGenerationRequest {
  model: string
  prompt: string
  size: string
  quality: string
  output_format: string
  moderation: string
  output_compression?: number
  n?: number
}

// ===== API 响应 =====

export interface ImageResponseItem {
  b64_json?: string
  url?: string
  revised_prompt?: string
  size?: string
  quality?: string
  output_format?: string
  output_compression?: number
  moderation?: string
}

export interface ImageApiResponse {
  data: ImageResponseItem[]
  size?: string
  quality?: string
  output_format?: string
  output_compression?: number
  moderation?: string
  n?: number
}

export interface ResponsesOutputItem {
  type?: string
  result?: string | {
    b64_json?: string
    image?: string
    data?: string
  }
  size?: string
  quality?: string
  output_format?: string
  output_compression?: number
  moderation?: string
  revised_prompt?: string
}

export interface ResponsesApiResponse {
  output?: ResponsesOutputItem[]
  tools?: Array<{
    type?: string
    size?: string
    quality?: string
    output_format?: string
    output_compression?: number
    moderation?: string
    n?: number
  }>
}

export interface FalImageFile {
  url?: string
  content_type?: string
  file_name?: string
  width?: number
  height?: number
  b64_json?: string
  base64?: string
  data?: string
}

export interface FalApiResponse {
  images?: FalImageFile[]
  image?: FalImageFile | string
  url?: string
  seed?: number
}

// ===== 导出数据 =====

export interface ExportData {
  version: number
  exportedAt: string
  settings: AppSettings
  tasks: TaskRecord[]
  imageFiles: Record<string, {
    path: string
    createdAt?: number
    source?: 'upload' | 'generated' | 'mask'
  }>
}
