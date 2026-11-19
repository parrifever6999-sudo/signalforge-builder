import { useRef, useState } from 'react'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { LANGS } from '../lang'
import type { Lang } from '../lang'
import { MARKETS, SAMPLE_MARKET, TIMEFRAMES } from '../data/market'
import type { Timeframe } from '../data/market'
import { EXAMPLES } from '../store/examples'
import type { ExampleKey } from '../store/examples'
import { sanitizeState } from '../store/graphIO'
import { shareUrl } from '../store/boot'
import { strategySlug } from '../codegen/generator'
import { SITE_URL } from '../links'

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function Toolbar() {
  const t = useT()
  const title = useBuilder((s) => s.title)
  const setTitle = useBuilder((s) => s.setTitle)
  const market = useBuilder((s) => s.market)
  const setMarket = useBuilder((s) => s.setMarket)
  const timeframe = useBuilder((s) => s.timeframe)
  const setTimeframe = useBuilder((s) => s.setTimeframe)
  const lang = useBuilder((s) => s.lang)
  const setLang = useBuilder((s) => s.setLang)
  const instance = useBuilder((s) => s.instance)
  const hasBlocks = useBuilder((s) => s.nodes.length > 0)

  const fileRef = useRef<HTMLInputElement>(null)
  const [shared, setShared] = useState(false)

  const onSave = () => {
    const state = useBuilder.getState().snapshot()
    download(`${strategySlug(state.title)}.json`, JSON.stringify(state, null, 2), 'application/json')
  }

  const onOpen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    let state = null
    try {
      state = sanitizeState(JSON.parse(await file.text()))
    } catch {
      state = null
    }
    if (!state || state.nodes.length === 0) {
      window.alert(t('toolbar.openError'))
      return
    }
    useBuilder.getState().applyState(state)
  }

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl())
      setShared(true)
      setTimeout(() => setShared(false), 1800)
    } catch {
      window.prompt(t('toolbar.share'), shareUrl())
    }
  }

  const onClear = () => {
    if (window.confirm(t('toolbar.clearConfirm'))) useBuilder.getState().clear()
  }

  return (
    <header className="toolbar">
      <a className="brand" href={SITE_URL} target="_blank" rel="noopener">
        <span className="brand-mark" aria-hidden="true" />
        <span>SignalForge<span className="ai-mark">AI</span></span>
        <span className="tag">{t('app.name')}</span>
      </a>

      <input
        className="title-input" value={title} maxLength={80}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('toolbar.titlePlaceholder')} aria-label={t('toolbar.titlePlaceholder')}
      />

      <select aria-label={t('toolbar.market')} value={market} onChange={(e) => setMarket(e.target.value)}>
        {MARKETS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        <option value={SAMPLE_MARKET}>{t('market.SAMPLE')}</option>
      </select>

      <select
        aria-label={t('toolbar.timeframe')} value={timeframe} disabled={market === SAMPLE_MARKET}
        onChange={(e) => setTimeframe(e.target.value as Timeframe)}
      >
        {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
      </select>

      <div className="actions">
        <select
          aria-label={t('toolbar.examples')} value=""
          onChange={(e) => e.target.value && useBuilder.getState().loadExample(e.target.value as ExampleKey)}
        >
          <option value="">{t('toolbar.examples')}</option>
          {EXAMPLES.map((k) => <option key={k} value={k}>{t(`toolbar.example.${k}`)}</option>)}
        </select>
        <button type="button" onClick={() => fileRef.current?.click()}>{t('toolbar.open')}</button>
        <button type="button" onClick={onSave} disabled={!hasBlocks}>{t('toolbar.save')}</button>
        <button type="button" onClick={onShare} disabled={!hasBlocks}>
          {shared ? t('toolbar.shared') : t('toolbar.share')}
        </button>
        <button type="button" onClick={() => instance?.fitView({ padding: 0.15 })}>{t('toolbar.fit')}</button>
        <button type="button" onClick={onClear} disabled={!hasBlocks}>{t('toolbar.clear')}</button>
        <select aria-label={t('toolbar.language')} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onOpen} />
      </div>
    </header>
  )
}
