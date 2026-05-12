import { describe, expect, it } from 'vitest'
import settingsModalSource from './components/SettingsModal.tsx?raw'
import sizePickerModalSource from './components/SizePickerModal.tsx?raw'
import taskCardSource from './components/TaskCard.tsx?raw'
import detailModalSource from './components/DetailModal.tsx?raw'
import inputBarSource from './components/InputBar.tsx?raw'
import { translate, type MessageKey } from './lib/i18n'

describe('i18n wiring', () => {
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
})
