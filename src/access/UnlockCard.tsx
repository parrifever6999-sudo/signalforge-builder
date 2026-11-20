import type { Ref } from 'react'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { UNLOCK_URL, pricingUrl } from '../links'
import { saveNow } from '../store/boot'

// What a locked user sees instead of the script: how to unlock it with a
// SignalForge plan. "Unlock" leaves in this same tab and the dashboard sends
// the browser back here, so the canvas is saved first.
export function UnlockCard({
  compact = false, linkRef, nudge = false,
}: { compact?: boolean; linkRef?: Ref<HTMLAnchorElement>; nudge?: boolean }) {
  const t = useT()
  const lang = useBuilder((s) => s.lang)
  const classes = ['unlock-card', compact ? 'compact' : '', nudge ? 'nudge' : ''].filter(Boolean).join(' ')
  return (
    <div className={classes} role="note">
      <strong className="unlock-title">{compact ? t('lock.mt5') : t('lock.title')}</strong>
      {!compact && <p className="unlock-body">{t('lock.body')}</p>}
      <div className="unlock-actions">
        <a className="unlock-go" ref={linkRef} href={UNLOCK_URL} onClick={saveNow}>{t('lock.unlock')}</a>
        <a className="unlock-plans" href={pricingUrl(lang)} target="_blank" rel="noopener">{t('lock.plans')}</a>
      </div>
    </div>
  )
}
