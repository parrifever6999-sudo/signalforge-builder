import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { localeOf } from '../lang'
import type { GenResult } from '../codegen/generator'

// Under this many trades a result says little: luck weighs more than the idea.
const FEW_TRADES = 30

// What the strategy would have done on the loaded candles, plus anything the
// generator had to leave out.
export function StatsPanel({ gen }: { gen: GenResult }) {
  const t = useT()
  const lang = useBuilder((s) => s.lang)
  const runResult = useBuilder((s) => s.runResult)
  const isRunning = useBuilder((s) => s.isRunning)
  const loading = useBuilder((s) => s.dataState === 'loading')

  const locale = localeOf(lang)
  const fmt = (n: number, dec = 2) =>
    Number.isFinite(n)
      ? n.toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec })
      : '-'
  const signed = (n: number, dec = 2) => (n > 0 ? '+' : '') + fmt(n, dec)

  const stats = runResult?.ok && runResult.isStrategy ? runResult.stats : null

  return (
    <section className="stats-panel">
      <div className="panel-head">
        <h3>{t('stats.title')}</h3>
        {(isRunning || loading) && <span className="pill">{t('stats.running')}</span>}
        {stats && !isRunning && <span className="pill">{t('stats.trades', { n: stats.totalTrades })}</span>}
      </div>

      {gen.error && <div className="notice warn">{t(gen.error.key, gen.error.params)}</div>}
      {gen.warnings.map((w) => (
        <div key={w.key} className="notice warn">{t(w.key, w.params)}</div>
      ))}
      {runResult && !runResult.ok && (
        <div className="notice error">{t('stats.error', { msg: runResult.error ?? '?' })}</div>
      )}

      {runResult?.ok && !runResult.isStrategy && !gen.error && (
        <div className="notice">{t('stats.indicatorOnly')}</div>
      )}

      {stats && stats.totalTrades === 0 && <div className="notice">{t('stats.none')}</div>}

      {stats && stats.totalTrades > 0 && (
        <>
          <div className="stats-grid">
            <Stat
              label={t('stats.net')}
              value={`${signed(stats.netProfitPct, 1)}%`}
              sub={signed(stats.netProfit)}
              tone={stats.netProfit >= 0 ? 'up' : 'down'}
            />
            <Stat
              label={t('stats.pf')}
              value={stats.profitFactor === Infinity ? '-' : fmt(stats.profitFactor)}
              tone={stats.profitFactor >= 1 ? 'up' : 'down'}
            />
            <Stat
              label={t('stats.win')}
              value={`${fmt(stats.winRate, 1)}%`}
              sub={`${t('stats.wins', { n: stats.winTrades })}, ${t('stats.losses', { n: stats.lossTrades })}`}
            />
            <Stat label={t('stats.dd')} value={`-${fmt(stats.maxDrawdownPct, 1)}%`} tone="down" />
            <Stat
              label={t('stats.avg')}
              value={signed(stats.avgTrade)}
              tone={stats.avgTrade >= 0 ? 'up' : 'down'}
            />
            <Stat label={t('stats.open')} value={String(stats.openTrades)} />
          </div>
          {stats.totalTrades < FEW_TRADES && (
            <div className="notice warn">{t('stats.few', { n: stats.totalTrades })}</div>
          )}
          <p className="fine">{t('stats.assumptions')}</p>
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
