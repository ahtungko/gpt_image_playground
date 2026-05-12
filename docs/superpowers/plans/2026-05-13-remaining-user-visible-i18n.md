# Remaining User-Visible i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining user-visible translation pass so English UI no longer shows leftover Chinese text in store flows, settings flows, and drag-select / confirm-dialog behavior.

**Architecture:** Shared runtime strings should live in `src/lib/i18n.ts` and be resolved from persisted `settings.language` in both React components and store actions. `SettingsModal` should keep using its local `tx(...)` wrapper over `inlineTranslate(...)` for modal-specific copy, while `ConfirmDialog` should stop inferring destructive state from localized title text and instead rely on explicit `tone`.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Vite raw-source imports

---

## File structure / change map

- `src/lib/i18n.ts` — shared keyed translations for store-generated toasts/dialogs and the `TaskGrid` drag-scroll hint.
- `src/lib/inlineI18n.ts` — `SettingsModal`-local translation strings routed through `tx(...)`.
- `src/store.ts` — store-side runtime messaging; must translate using `settings.language` instead of hardcoded Chinese.
- `src/store.test.ts` — behavioral coverage for English store messages.
- `src/components/SettingsModal.tsx` — replace remaining hardcoded visible text with `tx(...)`/`t(...)`.
- `src/components/TaskGrid.tsx` — translate the drag-select wheel/edge-scroll helper toast.
- `src/components/ConfirmDialog.tsx` — remove title-text heuristics; destructive styling comes from `tone`.
- `src/i18n.test.ts` — source-level regression coverage for the remaining UI files plus translation-catalog spot checks.

## Task 1: Extend the translation catalogs and lock in regression coverage

**Files:**
- Modify: `src/lib/i18n.ts`
- Modify: `src/lib/inlineI18n.ts`
- Modify: `src/i18n.test.ts`

**Why first:** The rest of the implementation needs stable keys and translation entries to target. Writing the failing tests first also gives immediate proof that the missing catalog entries really are absent.

- [ ] **Step 1: Write the failing translation-catalog tests**

Add a narrow regression block near the top of `src/i18n.test.ts` after the existing imports:

```ts
import { inlineTranslate } from './lib/inlineI18n'

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
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```bash
npm test -- src/i18n.test.ts
```

Expected: FAIL with at least one missing-key assertion returning the raw key string (for example `store.apiProfileMissingTitle`) and at least one `inlineTranslate('en', ...)` expectation returning the original Chinese string.

- [ ] **Step 3: Add the shared keyed messages and the inline modal messages**

Append these exact shared keys to the English map in `src/lib/i18n.ts` immediately after the existing `store.*` block, then add matching Chinese entries in the `zh` map with the same keys:

```ts
  'store.requestInterrupted': 'Request interrupted',
  'store.requestTimeoutDetail': 'Request timed out: still not finished after {seconds} seconds. Try again later or increase the timeout.',
  'store.openaiTimeoutToast': 'OpenAI task request timed out',
  'store.apiProfileIncomplete': 'Complete the API profile first: {error}',
  'store.apiProfileMissingTitle': 'API profile not found',
  'store.apiProfileMissingMessage': 'The reused task API profile “{taskProfile}” was not found. Submit with the current API profile “{currentProfile}” instead?',
  'store.apiProfileUsedByTaskMissing': 'The API profile used by this task could not be found.',
  'store.submitWithCurrentProfile': 'Submit with current profile',
  'store.cancelSubmit': 'Cancel submit',
  'store.falConnectionQueued': 'Connection to fal.ai was lost. The app will keep checking for task results.',
  'store.customConnectionQueued': 'Connection to the custom async task was lost. The app will keep checking for task results.',
  'store.falRecoveryRestored': 'fal.ai task restored with {count} image(s)',
  'store.customRecoveryRestored': 'Custom async task restored with {count} image(s)',
  'store.temporarilyReusedApiProfile': 'Temporarily reused the task API profile “{name}”',
  'store.selectedDataCleared': 'Selected data cleared',
  'store.configImported': 'Config imported successfully',
  'taskGrid.dragScrollHint': 'Release {key} and use the wheel, or drag to the edge to auto-scroll',
```

Add the matching `inlineTranslate(...)` entries to `src/lib/inlineI18n.ts`:

```ts
  '导入 URL 已复制': 'Import URL copied',
  '导入 URL 已复制（包含 API Key）': 'Import URL copied (includes API key)',
  '复制导入 URL 失败': 'Failed to copy import URL',
  '服务商配置已更新': 'Provider config updated',
  '服务商已删除': 'Provider deleted',
  'LLM 生成提示词已复制': 'LLM generation prompt copied',
  '复制 LLM 生成提示词失败': 'Failed to copy the LLM generation prompt',
  '已覆盖当前空配置': 'Replaced the current empty profile',
  '已存在相同配置，已切换到已有配置': 'An identical profile already exists; switched to it',
  'JSON 配置已导入并切换': 'JSON config imported and activated',
  'JSON 配置已导入': 'JSON config imported',
  '无法读取剪贴板，请允许浏览器访问剪贴板，或直接粘贴到输入框中': 'Clipboard access was denied. Allow clipboard access in the browser, or paste directly into the text area.',
```

Use these Chinese translations in the `zh` map for the new shared keys:

```ts
  'store.requestInterrupted': '请求中断',
  'store.requestTimeoutDetail': '请求超时：超过 {seconds} 秒仍未完成，请稍后重试或提高超时时间。',
  'store.openaiTimeoutToast': 'OpenAI 任务请求超时',
  'store.apiProfileIncomplete': '请先完善请求 API 配置：{error}',
  'store.apiProfileMissingTitle': '找不到 API 配置',
  'store.apiProfileMissingMessage': '找不到复用任务所使用的 API 配置「{taskProfile}」，要使用当前的 API 配置「{currentProfile}」提交任务吗？',
  'store.apiProfileUsedByTaskMissing': '找不到此任务所使用的 API 配置。',
  'store.submitWithCurrentProfile': '使用当前配置提交',
  'store.cancelSubmit': '放弃提交',
  'store.falConnectionQueued': '与 fal.ai 的连接已断开，之后会继续查询任务结果。',
  'store.customConnectionQueued': '与自定义异步任务的连接已断开，之后会继续查询任务结果。',
  'store.falRecoveryRestored': 'fal.ai 任务已恢复，共 {count} 张图片',
  'store.customRecoveryRestored': '自定义异步任务已恢复，共 {count} 张图片',
  'store.temporarilyReusedApiProfile': '已临时复用该任务的 API 配置「{name}」',
  'store.selectedDataCleared': '所选数据已清空',
  'store.configImported': '配置已成功导入',
  'taskGrid.dragScrollHint': '松开 {key} 键使用滚轮，或拖至边缘自动滚动',
```

- [ ] **Step 4: Run the targeted tests and verify they pass**

Run:

```bash
npm test -- src/i18n.test.ts
```

Expected: PASS with the two new catalog checks succeeding and the existing i18n source checks still green.

- [ ] **Step 5: Commit the catalog/test scaffold**

Run:

```bash
git add src/lib/i18n.ts src/lib/inlineI18n.ts src/i18n.test.ts
git commit -m "test(i18n): cover remaining translation catalogs"
```

## Task 2: Localize store-generated dialogs, toasts, and recovery errors

**Files:**
- Modify: `src/store.ts`
- Modify: `src/store.test.ts`

**Why next:** `store.ts` owns the remaining high-value user-visible runtime text. Once those flows are localized from `settings.language`, the app-level dialogs and toasts will stop leaking Chinese into the English UI.

- [ ] **Step 1: Write the failing store behavior tests**

Update existing tests in `src/store.test.ts` so store messaging is asserted in English, and add one direct prompt-required case:

```ts
it('marks legacy and OpenAI running tasks as interrupted in the active locale', () => {
  const now = 10_000
  const legacyRunning = task({ id: 'legacy-running', status: 'running', createdAt: 1_000, finishedAt: null, elapsed: null })
  const openAIRunning = task({ id: 'openai-running', apiProvider: 'openai', status: 'running', createdAt: 2_000, finishedAt: null, elapsed: null })

  const result = markInterruptedOpenAIRunningTasks([legacyRunning, openAIRunning], 'en', now)

  expect(result.tasks.find((item) => item.id === 'legacy-running')).toMatchObject({
    status: 'error',
    error: expect.stringContaining('Request interrupted'),
  })
  expect(result.tasks.find((item) => item.id === 'openai-running')).toMatchObject({
    status: 'error',
    error: expect.stringContaining('Request interrupted'),
  })
})

it('asks in English whether to submit with the current API profile when the reused API profile is missing', async () => {
  useStore.setState({
    settings: normalizeSettings({
      ...useStore.getState().settings,
      language: 'en',
    }),
  })

  await reuseConfig(task({ apiProvider: 'fal', apiProfileId: 'missing-profile' }))

  expect(useStore.getState().setConfirmDialog).toHaveBeenCalledWith(expect.objectContaining({
    title: 'API profile not found',
    message: 'The reused task API profile “Unknown” was not found. Submit with the current API profile “Default” instead?',
    confirmText: 'Submit with current profile',
    cancelText: 'Cancel submit',
  }))
})

it('shows the prompt-required toast in English', async () => {
  useStore.setState({
    settings: { ...DEFAULT_SETTINGS, language: 'en', apiKey: 'test-key' },
    prompt: '',
    inputImages: [],
    maskDraft: null,
    params: { ...DEFAULT_PARAMS },
    tasks: [],
    showToast: vi.fn(),
  })

  await submitTask()

  expect(useStore.getState().showToast).toHaveBeenCalledWith('Please enter a prompt', 'error')
})
```

Keep the existing Chinese-language behavior tests that are unrelated to runtime strings unchanged.

- [ ] **Step 2: Run the targeted store tests and verify they fail**

Run:

```bash
npm test -- src/store.test.ts
```

Expected: FAIL because `markInterruptedOpenAIRunningTasks` still emits Chinese text, the reused-profile confirmation still uses Chinese literals, and the prompt-required toast still returns Chinese.

- [ ] **Step 3: Replace the store hardcoded strings with translated messages**

Add translation plumbing at the top of `src/store.ts`, then replace each hardcoded runtime message with `translate(...)`-backed helpers:

```ts
import { translate, type Locale, type MessageKey } from './lib/i18n'

type TranslationValues = Record<string, string | number | boolean | null | undefined>

function tLocale(locale: Locale | undefined, key: MessageKey, values: TranslationValues = {}) {
  return translate(locale, key, values)
}

function createOpenAITimeoutError(locale: Locale | undefined, timeoutSeconds: number) {
  return tLocale(locale, 'store.requestTimeoutDetail', { seconds: timeoutSeconds })
}

export function markInterruptedOpenAIRunningTasks(tasks: TaskRecord[], locale: Locale | undefined, now = Date.now()) {
  const interruptedTasks: TaskRecord[] = []
  const updatedTasks = tasks.map((task) => {
    if (!isRunningOpenAITask(task) || task.customTaskId || task.backgroundTaskIds?.length) return task

    const updated: TaskRecord = {
      ...task,
      status: 'error',
      error: tLocale(locale, 'store.requestInterrupted'),
      falRecoverable: false,
      finishedAt: now,
      elapsed: Math.max(0, now - task.createdAt),
    }
    interruptedTasks.push(updated)
    return updated
  })

  return { tasks: updatedTasks, interruptedTasks }
}
```

Use the active settings language when calling these helpers:

```ts
const locale = normalizedSettings.language
showToast(tLocale(locale, 'store.apiProfileIncomplete', { error: validateApiProfile(activeProfile) }), 'error')
showToast(tLocale(locale, 'store.promptRequired'), 'error')

setConfirmDialog({
  title: tLocale(locale, 'store.apiProfileMissingTitle'),
  message: tLocale(locale, 'store.apiProfileMissingMessage', {
    taskProfile: reusedTaskApiProfileName || tLocale(locale, 'common.unknown'),
    currentProfile: activeProfile.name,
  }),
  confirmText: tLocale(locale, 'store.submitWithCurrentProfile'),
  cancelText: tLocale(locale, 'store.cancelSubmit'),
  action: () => {
    void submitTask({ ...options, useCurrentApiProfileWhenReusedMissing: true })
  },
})

setConfirmDialog({
  title: tLocale(locale, 'store.confirmFullMaskTitle'),
  message: tLocale(locale, 'store.confirmFullMaskMessage'),
  confirmText: tLocale(locale, 'store.continueSubmit'),
  tone: 'warning',
  action: () => {
    void submitTask({ allowFullMask: true })
  },
})
```

Make the rest of the replacements in the same file using the exact keys added in Task 1:

- `showToast('OpenAI 任务请求超时', 'error')` → `showToast(tLocale(locale, 'store.openaiTimeoutToast'), 'error')`
- `error: '找不到此任务所使用的 API 配置。'` → `error: tLocale(locale, 'store.apiProfileUsedByTaskMissing')`
- `throw new Error('输入图片已不存在')` → `throw new Error(tLocale(locale, 'store.inputImageMissing'))`
- `throw new Error('遮罩图片已不存在')` → `throw new Error(tLocale(locale, 'store.maskImageMissing'))`
- recovery queue errors → `store.falConnectionQueued` / `store.customConnectionQueued`
- recovery success toasts → `store.falRecoveryRestored` / `store.customRecoveryRestored`
- reuse success toast → `store.temporarilyReusedApiProfile` or existing `store.reusedConfig`
- output/delete/clear/export/import toasts → existing `store.outputsAdded`, `store.recordsDeleted`, `store.recordDeleted`, `store.selectedDataCleared`, `store.dataExported`, `store.exportFailed`, `store.importedRecords`, `store.configImported`, `store.importFailed`

Also update `initStore()` to pass the persisted language into interrupted-task repair:

```ts
const locale = useStore.getState().settings.language
const { tasks, interruptedTasks } = markInterruptedOpenAIRunningTasks(storedTasks, locale)
```

- [ ] **Step 4: Run the targeted store tests and verify they pass**

Run:

```bash
npm test -- src/store.test.ts
```

Expected: PASS with English assertions succeeding for interrupted tasks, missing-profile dialogs, and prompt-required toasts.

- [ ] **Step 5: Commit the store localization**

Run:

```bash
git add src/store.ts src/store.test.ts
git commit -m "feat(i18n): localize store runtime messages"
```

## Task 3: Finish SettingsModal, TaskGrid, and ConfirmDialog

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/TaskGrid.tsx`
- Modify: `src/components/ConfirmDialog.tsx`
- Modify: `src/i18n.test.ts`

**Why last:** These are the remaining visible UI leaks. By this point the translation catalogs and store-side plumbing already exist, so the component work is mostly direct replacement plus one small confirm-dialog behavior cleanup.

- [ ] **Step 1: Tighten the source-level regression test**

Extend `src/i18n.test.ts` so it catches the remaining untranslated component code and the old confirm-dialog heuristic:

```ts
import confirmDialogSource from './components/ConfirmDialog.tsx?raw'

const componentFiles = [
  'src/components/ConfirmDialog.tsx',
  'src/components/Header.tsx',
  'src/components/ImageContextMenu.tsx',
  'src/components/InputBar.tsx',
  'src/components/SettingsModal.tsx',
  'src/components/Select.tsx',
  'src/components/TaskGrid.tsx',
]

it('does not infer destructive dialog styling from localized title text', () => {
  expect(confirmDialogSource).not.toContain('/删除|清空|delete|clear/i')
})
```

Do not change the existing custom-provider prompt skip logic; it should still ignore the large Chinese LLM prompt block.

- [ ] **Step 2: Run the i18n test file and verify it fails**

Run:

```bash
npm test -- src/i18n.test.ts
```

Expected: FAIL because `SettingsModal.tsx` still contains hardcoded visible Chinese strings and `ConfirmDialog.tsx` still contains the localized regex heuristic.

- [ ] **Step 3: Replace the remaining component text and remove the title-text heuristic**

In `src/components/SettingsModal.tsx`, convert all remaining visible strings to `tx(...)` or `t(...)`. Use `t(...)` for existing shared/common labels, and `tx(...)` for modal-local copy already present in `src/lib/inlineI18n.ts`:

```tsx
showToast(options.includeApiKey ? tx('导入 URL 已复制（包含 API Key）') : tx('导入 URL 已复制'), 'success')
showToast(getClipboardFailureMessage(tx('复制导入 URL 失败'), err), 'error')

const profile = createDefaultOpenAIProfile({ id: newId('openai'), name: tx('新配置') })

showToast(tx('服务商配置已更新'), 'success')
showToast(tx('服务商已删除'), 'success')
showToast(tx('LLM 生成提示词已复制'), 'success')
showToast(getClipboardFailureMessage(tx('复制 LLM 生成提示词失败'), err), 'error')

showToast(
  shouldReplaceActiveProfile
    ? tx('已覆盖当前空配置')
    : switchedToExistingProfile
    ? tx('已存在相同配置，已切换到已有配置')
    : tx('JSON 配置已导入并切换'),
  'success',
)

showToast(tx('JSON 配置已导入'), 'success')
showToast(tx('无法读取剪贴板，请允许浏览器访问剪贴板，或直接粘贴到输入框中'), 'error')
```

Convert the remaining visible labels/buttons/headings the same way:

```tsx
<span className="block text-sm text-gray-600 dark:text-gray-300">{tx('提交任务后清空输入框')}</span>
<span className="block text-sm text-gray-600 dark:text-gray-300">{tx('重启后加载上次的输入框')}</span>
<span className="block text-sm text-gray-600 dark:text-gray-300">{tx('复用配置时临时复用该任务的 API 配置')}</span>
<span className="block text-sm text-gray-600 dark:text-gray-300">{tx('成功任务仍然展示重试按钮')}</span>
<span className="block text-sm text-gray-600 dark:text-gray-300">{tx('当前配置')}</span>
<h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">{tx('导出数据')}</h4>
<h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">{tx('导入数据')}</h4>
<h4 className="text-sm font-bold text-red-500/90 dark:text-red-400">{tx('清除数据')}</h4>
<button aria-label={t('common.close')}>...</button>
```

In `src/components/TaskGrid.tsx`, replace the helper toast:

```tsx
const keyName = isMac ? '⌘' : 'Ctrl'
useStore.getState().showToast(t('taskGrid.dragScrollHint', { key: keyName }), 'info')
```

In `src/components/ConfirmDialog.tsx`, remove the localized-title regex and let `tone` drive the destructive/default confirm button:

```tsx
const confirmTone = confirmDialog.tone
const confirmClassName =
  confirmTone === 'warning'
    ? 'bg-orange-500 hover:bg-orange-600'
    : confirmTone === 'danger'
    ? 'bg-red-500 hover:bg-red-600'
    : 'bg-blue-500 hover:bg-blue-600'

const confirmText = confirmDialog.confirmText ?? (confirmTone === 'danger' ? t('common.confirmDelete') : t('common.confirm'))
```

This task is complete only when there is no remaining user-visible hardcoded Chinese in these three component files outside the intentionally skipped custom-provider prompt body.

- [ ] **Step 4: Run the focused tests and then the full suite**

Run:

```bash
npm test -- src/i18n.test.ts
npm test -- src/store.test.ts
npm test
```

Expected:
- `src/i18n.test.ts` PASS
- `src/store.test.ts` PASS
- full `npm test` PASS

- [ ] **Step 5: Commit the finished translation pass**

Run:

```bash
git add src/components/SettingsModal.tsx src/components/TaskGrid.tsx src/components/ConfirmDialog.tsx src/i18n.test.ts
git commit -m "feat(i18n): finish remaining user-visible translations"
```

## Self-review

### Spec coverage

- Remaining store runtime strings: covered in Task 2.
- Remaining `SettingsModal` UI strings: covered in Task 3.
- `TaskGrid` drag-scroll helper toast: covered in Task 1 + Task 3.
- `ConfirmDialog` title-text heuristic removal: covered in Task 3.
- Keep custom-provider LLM prompt body untouched: enforced in Task 3 and preserved by the existing `i18n.test.ts` skip logic.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to previous task” instructions remain.
- Every code-edit step includes exact code blocks, commands, and expected outcomes.

### Type consistency

- Shared keyed-message names are consistent across the plan:
  - `store.apiProfileMissingTitle`
  - `store.apiProfileMissingMessage`
  - `store.requestInterrupted`
  - `store.requestTimeoutDetail`
  - `taskGrid.dragScrollHint`
- `SettingsModal` continues using `tx(...)` from `inlineTranslate(...)`, while shared runtime flows use `t(...)` / `translate(...)`.
