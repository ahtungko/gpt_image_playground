import { useEffect, useRef, useState, useCallback } from 'react'
import { normalizeBaseUrl } from '../lib/api'
import { useStore, exportData, importData, clearAllData } from '../store'
import { DEFAULT_SETTINGS, type AppSettings } from '../types'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'

export default function SettingsModal() {
  const showSettings = useStore((s) => s.showSettings)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [timeoutInput, setTimeoutInput] = useState(String(settings.timeout))
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    if (showSettings) {
      setDraft(settings)
      setTimeoutInput(String(settings.timeout))
    }
  }, [showSettings, settings])

  const commitSettings = (nextDraft: AppSettings) => {
    const normalizedDraft = {
      ...nextDraft,
      baseUrl: normalizeBaseUrl(nextDraft.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl),
      apiKey: nextDraft.apiKey,
      model: nextDraft.model.trim() || DEFAULT_SETTINGS.model,
      timeout: Number(nextDraft.timeout) || DEFAULT_SETTINGS.timeout,
    }
    setDraft(normalizedDraft)
    setSettings(normalizedDraft)
  }

  const handleClose = () => {
    const nextTimeout = Number(timeoutInput)
    commitSettings({
      ...draft,
      timeout:
        timeoutInput.trim() === '' || Number.isNaN(nextTimeout)
          ? DEFAULT_SETTINGS.timeout
          : nextTimeout,
    })
    setShowSettings(false)
  }

  const commitTimeout = useCallback(() => {
    const nextTimeout = Number(timeoutInput)
    const normalizedTimeout =
      timeoutInput.trim() === '' ? DEFAULT_SETTINGS.timeout : Number.isNaN(nextTimeout) ? draft.timeout : nextTimeout
    setTimeoutInput(String(normalizedTimeout))
    commitSettings({ ...draft, timeout: normalizedTimeout })
  }, [draft, timeoutInput])

  useCloseOnEscape(showSettings, handleClose)

  if (!showSettings) return null

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) importData(file)
    e.target.value = ''
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-md animate-overlay-in" />
      <div
        className="relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border border-white/50 dark:border-white/[0.08] rounded-3xl shadow-[0_8px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] max-w-lg w-full max-h-[85vh] overflow-y-auto z-10 p-6 ring-1 ring-black/5 dark:ring-white/10 animate-slide-down-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">设置</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/[0.06] transition text-gray-400"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* API 配置 */}
        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            API 配置
          </h3>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">API URL</span>
            <div className="mb-1 text-[11px] text-gray-400 dark:text-gray-500">
              支持通过查询参数覆盖：<code>?apiUrl=</code>
            </div>
            <input
              value={draft.baseUrl}
              onChange={(e) => setDraft((prev) => ({ ...prev, baseUrl: e.target.value }))}
              onBlur={(e) => commitSettings({ ...draft, baseUrl: e.target.value })}
              type="text"
              placeholder="https://api.openai.com"
              className="w-full px-4 py-2.5 bg-gray-50/50 dark:bg-white/[0.03] rounded-xl border border-gray-200/60 dark:border-white/[0.08] text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all duration-200"
            />
          </label>
          <div className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">API Key</span>
            <div className="mb-1 text-[11px] text-gray-400 dark:text-gray-500">
              支持通过查询参数覆盖：<code>?apiKey=</code>
            </div>
            <div className="relative">
              <input
                value={draft.apiKey}
                onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
                onBlur={(e) => commitSettings({ ...draft, apiKey: e.target.value })}
                type={showApiKey ? 'text' : 'password'}
                placeholder="sk-..."
                className="w-full px-4 py-2.5 pr-10 bg-gray-50/50 dark:bg-white/[0.03] rounded-xl border border-gray-200/60 dark:border-white/[0.08] text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all duration-200"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showApiKey ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">模型 ID</span>
            <input
              value={draft.model}
              onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
              onBlur={(e) => commitSettings({ ...draft, model: e.target.value })}
              type="text"
              placeholder="gpt-image-2"
              className="w-full px-4 py-2.5 bg-gray-50/50 dark:bg-white/[0.03] rounded-xl border border-gray-200/60 dark:border-white/[0.08] text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all duration-200"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">请求超时（秒）</span>
            <input
              value={timeoutInput}
              onChange={(e) => setTimeoutInput(e.target.value)}
              onBlur={commitTimeout}
              type="number"
              min={10}
              max={600}
              className="w-full px-4 py-2.5 bg-gray-50/50 dark:bg-white/[0.03] rounded-xl border border-gray-200/60 dark:border-white/[0.08] text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all duration-200"
            />
          </label>
        </div>

        {/* 数据管理 */}
        <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-white/[0.08]">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            数据管理
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => exportData()}
              className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              导出数据
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              导入数据
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleImport}
            />
          </div>
          <button
            onClick={() =>
              setConfirmDialog({
                title: '清空所有数据',
                message: '确定要清空所有任务记录和图片数据吗？此操作不可恢复。',
                action: () => clearAllData(),
              })
            }
            className="w-full py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 transition"
          >
            清空所有数据
          </button>
        </div>

        {/* 版本号 */}
        <div className="pt-4 text-center">
          <span className="text-[11px] text-gray-300 dark:text-gray-600 select-none">v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  )
}
