import type { Candle, PlotMeta, PlotResult, RunResult, SignalMarker, BacktestStats } from '../types'

interface RawPlot {
  data: unknown[]
}

// A trade as PineTS exposes it (only the fields used here).
interface PineTrade {
  entry_bar_index: number
  exit_bar_index?: number
  size: number // signed: >0 long, <0 short
  status: 'open' | 'closed'
  profit?: number
}

interface PineStrategy {
  closedtrades?: PineTrade[]
  opentrades?: PineTrade[]
  initial_capital?: number
  netprofit?: number
  grossprofit?: number
  grossloss?: number
  max_drawdown_percent_value?: number
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

function plotValue(d: unknown): number {
  if (typeof d === 'number') return d
  if (d && typeof (d as { value?: unknown }).value === 'number') return (d as { value: number }).value
  return NaN
}

/**
 * Runs a Pine script with PineTS over OHLCV candles and returns the series
 * of each plot, the buy/sell markers and the backtest figures.
 */
export async function runPine(
  code: string,
  candles: Candle[],
  plotMeta: PlotMeta[],
): Promise<RunResult> {
  const base: Omit<RunResult, 'ok' | 'error'> = {
    plots: [],
    markers: [],
    isStrategy: false,
    stats: null,
    barCount: candles.length,
  }

  if (!code.trim()) return { ok: false, ...base, error: 'Nothing to run.' }
  if (candles.length === 0) return { ok: false, ...base, error: 'No candles loaded.' }

  try {
    // Loaded on first use: the engine is two thirds of the download and the
    // canvas does not need it to paint.
    const { PineTS } = await import('pinets')
    const pine = new PineTS(candles)
    await pine.ready()

    const ctx = (await pine.run(code)) as { plots?: Record<string, RawPlot>; strategy?: PineStrategy }
    const plots = ctx.plots
    const strategy = ctx.strategy

    const results: PlotResult[] = plotMeta.map((meta) => ({
      ...meta,
      data: (plots?.[meta.title]?.data ?? []).map(plotValue),
    }))

    const isStrategy =
      !!strategy && (strategy.closedtrades !== undefined || strategy.opentrades !== undefined)
    const markers: SignalMarker[] = []
    let stats: BacktestStats | null = null

    if (isStrategy && strategy) {
      const closed = strategy.closedtrades ?? []
      const open = strategy.opentrades ?? []

      for (const t of [...closed, ...open]) {
        if (Number.isInteger(t.entry_bar_index)) {
          markers.push({ index: t.entry_bar_index, side: t.size >= 0 ? 'buy' : 'sell' })
        }
        if (t.status === 'closed' && Number.isInteger(t.exit_bar_index)) {
          markers.push({ index: t.exit_bar_index as number, side: t.size >= 0 ? 'sell' : 'buy' })
        }
      }
      markers.sort((a, b) => a.index - b.index)

      let wins = 0
      let losses = 0
      for (const t of closed) {
        const p = num(t.profit)
        if (p > 0) wins++
        else if (p < 0) losses++
      }
      const totalTrades = closed.length
      const initialCapital = num(strategy.initial_capital, 10000)
      const grossProfit = num(strategy.grossprofit)
      const grossLoss = Math.abs(num(strategy.grossloss))
      const netProfit = num(strategy.netprofit)

      stats = {
        initialCapital,
        netProfit,
        netProfitPct: initialCapital > 0 ? (netProfit / initialCapital) * 100 : 0,
        grossProfit,
        grossLoss,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
        winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
        totalTrades,
        winTrades: wins,
        lossTrades: losses,
        openTrades: open.length,
        maxDrawdownPct: Math.abs(num(strategy.max_drawdown_percent_value)),
        avgTrade: totalTrades > 0 ? netProfit / totalTrades : 0,
      }
    }

    return { ok: true, plots: results, markers, isStrategy, stats, barCount: candles.length }
  } catch (err) {
    return { ok: false, ...base, error: err instanceof Error ? err.message : String(err) }
  }
}
