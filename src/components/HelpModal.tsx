import { useState, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { useI18n } from '../hooks/useI18n'

interface HelpModalProps {
  onClose: () => void
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

export default function HelpModal({ onClose }: HelpModalProps) {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  useCloseOnEscape(true, onClose)

  return createPortal(
    <div
      data-no-drag-select
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" />
      <div
        className="relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 flex flex-col max-h-[85vh] custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
            {t('help.title')}
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              aria-label={t('common.close')}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto mb-6 text-sm text-gray-600 dark:text-gray-300 space-y-6 custom-scrollbar pr-2">
          {isMobile ? (
            <>
              <HelpSection title={t('help.multiSelect')} icon="list">
                <p>{t('help.mobileSwipePrefix')}</p>
              </HelpSection>
              <HelpSection title={t('help.batchActions')} icon="check">
                <p>{t('help.batchActionsText')}</p>
              </HelpSection>
            </>
          ) : (
            <>
              <HelpSection title={t('help.multiSelect')} icon="list">
                <ul className="list-disc pl-4 space-y-2">
                  <li>{t('help.desktopDragSelect')}</li>
                  <li>{t('help.desktopCtrlClick')}</li>
                  <li>{t('help.desktopToggleSelected')}</li>
                  <li>{t('help.desktopClearSelection')}</li>
                </ul>
              </HelpSection>
              <HelpSection title={t('help.batchActions')} icon="check">
                <p>{t('help.batchActionsText')}</p>
              </HelpSection>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function HelpSection({ title, icon, children }: { title: string; icon: 'list' | 'check'; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-4 text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
        <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {icon === 'list' ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          )}
        </svg>
        {title}
      </h4>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
