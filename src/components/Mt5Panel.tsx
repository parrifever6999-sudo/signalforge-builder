import { useEffect, useState } from 'react'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { cleanAccount, fmtNum, strategySlug } from '../codegen/generator'
import type { GenResult } from '../codegen/generator'
import { signupUrl } from '../links'
import { copyText, useUnlockNudge } from './CodePanel'
import { useAccess } from '../access/access'
import { maskLine } from '../access/mask'
import { UnlockCard } from '../access/UnlockCard'

// What TradingView must put in the alert message for SignalForge to read the order.
const ALERT_MESSAGE = '{{strategy.order.alert_message}}'

// How to take the strategy from this page to a live MT5 account.
export function Mt5Panel({ gen }: { gen: GenResult }) {
  const t = useT()
  const lang = useBuilder((s) => s.lang)
  const title = useBuilder((s) => s.title)
  const settings = useBuilder((s) => s.settings)
  const status = useAccess((s) => s.status)
  const [copied, setCopied] = useState(false)
  // Without a plan the message is not shown in full; Copy brings up the unlock card.
  const open = status === 'unlocked'
  const [asked, setAsked] = useState(false)
  const unlock = useUnlockNudge()
  useEffect(() => {
    if (asked) unlock.show()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked])

  const onCopy = async () => {
    if (!open) {
      if (asked) unlock.show()
      else setAsked(true)
      return
    }
    if (!(await copyText(ALERT_MESSAGE))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const sample = JSON.stringify({
    action: 'buy',
    symbol: settings.symbol || `(${t('mt5.chartSymbol')})`,
    lot: fmtNum(Math.max(0.01, settings.lot || 0.1)),
    ...(cleanAccount(settings.account) ? { account: cleanAccount(settings.account) } : {}),
    strategy: strategySlug(title),
  })
  // Asked of the script rather than of the settings: a target in multiples of
  // the stop with no stop set produces no exit order at all.
  const hasBracket = gen.code.includes('strategy.exit(')

  return (
    <section className="mt5-panel">
      <div className="panel-head"><h3>{t('mt5.title')}</h3></div>

      {!gen.isStrategy ? (
        <div className="notice">{t('mt5.needStrategy')}</div>
      ) : (
        <>
          <p className="lead">{t('mt5.intro')}</p>
          <ol className="steps">
            <li>{t('mt5.step1')}</li>
            <li>{t('mt5.step2')}</li>
            <li>
              {t('mt5.step3')}
              <div className="copy-row">
                {open
                  ? <code>{ALERT_MESSAGE}</code>
                  : <code className="code-mask" aria-hidden="true">{maskLine(ALERT_MESSAGE, 0)}</code>}
                <button type="button" onClick={onCopy} disabled={status === 'checking'}>
                  {copied ? t('code.copied') : t('code.copy')}
                </button>
              </div>
              {!open && asked && status === 'locked' && (
                <UnlockCard compact linkRef={unlock.linkRef} nudge={unlock.nudge} />
              )}
            </li>
            <li>{t('mt5.step4')}</li>
          </ol>

          <p className="fine">{t('mt5.sample')}</p>
          <pre className="code-block small">{sample}</pre>
          {/* Seen live: with a fixed lot in the account, the lot in the alert is not the one traded. */}
          <p className="fine">{t('mt5.lotNote')}</p>
          {hasBracket && <p className="fine">{t('mt5.stopNote')}</p>}

          <a className="cta" href={signupUrl(lang)} target="_blank" rel="noopener">{t('mt5.cta')}</a>
          <p className="fine">{t('mt5.note')}</p>
        </>
      )}
    </section>
  )
}
