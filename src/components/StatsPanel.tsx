import { useBuilder } from '../store/builderStore'

// Formatea un número con separador de miles y decimales
function fmt(n: number, dec = 2): string {
  if (!Number.isFinite(n)) return '∞'
  return n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

// Panel de estadísticas de backtest (solo visible si la estrategia generó trades)
export function StatsPanel() {
  const runResult = useBuilder((s) => s.runResult)
  const stats = runResult?.stats

  if (!runResult?.ok || !runResult.isStrategy || !stats) return null

  const profitPositive = stats.netProfit >= 0

  return (
    <section className="stats-panel">
      <div className="panel-head">
        <h3>Backtest</h3>
        <span className="pill">{stats.totalTrades} ops</span>
      </div>

      <div className="stats-grid">
        <Stat label="Net Profit" value={fmt(stats.netProfit)} tone={profitPositive ? 'up' : 'down'} />
        <Stat label="Profit Factor" value={fmt(stats.profitFactor)} tone={stats.profitFactor >= 1 ? 'up' : 'down'} />
        <Stat label="Win Rate" value={`${fmt(stats.winRate, 1)}%`} tone={stats.winRate >= 50 ? 'up' : 'down'} />
        <Stat label="Max Drawdown" value={`${fmt(stats.maxDrawdownPct, 1)}%`} tone="down" />
        <Stat label="Avg Trade" value={fmt(stats.avgTrade)} tone={stats.avgTrade >= 0 ? 'up' : 'down'} />
        <Stat label="Sharpe" value={fmt(stats.sharpe)} />
        <Stat label="CAGR" value={`${fmt(stats.cagr, 1)}%`} />
        <Stat label="Abiertas" value={String(stats.openTrades)} />
      </div>

      <div className="winloss">
        <span className="wl win">✓ {stats.winTrades} ganadas</span>
        <span className="wl loss">✗ {stats.lossTrades} perdidas</span>
      </div>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ?? ''}`}>{value}</span>
    </div>
  )
}