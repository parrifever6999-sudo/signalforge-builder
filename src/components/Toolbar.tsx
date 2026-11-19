import { useRef, useState } from 'react'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { LANGS, localeOf } from '../lang'
import type { Lang } from '../lang'
import {
  CUSTOM_MARKET, DEPTHS, MARKETS, MARKET_GROUPS, SAMPLE_MARKET, TIMEFRAMES,
} from '../data/market'
import type { Timeframe } from '../data/market'
import { EXAMPLES } from '../store/examples'
import type { ExampleKey } from '../store/examples'
import { sanitizeState } from '../store/graphIO'
import { shareUrl } from '../store/boot'
import { strategySlug } from '../codegen/generator'
import { SITE_URL } from '../links'
import { decodeText } from '../data/csv'

const MAX_CSV_BYTES = 40 * 1024 * 1024

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
  const depth = useBuilder((s) => s.depth)
  const setDepth = useBuilder((s) => s.setDepth)
  const custom = useBuilder((s) => s.custom)
  const lang = useBuilder((s) => s.lang)
  const setLang = useBuilder((s) => s.setLang)
  const instance = useBuilder((s) => s.instance)
  const hasBlocks = useBuilder((s) => s.nodes.length > 0)

  const fileRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const [shared, setShared] = useState(false)

  // Candles the exchange serves: the file and the sample series have their own.
  const fromExchange = market !== SAMPLE_MARKET && market !== CUSTOM_MARKET

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

  const onCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_CSV_BYTES) {
      window.alert(t('csv.tooBig'))
      return
    }
    const error = useBuilder.getState().importCsv(file.name, decodeText(await file.arrayBuffer()))
    if (error) window.alert(t(error))
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
        {MARKET_GROUPS.map((group) => (
          <optgroup key={group} label={t(`market.group.${group}`)}>
            {MARKETS.filter((m) => m.group === group).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </optgroup>
        ))}
        <optgroup label={t('market.group.other')}>
          {custom && <option value={CUSTOM_MARKET}>{t('market.CUSTOM', { name: custom.name })}</option>}
          <option value={SAMPLE_MARKET}>{t('market.SAMPLE')}</option>
        </optgroup>
      </select>

      <select
        aria-label={t('toolbar.timeframe')} value={timeframe} disabled={!fromExchange}
        onChange={(e) => setTimeframe(e.target.value as Timeframe)}
      >
        {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
      </select>

      <select
        aria-label={t('toolbar.depth')} title={t('toolbar.depthHint')} value={depth} disabled={!fromExchange}
        onChange={(e) => setDepth(Number(e.target.value))}
      >
        {DEPTHS.map((n) => (
          <option key={n} value={n}>{t('toolbar.candles', { n: n.toLocaleString(localeOf(lang)) })}</option>
        ))}
      </select>

      <button type="button" onClick={() => csvRef.current?.click()} title={t('toolbar.csvHint')}>
        {t('toolbar.csv')}
      </button>

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
        <input ref={csvRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden onChange={onCsv} />
      </div>
    </header>
  )
}
