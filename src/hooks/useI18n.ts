import { useCallback } from 'react'
import { useStore } from '../store'
import { normalizeLocale, translate, type MessageKey } from '../lib/i18n'

type Values = Record<string, string | number | boolean | null | undefined>

export function useI18n() {
  const language = useStore((s) => s.settings.language)
  const locale = normalizeLocale(language)
  const t = useCallback(
    (key: MessageKey, values?: Values) => translate(locale, key, values),
    [locale],
  )

  return { locale, t }
}
