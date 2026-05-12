import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import settingsModalSource from './components/SettingsModal.tsx?raw'
import sizePickerModalSource from './components/SizePickerModal.tsx?raw'
import taskCardSource from './components/TaskCard.tsx?raw'
import detailModalSource from './components/DetailModal.tsx?raw'
import inputBarSource from './components/InputBar.tsx?raw'
import { translate, type MessageKey } from './lib/i18n'
import { inlineTranslate } from './lib/inlineI18n'

const componentFiles = [
  'src/components/Header.tsx',
  'src/components/ImageContextMenu.tsx',
  'src/components/InputBar.tsx',
  'src/components/SettingsModal.tsx',
  'src/components/Select.tsx',
  'src/components/TaskGrid.tsx',
]

describe('i18n wiring', () => {
  it('defines the remaining shared store and task-grid English messages', () => {
    expect(translate('en', 'store.apiProfileMissingTitle' as MessageKey)).toBe('API profile not found')
    expect(translate('en', 'store.apiProfileMissingMessage' as MessageKey, {
      taskProfile: 'Missing profile',
      currentProfile: 'Default',
    })).toBe('The reused task API profile “Missing profile” was not found. Submit with the current API profile “Default” instead?')
    expect(translate('en', 'store.requestInterrupted' as MessageKey)).toBe('Request interrupted')
    expect(translate('en', 'store.requestTimeoutDetail' as MessageKey, { seconds: 45 })).toBe(
      'Request timed out: still not finished after 45 seconds. Try again later or increase the timeout.',
    )
    expect(translate('en', 'taskGrid.dragScrollHint' as MessageKey, { key: 'Ctrl' })).toBe(
      'Release Ctrl and use the wheel, or drag to the edge to auto-scroll',
    )
  })

  it('defines the remaining SettingsModal inline English messages', () => {
    expect(inlineTranslate('en', '导入 URL 已复制')).toBe('Import URL copied')
    expect(inlineTranslate('en', '导入 URL 已复制（包含 API Key）')).toBe('Import URL copied (includes API key)')
    expect(inlineTranslate('en', '服务商配置已更新')).toBe('Provider config updated')
    expect(inlineTranslate('en', 'LLM 生成提示词已复制')).toBe('LLM generation prompt copied')
    expect(inlineTranslate('en', '无法读取剪贴板，请允许浏览器访问剪贴板，或直接粘贴到输入框中')).toBe(
      'Clipboard access was denied. Allow clipboard access in the browser, or paste directly into the text area.',
    )
  })

  it('exposes an English language selector in settings instead of hardcoded Chinese-only settings UI', () => {
    expect(translate('en', 'settings.languageSelectorDesc' as MessageKey)).toBe('Choose the language used by the app UI.')
    expect(settingsModalSource).toContain("value={draft.language}")
    expect(settingsModalSource).toContain("LANGUAGE_OPTIONS")
    expect(settingsModalSource).not.toContain('习惯配置')
    expect(settingsModalSource).not.toContain('任务提交方式')
  })

  it('uses shared translations for the size picker modal', () => {
    expect(sizePickerModalSource).toContain('useI18n')
    expect(sizePickerModalSource).not.toContain('设置图像尺寸')
    expect(sizePickerModalSource).not.toContain('自定义宽高')
  })

  it('uses shared translations for task cards', () => {
    expect(taskCardSource).toContain('useI18n')
    expect(taskCardSource).not.toContain('生成中...')
    expect(taskCardSource).not.toContain('删除记录')
  })

  it('uses shared translations for task details', () => {
    expect(detailModalSource).toContain('useI18n')
    expect(detailModalSource).not.toContain('输入内容')
    expect(detailModalSource).not.toContain('原始响应数据')
  })

  it('keeps the main input controls translated through i18n', () => {
    expect(inputBarSource).not.toContain('生成图像')
    expect(inputBarSource).not.toContain('尚未完成 API 配置')
    expect(inputBarSource).not.toContain('添加参考图')
  })

  it('does not leave hardcoded Chinese UI text in primary components', () => {
    const offenders: string[] = []

    for (const file of componentFiles) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      let inCustomProviderPrompt = false
      source.split(/\r?\n/).forEach((line, index) => {
        if (line.includes('const CUSTOM_PROVIDER_LLM_PROMPT')) inCustomProviderPrompt = true
        if (inCustomProviderPrompt) {
          if (line.includes('export default function SettingsModal')) inCustomProviderPrompt = false
          return
        }

        const trimmed = line.trim()
        if (
          !/[\u4e00-\u9fff]/.test(line) ||
          trimmed.startsWith('//') ||
          trimmed.startsWith('{/*') ||
          trimmed.startsWith('*') ||
          /tx\(|t\(|inlineTranslate\(|@图|图\d|data-placeholder/.test(line)
        ) {
          return
        }

        offenders.push(`${file}:${index + 1}: ${trimmed}`)
      })
    }

    expect(offenders).toEqual([])
  })
})
