import { useEffect, useRef, useState } from 'react'
import type { TaskParams, TaskRecord } from '../types'
import { useI18n } from '../hooks/useI18n'
import type { MessageKey } from './i18n'
import ViewportTooltip from '../components/ViewportTooltip'

type ParamKey = keyof TaskParams

interface ParamValueProps {
  task: TaskRecord
  paramKey: ParamKey
  className?: string
  actualParams?: Partial<TaskParams>
}

interface ActualValueBadgeProps {
  value: string
  className?: string
  variant?: 'highlight' | 'normal'
}

const PARAM_VALUE_KEYS: Record<string, MessageKey> = {
  auto: 'param.value.auto',
  low: 'param.value.low',
  medium: 'param.value.medium',
  high: 'param.value.high',
}

function formatParamValue(value: string, t: (key: MessageKey) => string): string {
  const key = PARAM_VALUE_KEYS[value]
  if (key) return t(key)
  if (value === 'png' || value === 'jpeg' || value === 'webp') return value.toUpperCase()
  return value
}

export function ActualValueBadge({ value, className = '', variant = 'highlight' }: ActualValueBadgeProps) {
  const { t } = useI18n()
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const touchTimerRef = useRef<number | null>(null)
  const colorClass = variant === 'normal'
    ? 'bg-gray-100 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400'
    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300'

  useEffect(() => () => {
    if (touchTimerRef.current != null) window.clearTimeout(touchTimerRef.current)
  }, [])

  const clearTouchTimer = () => {
    if (touchTimerRef.current != null) {
      window.clearTimeout(touchTimerRef.current)
      touchTimerRef.current = null
    }
  }

  return (
    <span
      className={`relative inline-flex cursor-help ${colorClass} ${className}`}
      role="button"
      tabIndex={0}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
      onFocus={() => setTooltipVisible(true)}
      onBlur={() => setTooltipVisible(false)}
      onClick={() => setTooltipVisible(true)}
      onTouchStart={() => {
        clearTouchTimer()
        touchTimerRef.current = window.setTimeout(() => {
          setTooltipVisible(true)
          touchTimerRef.current = null
        }, 450)
      }}
      onTouchEnd={clearTouchTimer}
      onTouchCancel={clearTouchTimer}
    >
      {value}
      <ViewportTooltip visible={tooltipVisible} className="whitespace-nowrap">
        {t('task.apiActualValue')}
      </ViewportTooltip>
    </span>
  )
}

export function getParamDisplay(task: TaskRecord, paramKey: ParamKey, actualParams = task.actualParams) {
  const requestedValue = task.params[paramKey]
  const actualValue = paramKey === 'n' && task.outputImages?.length > 0
    ? task.outputImages.length
    : actualParams?.[paramKey]
  const hasActualValue = actualValue !== undefined && actualValue !== null
  const displayValue = hasActualValue ? actualValue : requestedValue
  const isMismatch =
    hasActualValue &&
    requestedValue !== 'auto' &&
    String(actualValue) !== String(requestedValue)

  return {
    displayValue: String(displayValue),
    isMismatch,
    requestedValue: String(requestedValue),
    isAutoResolved: hasActualValue && requestedValue === 'auto' && String(actualValue) !== String(requestedValue),
  }
}

export function ParamValue({ task, paramKey, className = '', actualParams }: ParamValueProps) {
  const { t } = useI18n()
  const { displayValue, isMismatch } = getParamDisplay(task, paramKey, actualParams)
  const displayLabel = formatParamValue(displayValue, t)

  if (isMismatch) {
    return <ActualValueBadge value={displayLabel} className={className} />
  }

  return (
    <span className={`${className} bg-gray-100 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400`}>
      {displayLabel}
    </span>
  )
}

export function DetailParamValue({ task, paramKey, className = '', actualParams }: ParamValueProps) {
  const { t } = useI18n()
  const { displayValue, isMismatch, requestedValue, isAutoResolved } = getParamDisplay(task, paramKey, actualParams)
  const displayLabel = formatParamValue(displayValue, t)
  const requestedLabel = formatParamValue(requestedValue, t)

  if (!isMismatch) {
    if (isAutoResolved) {
      return (
        <span className={`inline-flex items-center gap-1 ${className}`}>
          <span className="text-gray-700 dark:text-gray-300">{requestedLabel}</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <ActualValueBadge value={displayLabel} variant="normal" className="rounded px-1 py-0.5" />
        </span>
      )
    }
    return <span className={`text-gray-700 dark:text-gray-300 ${className}`}>{displayLabel}</span>
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="text-gray-700 dark:text-gray-300">{requestedLabel}</span>
      <span className="text-gray-300 dark:text-gray-600">|</span>
      <ActualValueBadge value={displayLabel} className="rounded px-1 py-0.5" />
    </span>
  )
}
