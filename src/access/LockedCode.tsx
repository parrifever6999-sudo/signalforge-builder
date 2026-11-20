import type { Ref } from 'react'
import { useT } from '../i18n'
import { lockedView } from './mask'
import { UnlockCard } from './UnlockCard'

// The code panel while the script is locked: the header lines of the real
// script, blurred noise where the rest goes, and the unlock card on top. While
// the plan is still being checked, the card is left out so it does not flash
// for someone who turns out to have a plan.
export function LockedCode({
  code, checking, linkRef, nudge = false,
}: { code: string; checking: boolean; linkRef?: Ref<HTMLAnchorElement>; nudge?: boolean }) {
  const t = useT()
  const { head, masked } = lockedView(code)
  return (
    <div className="locked-code" aria-busy={checking || undefined}>
      <pre className="code-block">
        {head}
        <span className="code-mask" aria-hidden="true">{masked}</span>
      </pre>
      {checking
        ? <p className="lock-checking">{t('lock.checking')}</p>
        : <UnlockCard linkRef={linkRef} nudge={nudge} />}
    </div>
  )
}
