import { useEffect, useRef, useState, useCallback } from 'react'
import { isApiProxyAvailable, readClientDevProxyConfig } from '../lib/devProxy'
import { fetchBackendKeyProfile } from '../lib/api'
import { useStore, exportData, importData, clearAllData } from '../store'
import { getAvailableTaskSlots, getRunningTaskSlots } from '../lib/keyLimits'
import { DEFAULT_IMAGES_MODEL, DEFAULT_RESPONSES_MODEL, DEFAULT_SETTINGS, type AppSettings } from '../types'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { useI18n } from '../hooks/useI18n'
import { LANGUAGE_OPTIONS } from '../lib/i18n'
import Select from './Select'

export default function SettingsModal() {
  const { t } = useI18n()
  const showSettings = useStore((s) => s.showSettings)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const settings = useStore((s) => s.settings)
  const tasks = useStore((s) => s.tasks)
  const setSettings = useStore((s) => s.setSettings)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [timeoutInput, setTimeoutInput] = useState(String(settings.timeout))
  const [showApiKey, setShowApiKey] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const profileRequestIdRef = useRef(0)
  const wasOpenRef = useRef(false)
  const apiProxyAvailable = isApiProxyAvailable(readClientDevProxyConfig())
  const runningTaskCount = getRunningTaskSlots(tasks)
  const availableTaskSlots = getAvailableTaskSlots(draft, tasks)
  const formatLimitValue = (value: number | null | undefined) => value == null ? '∞' : String(value)

  const getDefaultModelForMode = (apiMode: AppSettings['apiMode']) =>
    apiMode === 'responses' ? DEFAULT_RESPONSES_MODEL : DEFAULT_IMAGES_MODEL

  useEffect(() => {
    if (showSettings && !wasOpenRef.current) {
      setDraft(apiProxyAvailable ? settings : { ...settings, apiProxy: false })
      setTimeoutInput(String(settings.timeout))
    }
    wasOpenRef.current = showSettings
  }, [apiProxyAvailable, settings, showSettings])

  const normalizeDraft = (nextDraft: AppSettings): AppSettings => {
    const apiMode = nextDraft.apiMode === 'responses' ? 'responses' : DEFAULT_SETTINGS.apiMode
    const defaultModel = getDefaultModelForMode(apiMode)
    return {
      ...nextDraft,
      apiMode,
      baseUrl: DEFAULT_SETTINGS.baseUrl,
      apiKey: nextDraft.apiKey.trim(),
      apiProxy: apiProxyAvailable ? nextDraft.apiProxy : false,
      model: nextDraft.model.trim() || defaultModel,
      timeout: Number(nextDraft.timeout) || DEFAULT_SETTINGS.timeout,
      language: nextDraft.language ?? DEFAULT_SETTINGS.language,
    }
  }

  const commitSettings = (nextDraft: AppSettings) => {
    const normalizedDraft = normalizeDraft(nextDraft)
    setDraft(normalizedDraft)
    setSettings(normalizedDraft)
  }

  const clearKeyProfile = useCallback((baseDraft: AppSettings) => {
    const nextDraft = {
      ...baseDraft,
      keyRole: null,
      keyName: '',
      keyGenerateRemaining: null,
      keyEditRemaining: null,
      keyMaxRunningTasks: null,
    }
    setDraft((currentDraft) =>
      currentDraft.apiKey.trim() === baseDraft.apiKey.trim()
        ? { ...currentDraft, keyRole: null, keyName: '', keyGenerateRemaining: null, keyEditRemaining: null, keyMaxRunningTasks: null }
        : currentDraft,
    )
    setSettings(nextDraft)
    return nextDraft
  }, [setSettings])

  const refreshKeyProfile = useCallback(async (baseDraft: AppSettings) => {
    const normalizedDraft = normalizeDraft(baseDraft)
    const requestId = ++profileRequestIdRef.current

    if (!normalizedDraft.apiKey) {
      clearKeyProfile(normalizedDraft)
      return
    }

    setProfileLoading(true)
    try {
      const profile = await fetchBackendKeyProfile(normalizedDraft)
      if (requestId !== profileRequestIdRef.current) return

      if (!profile) {
        clearKeyProfile(normalizedDraft)
        return
      }

      const nextDraft = {
        ...normalizedDraft,
        keyRole: profile.role,
        keyName: profile.name || '',
        keyGenerateRemaining: profile.generate_remaining ?? null,
        keyEditRemaining: profile.edit_remaining ?? null,
        keyMaxRunningTasks: profile.max_running_tasks ?? null,
      }
      setDraft((currentDraft) =>
        currentDraft.apiKey.trim() === normalizedDraft.apiKey.trim()
          ? {
              ...currentDraft,
              keyRole: profile.role,
              keyName: profile.name || '',
              keyGenerateRemaining: profile.generate_remaining ?? null,
              keyEditRemaining: profile.edit_remaining ?? null,
              keyMaxRunningTasks: profile.max_running_tasks ?? null,
            }
          : currentDraft,
      )
      setSettings(nextDraft)
    } catch {
      if (requestId !== profileRequestIdRef.current) return
      clearKeyProfile(normalizedDraft)
    } finally {
      if (requestId === profileRequestIdRef.current) {
        setProfileLoading(false)
      }
    }
  }, [clearKeyProfile, setSettings])

  useEffect(() => {
    if (!showSettings) return
    if (!settings.apiKey.trim()) return
    void refreshKeyProfile(apiProxyAvailable ? settings : { ...settings, apiProxy: false })
  }, [apiProxyAvailable, refreshKeyProfile, settings.apiKey, settings.baseUrl, showSettings])

  const handleClose = () => {
    const nextTimeout = Number(timeoutInput)
    const nextDraft = {
      ...draft,
      timeout:
        timeoutInput.trim() === '' || Number.isNaN(nextTimeout)
          ? DEFAULT_SETTINGS.timeout
          : nextTimeout,
    }
    commitSettings(nextDraft)
    void refreshKeyProfile(nextDraft)
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
    <div data-no-drag-select className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in"
        onClick={handleClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 overflow-y-auto max-h-[85vh] custom-scrollbar"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('settings.title')}
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono select-none"></span>
            <button
              onClick={handleClose}
              className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              aria-label={t('common.close')}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <section>
            <h4 className="mb-4 text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-10h-1M4.34 12h-1m15.07 6.36-.71-.71M6.34 6.34l-.71-.71m12.02 0-.71.71M6.34 17.66l-.71.71M12 7a5 5 0 100 10 5 5 0 000-10z" />
              </svg>
              {t('settings.ui')}
            </h4>
            <label className="block">
              <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('settings.language')}</span>
              <Select
                value={draft.language}
                onChange={(value) => {
                  const nextDraft = { ...draft, language: value as AppSettings['language'] }
                  setDraft(nextDraft)
                  commitSettings(nextDraft)
                }}
                options={LANGUAGE_OPTIONS}
                className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
              />
            </label>
          </section>

          <section className="pt-6 border-t border-gray-100 dark:border-white/[0.08]">
            <h4 className="mb-4 text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              {t('settings.apiConfig')}
            </h4>
            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-200/70 bg-gray-50/70 px-3 py-3 text-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">{t('settings.apiUrlLabel')}</span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">{t('settings.apiUrlEnvBadge')}</span>
                </div>
                <p className="text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                  {t('settings.apiUrlEnvDesc', { env: 'VITE_DEFAULT_API_URL' })}
                </p>
              </div>

              <div className="block">
                <div className="mb-1 flex items-center justify-between">
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{t('settings.codexCli')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextDraft = { ...draft, codexCli: !draft.codexCli }
                      setDraft(nextDraft)
                      commitSettings(nextDraft)
                    }}
                    className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${draft.codexCli ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    role="switch"
                    aria-checked={draft.codexCli}
                    aria-label={t('settings.codexCli')}
                  >
                    <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition-transform ${draft.codexCli ? 'translate-x-[11px]' : 'translate-x-[2px]'}`} />
                  </button>
                </div>
                <div data-selectable-text className="text-[10px] text-gray-400 dark:text-gray-500">
                  {t('settings.codexCliDesc')}
                </div>
              </div>

              {apiProxyAvailable && (
                <div className="block">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{t('settings.apiProxy')}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextDraft = { ...draft, apiProxy: !draft.apiProxy }
                        setDraft(nextDraft)
                        commitSettings(nextDraft)
                      }}
                      className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${draft.apiProxy ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      role="switch"
                      aria-checked={draft.apiProxy}
                      aria-label={t('settings.apiProxy')}
                    >
                      <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition-transform ${draft.apiProxy ? 'translate-x-[11px]' : 'translate-x-[2px]'}`} />
                    </button>
                  </div>
                  <div data-selectable-text className="text-[10px] text-gray-400 dark:text-gray-500">
                    {t('settings.apiProxyDesc')}
                  </div>
                </div>
              )}

              <div className="block">
                <div className="mb-1 flex items-center justify-between">
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{t('settings.backgroundTasks')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextDraft = { ...draft, backgroundTasks: !draft.backgroundTasks }
                      setDraft(nextDraft)
                      commitSettings(nextDraft)
                    }}
                    className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${draft.backgroundTasks ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    role="switch"
                    aria-checked={draft.backgroundTasks}
                    aria-label={t('settings.backgroundTasks')}
                  >
                    <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition-transform ${draft.backgroundTasks ? 'translate-x-[11px]' : 'translate-x-[2px]'}`} />
                  </button>
                </div>
                <div data-selectable-text className="text-[10px] leading-4 text-gray-400 dark:text-gray-500">
                  {t('settings.backgroundTasksDesc')}
                </div>
              </div>

              <div className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('settings.apiKey')}</span>
                <div className="relative">
                  <input
                    value={draft.apiKey}
                    onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
                    onBlur={(e) => {
                      const nextDraft = { ...draft, apiKey: e.target.value }
                      commitSettings(nextDraft)
                      void refreshKeyProfile(nextDraft)
                    }}
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 pr-10 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
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
                <div data-selectable-text className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  {t('settings.apiKeyDesc')}
                </div>
                {profileLoading ? (
                  <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                    {t('settings.keyProfileLoading')}
                  </div>
                ) : null}
                {draft.keyRole ? (
                  <div className="mt-2 rounded-2xl border border-gray-200/70 bg-gray-50/70 px-3 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <div className="mb-2 text-[11px] font-medium text-gray-700 dark:text-gray-200">
                      {t('settings.keyProfileTitle')}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] leading-5 text-gray-500 dark:text-gray-400">
                      <div className="rounded-xl bg-white/70 px-2.5 py-2 dark:bg-black/10">
                        <div className="text-gray-400 dark:text-gray-500">{t('settings.keyRoleLabel')}</div>
                        <div className="font-medium text-gray-700 dark:text-gray-200">{draft.keyRole}</div>
                      </div>
                      <div className="rounded-xl bg-white/70 px-2.5 py-2 dark:bg-black/10">
                        <div className="text-gray-400 dark:text-gray-500">{t('settings.keyNameLabel')}</div>
                        <div className="truncate font-medium text-gray-700 dark:text-gray-200">{draft.keyName || '-'}</div>
                      </div>
                      <div className="rounded-xl bg-white/70 px-2.5 py-2 dark:bg-black/10">
                        <div className="text-gray-400 dark:text-gray-500">{t('settings.generateQuotaLabel')}</div>
                        <div className="font-medium text-gray-700 dark:text-gray-200">{formatLimitValue(draft.keyGenerateRemaining)}</div>
                      </div>
                      <div className="rounded-xl bg-white/70 px-2.5 py-2 dark:bg-black/10">
                        <div className="text-gray-400 dark:text-gray-500">{t('settings.editQuotaLabel')}</div>
                        <div className="font-medium text-gray-700 dark:text-gray-200">{formatLimitValue(draft.keyEditRemaining)}</div>
                      </div>
                      <div className="rounded-xl bg-white/70 px-2.5 py-2 dark:bg-black/10">
                        <div className="text-gray-400 dark:text-gray-500">{t('settings.runningTasksLabel')}</div>
                        <div className="font-medium text-gray-700 dark:text-gray-200">{runningTaskCount}</div>
                      </div>
                      <div className="rounded-xl bg-white/70 px-2.5 py-2 dark:bg-black/10">
                        <div className="text-gray-400 dark:text-gray-500">{t('settings.maxRunningTasksLabel')}</div>
                        <div className="font-medium text-gray-700 dark:text-gray-200">{formatLimitValue(draft.keyMaxRunningTasks)}</div>
                      </div>
                      <div className="col-span-2 rounded-xl bg-white/70 px-2.5 py-2 dark:bg-black/10">
                        <div className="text-gray-400 dark:text-gray-500">{t('settings.availableTaskSlotsLabel')}</div>
                        <div className="font-medium text-gray-700 dark:text-gray-200">{formatLimitValue(availableTaskSlots)}</div>
                      </div>
                    </div>
                  </div>
                ) : draft.apiKey.trim() && !profileLoading ? (
                  <div className="mt-2 rounded-xl border border-gray-200/70 bg-gray-50/70 px-3 py-2 text-[10px] leading-5 text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
                    {t('settings.keyProfileUnavailable')}
                  </div>
                ) : null}
              </div>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('settings.apiMode')}</span>
                <Select
                  value={draft.apiMode ?? DEFAULT_SETTINGS.apiMode}
                  onChange={(value) => {
                    const apiMode = value as AppSettings['apiMode']
                    const nextModel =
                      draft.model === DEFAULT_IMAGES_MODEL || draft.model === DEFAULT_RESPONSES_MODEL
                        ? getDefaultModelForMode(apiMode)
                        : draft.model
                    const nextDraft = { ...draft, apiMode, model: nextModel }
                    setDraft(nextDraft)
                    commitSettings(nextDraft)
                  }}
                  options={[
                    { label: t('settings.apiModeImages'), value: 'images' },
                    { label: t('settings.apiModeResponses'), value: 'responses' },
                  ]}
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div data-selectable-text className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  {t('settings.apiModeQueryDesc', { images: 'apiMode=images', responses: 'apiMode=responses' })}
                </div>
              </label>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {t('settings.modelId')}
                </span>
                <input
                  value={draft.model}
                  onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
                  onBlur={(e) => commitSettings({ ...draft, model: e.target.value })}
                  type="text"
                  placeholder={getDefaultModelForMode(draft.apiMode ?? DEFAULT_SETTINGS.apiMode)}
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
                <div data-selectable-text className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  {(draft.apiMode ?? DEFAULT_SETTINGS.apiMode) === 'responses' ? (
                    <>{t('settings.responsesModelHint', { tool: 'image_generation', model: DEFAULT_RESPONSES_MODEL })}</>
                  ) : (
                    <>{t('settings.imagesModelHint', { model: DEFAULT_IMAGES_MODEL })}</>
                  )}
                </div>
              </label>

              <label className="block">
                <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('settings.timeoutSeconds')}</span>
                <input
                  value={timeoutInput}
                  onChange={(e) => setTimeoutInput(e.target.value)}
                  onBlur={commitTimeout}
                  type="number"
                  min={10}
                  max={600}
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
              </label>
            </div>
          </section>

          <section className="pt-6 border-t border-gray-100 dark:border-white/[0.08]">
            <h4 className="mb-4 text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              {t('settings.dataManagement')}
            </h4>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => exportData()}
                  className="flex-1 rounded-xl bg-gray-100/80 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {t('common.export')}
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="flex-1 rounded-xl bg-gray-100/80 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {t('common.import')}
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
                    title: t('settings.clearAllDataTitle'),
                    message: t('settings.clearAllDataMessage'),
                    tone: 'danger',
                    action: () => clearAllData(),
                  })
                }
                className="w-full rounded-xl border border-red-200/80 bg-red-50/50 px-4 py-2.5 text-sm text-red-500 transition hover:bg-red-100/80 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
              >
                {t('settings.clearAllData')}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
