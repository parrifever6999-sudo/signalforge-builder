import { useMemo, useState } from 'react'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { localeOf } from '../lang'
import type { GenResult } from '../codegen/generator'
import type { Candle, Trade } from '../types'
import {
  buyHoldCurve, buyHoldPct, downsample, equityCurve, monteCarlo, payoff, segmentStats, splitTrades,
  splitVerdict, streaks, HOLDOUT_RATIO, MIN_TRADES_MC,
} from '../engine/robustness'
import { htfNotices } from '../engine/warmup'

// Under this many trades a result says little: luck weighs more than the idea.
const FEW_TRADES = 30
const NO_TRADES: Trade[] = []
const FIRST_PCT = Math.round(HOLDOUT_RATIO * 100)

// What the strategy would have done on the loaded candles, how much of that
// can be trusted, plus anything the generator had to leave out.
export function StatsPanel({ gen }: { gen: GenResult }) {
  const t = useT()
  const lang = useBuilder((s) => s.lang)
  const runResult = useBuilder((s) => s.runResult)
  const runFor = useBuilder((s) => s.runFor)
  const candles = useBuilder((s) => s.candles)
  const isRunning = useBuilder((s) => s.isRunning)
  const loading = useBuilder((s) => s.dataState === 'loading')
  const settings = useBuilder((s) => s.settings)
  const holdout = useBuilder((s) => s.holdout)
  const setHoldout = useBuilder((s) => s.setHoldout)
  const [tab, setTab] = useState<'summary' | 'robust'>('summary')

  const locale = localeOf(lang)
  const fmt = (n: number, dec = 2) =>
    Number.isFinite(n)
      ? n.toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec })
      : '-'
  const signed = (n: number, dec = 2) => (n > 0 ? '+' : '') + fmt(n, dec)
  const pct = (n: number) => `${signed(n, 1)}%`
  // No losing trade: the factor has no upper end.
  const factor = (n: number) => (n === Infinity ? String.fromCharCode(8734) : fmt(n))
  // A part with no trades has no figures to show.
  const of = (trades: number, text: string) => (trades > 0 ? text : '-')

  const fits = !!runResult?.ok && runResult.isStrategy && runFor === candles
  const stats = fits ? runResult.stats : null
  const trades = fits ? runResult.trades : NO_TRADES
  const bars = candles.length

  const split = useMemo(() => splitTrades(trades, bars), [trades, bars])
  const first = useMemo(() => segmentStats(split.first), [split])
  const last = useMemo(() => segmentStats(split.last), [split])
  // With the last part held back, nothing shown may be computed from it.
  const seen = holdout ? split.first : trades
  const mc = useMemo(() => monteCarlo(seen), [seen])
  const streak = useMemo(() => streaks(seen), [seen])
  const seenBars = holdout ? split.cut : bars
  const bh = useMemo(() => buyHoldPct(candles, 0, seenBars), [candles, seenBars])
  // Higher-timeframe blocks the candles loaded are too few for.
  const short = useMemo(() => htfNotices(gen.needs, candles), [gen.needs, candles])

  const cost = settings.feePct + settings.slipPct
  const sizeText = t(`stats.size.${settings.sizeKind}`, { n: fmt(settings.sizeValue, settings.sizeValue % 1 ? 1 : 0) })

  return (
    <section className="stats-panel">
      <div className="panel-head">
        <h3>{t('stats.title')}</h3>
        {(isRunning || loading) && <span className="pill">{t('stats.running')}</span>}
        {stats && !isRunning && (
          <span className="pill">{t('stats.trades', { n: holdout ? first.trades : stats.totalTrades })}</span>
        )}
      </div>

      {gen.error && <div className="notice warn">{t(gen.error.key, gen.error.params)}</div>}
      {gen.warnings.map((w) => (
        <div key={w.key} className="notice warn">{t(w.key, w.params)}</div>
      ))}
      {short.map((n) => {
        const p = {
          block: t(`block.${n.indicator}.label`), tf: t(`tf.${n.tf}`),
          length: n.length, first: n.first, need: n.need, have: n.have,
        }
        return (
          <div key={`${n.indicator}-${n.tf}-${n.length}`} className="notice warn">
            {n.empty ? t('warn.htfEmpty', p) : t('warn.htfShort', p)}
          </div>
        )
      })}
      {runResult && !runResult.ok && (
        <div className="notice error">{t('stats.error', { msg: runResult.error ?? '?' })}</div>
      )}

      {runResult?.ok && !runResult.isStrategy && !gen.error && (
        <div className="notice">{t('stats.indicatorOnly')}</div>
      )}

      {stats && stats.totalTrades === 0 && <div className="notice">{t('stats.none')}</div>}

      {stats && stats.totalTrades > 0 && (
        <>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'summary'} onClick={() => setTab('summary')}>
              {t('stats.tab.summary')}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'robust'} onClick={() => setTab('robust')}>
              {t('stats.tab.robust')}
            </button>
          </div>

          {tab === 'summary' && (
            <>
              {holdout && <div className="notice">{t('stats.holdoutNote', { first: FIRST_PCT, last: 100 - FIRST_PCT })}</div>}
              <div className="stats-grid">
                {holdout ? (
                  <>
                    <Stat label={t('stats.net')} value={pct(first.netPct)} tone={first.netPct >= 0 ? 'up' : 'down'} />
                    <Stat label={t('stats.pf')} value={factor(first.profitFactor)} tone={first.profitFactor >= 1 ? 'up' : 'down'} />
                    <Stat
                      label={t('stats.win')} value={`${fmt(first.winRate, 1)}%`}
                      sub={`${t('stats.wins', { n: first.wins })}, ${t('stats.losses', { n: first.losses })}`}
                    />
                    <Stat label={t('stats.dd')} value={`-${fmt(first.maxDrawdownPct, 1)}%`} tone="down" />
                    <Stat label={t('stats.avg')} value={`${signed(first.avgPct)}%`} tone={first.avgPct >= 0 ? 'up' : 'down'} />
                  </>
                ) : (
                  <>
                    <Stat
                      label={t('stats.net')} value={pct(stats.netProfitPct)} sub={signed(stats.netProfit)}
                      tone={stats.netProfit >= 0 ? 'up' : 'down'}
                    />
                    <Stat label={t('stats.pf')} value={factor(stats.profitFactor)} tone={stats.profitFactor >= 1 ? 'up' : 'down'} />
                    <Stat
                      label={t('stats.win')} value={`${fmt(stats.winRate, 1)}%`}
                      sub={`${t('stats.wins', { n: stats.winTrades })}, ${t('stats.losses', { n: stats.lossTrades })}`}
                    />
                    <Stat label={t('stats.dd')} value={`-${fmt(stats.maxDrawdownPct, 1)}%`} tone="down" />
                    <Stat label={t('stats.avg')} value={signed(stats.avgTrade)} tone={stats.avgTrade >= 0 ? 'up' : 'down'} />
                  </>
                )}
                <Stat label={t('stats.bh')} value={pct(bh)} tone={bh >= 0 ? 'up' : 'down'} />
              </div>

              <EquityChart
                trades={trades} closes={candles} initial={stats.initialCapital}
                shown={seenBars} labels={[t('stats.equity'), t('stats.bh')]}
              />

              {(holdout ? first.trades : stats.totalTrades) < FEW_TRADES && (
                <div className="notice warn">{t('stats.few', { n: holdout ? first.trades : stats.totalTrades })}</div>
              )}
              {stats.openTrades > 0 && !holdout && <p className="fine">{t('stats.openNote', { n: stats.openTrades })}</p>}
              <p className="fine">
                {t('stats.assumptions', {
                  size: sizeText, cost: fmt(cost, 2), fee: fmt(settings.feePct, 2), slip: fmt(settings.slipPct, 2),
                })}
              </p>
            </>
          )}

          {tab === 'robust' && (
            <>
              <label className="check">
                <input type="checkbox" checked={holdout} onChange={(e) => setHoldout(e.target.checked)} />
                <span>{t('rob.holdout', { last: 100 - FIRST_PCT })}</span>
              </label>
              <p className="fine">{t('rob.holdoutHint', { last: 100 - FIRST_PCT })}</p>

              <table className="split">
                <thead>
                  <tr>
                    <th />
                    <th>{t('rob.col.first', { n: FIRST_PCT })}</th>
                    <th>{t('rob.col.last', { n: 100 - FIRST_PCT })}</th>
                  </tr>
                </thead>
                <tbody>
                  <SplitRow label={t('rob.row.trades')} a={String(first.trades)} b={String(last.trades)} hide={holdout} hidden={t('rob.hidden')} />
                  <SplitRow
                    label={t('rob.row.net')} a={of(first.trades, pct(first.netPct))} b={of(last.trades, pct(last.netPct))}
                    hide={holdout} hidden={t('rob.hidden')}
                    toneA={first.trades ? first.netPct >= 0 : undefined} toneB={last.trades ? last.netPct >= 0 : undefined}
                  />
                  <SplitRow
                    label={t('rob.row.pf')} a={of(first.trades, factor(first.profitFactor))} b={of(last.trades, factor(last.profitFactor))}
                    hide={holdout} hidden={t('rob.hidden')}
                  />
                  <SplitRow
                    label={t('rob.row.win')} a={of(first.trades, `${fmt(first.winRate, 1)}%`)} b={of(last.trades, `${fmt(last.winRate, 1)}%`)}
                    hide={holdout} hidden={t('rob.hidden')}
                  />
                </tbody>
              </table>
              {!holdout && <div className="notice">{t(`rob.verdict.${splitVerdict(first, last)}`)}</div>}

              {mc ? (
                <>
                  <h4 className="sub-head">{t('rob.mc', { n: seen.length })}</h4>
                  <table className="split">
                    <tbody>
                      <SplitRow label={t('rob.mc.p5')} a={pct(mc.p5)} toneA={mc.p5 >= 0} />
                      <SplitRow label={t('rob.mc.p50')} a={pct(mc.p50)} toneA={mc.p50 >= 0} />
                      <SplitRow label={t('rob.mc.p95')} a={pct(mc.p95)} toneA={mc.p95 >= 0} />
                      <SplitRow label={t('rob.mc.loss')} a={`${fmt(mc.probLoss, 0)}%`} />
                      <SplitRow label={t('rob.mc.dd')} a={`-${fmt(mc.ddP95, 1)}%`} toneA={false} />
                      <SplitRow label={t('rob.streak')} a={String(streak.losses)} />
                      <SplitRow label={t('rob.payoff')} a={fmt(payoff(seen))} />
                    </tbody>
                  </table>
                  <p className="fine">{t('rob.mcHint')}</p>
                </>
              ) : (
                <div className="notice">{t('rob.mc.few', { n: MIN_TRADES_MC })}</div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

function Stat({ label, value, sub, tone }: {
  label: string
  value: string
  sub?: string
  tone?: 'up' | 'down'
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ?? ''}`}>{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

function SplitRow({ label, a, b, hide, hidden, toneA, toneB }: {
  label: string
  a: string
  b?: string
  hide?: boolean
  hidden?: string
  toneA?: boolean
  toneB?: boolean
}) {
  const cls = (tone?: boolean) => (tone === undefined ? '' : tone ? 'up' : 'down')
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className={cls(toneA)}>{a}</td>
      {b !== undefined && (hide ? <td className="muted">{hidden}</td> : <td className={cls(toneB)}>{b}</td>)}
    </tr>
  )
}

const CHART_W = 300
const CHART_H = 56
const POINTS = 150

// Balance of the strategy against simply holding the asset, over the same candles.
function EquityChart({ trades, closes, initial, shown, labels }: {
  trades: Trade[]
  closes: Candle[]
  initial: number
  shown: number // candles in sight; the rest is held back
  labels: [string, string]
}) {
  const { strategy, hold, lo, hi } = useMemo(() => {
    const bars = closes.length
    const eq = downsample(equityCurve(trades, bars, initial).slice(0, shown), POINTS)
    const bh = downsample(buyHoldCurve(closes, initial).slice(0, shown), POINTS)
    let min = initial
    let max = initial
    for (const v of [...eq, ...bh]) {
      if (v < min) min = v
      if (v > max) max = v
    }
    return { strategy: eq, hold: bh, lo: min, hi: max }
  }, [trades, closes, initial, shown])

  if (strategy.length < 2) return null
  const span = hi - lo || 1
  const share = closes.length ? shown / closes.length : 1
  const path = (series: number[]) =>
    series
      .map((v, i) => {
        const x = (i / (series.length - 1)) * CHART_W * share
        const y = CHART_H - 2 - ((v - lo) / span) * (CHART_H - 4)
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  const base = CHART_H - 2 - ((initial - lo) / span) * (CHART_H - 4)

  return (
    <div className="equity">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" role="img" aria-label={labels[0]}>
        {share < 1 && <rect className="held" x={CHART_W * share} y={0} width={CHART_W * (1 - share)} height={CHART_H} />}
        <line className="base" x1={0} x2={CHART_W} y1={base} y2={base} />
        <path className="hold" d={path(hold)} />
        <path className="strategy" d={path(strategy)} />
      </svg>
      <div className="legend">
        <span className="legend-item"><i className="swatch" style={{ background: 'var(--lime)' }} /> {labels[0]}</span>
        <span className="legend-item"><i className="swatch" style={{ background: 'var(--ink-3)' }} /> {labels[1]}</span>
      </div>
    </div>
  )
}
