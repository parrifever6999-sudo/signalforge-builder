import { PineTS } from 'pinets'
import type { Candle, PlotResult, RunResult, PlotStyle, SignalMarker, BacktestStats } from '../types'

// Metadata de un plot para reconstruir su serie
interface RawPlot {
  data: any[]
}

// Estructura de una operación (Trade) expuesta por PineTS
interface PineTrade {
  entry_bar_index: number
  exit_bar_index?: number
  size: number          // signed: >0 long, <0 short
  status: 'open' | 'closed'
  profit?: number
}

// Estado de estrategia expuesto por PineTS (solo los campos que usamos)
interface PineStrategy {
  closedtrades?: PineTrade[]
  opentrades?: PineTrade[]
  netprofit?: number
  grossprofit?: number
  grossloss?: number
  max_drawdown?: number
  max_drawdown_percent_value?: number
  sharpe_ratio?: number
  cagr?: number
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/**
 * Ejecuta un script Pine con PineTS sobre un array de velas OHLCV.
 * Devuelve las series de cada plot, los marcadores de compra/venta y
 * las estadísticas de backtest extraídas de las operaciones.
 */
export async function runPine(
  code: string,
  candles: Candle[],
  plotMeta: { title: string; color: string; style: PlotStyle }[],
): Promise<RunResult> {
  const base: Omit<RunResult, 'ok' | 'error'> = {
    plots: [],
    markers: [],
    isStrategy: false,
    stats: null,
    barCount: candles.length,
  }

  if (!code.trim()) {
    return { ok: false, ...base, error: 'No hay código que ejecutar.' }
  }

  try {
    const pine = new PineTS(candles)
    await pine.ready()

    const ctx: any = await pine.run(code)
    const plots = ctx.plots as Record<string, RawPlot> | undefined
    const strategy = ctx.strategy as PineStrategy | undefined

    // ── Extraer series de plots ──
    const results: PlotResult[] = plotMeta.map((meta) => {
      const raw = plots?.[meta.title]
      const series = raw?.data ?? []
      const data = series.map((d: any) => {
        if (typeof d === 'number') return d
        if (d && typeof d.value === 'number') return d.value
        return NaN
      })
      return { ...meta, data }
    })

    // ── Extraer marcadores de operaciones ──
    const markers: SignalMarker[] = []
    let stats: BacktestStats | null = null

    if (strategy && (strategy.closedtrades !== undefined || strategy.opentrades !== undefined)) {
      const closed = strategy.closedtrades ?? []
      const open = strategy.opentrades ?? []

      for (const t of [...closed, ...open]) {
        if (Number.isInteger(t.entry_bar_index)) {
          markers.push({ index: t.entry_bar_index, side: t.size >= 0 ? 'buy' : 'sell' })
        }
        if (t.status === 'closed' && Number.isInteger(t.exit_bar_index)) {
          const exitIdx = t.exit_bar_index as number
          markers.push({ index: exitIdx, side: t.size >= 0 ? 'sell' : 'buy' })
        }
      }
      markers.sort((a, b) => a.index - b.index)

      // ── Calcular estadísticas de backtest ──
      let wins = 0
      let losses = 0
      for (const t of closed) {
        const p = num(t.profit)
        if (p > 0) wins++
        else if (p < 0) losses++
      }
      const totalTrades = closed.length
      const grossProfit = num(strategy.grossprofit)
      const grossLoss = Math.abs(num(strategy.grossloss))
      const netProfit = num(strategy.netprofit)
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0)
      const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0

      stats = {
        netProfit,
        grossProfit,
        grossLoss,
        profitFactor,
        winRate,
        totalTrades,
        winTrades: wins,
        lossTrades: losses,
        openTrades: open.length,
        maxDrawdown: Math.abs(num(strategy.max_drawdown)),
        maxDrawdownPct: Math.abs(num(strategy.max_drawdown_percent_value)),
        avgTrade: totalTrades > 0 ? netProfit / totalTrades : 0,
        sharpe: num(strategy.sharpe_ratio),
        cagr: num(strategy.cagr),
      }
    }

    const isStrategy = !!strategy && (strategy.closedtrades !== undefined || strategy.opentrades !== undefined)

    return { ok: true, plots: results, markers, isStrategy, stats, barCount: candles.length }
  } catch (err) {
    return {
      ok: false,
      ...base,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}