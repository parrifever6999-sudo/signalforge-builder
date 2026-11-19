import type { Node, Edge } from '@xyflow/react'

// ---- Block kinds -------------------------------------------------------
export type BlockType = 'source' | 'value' | 'indicator' | 'condition' | 'plot' | 'action'

export type SourceKind = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4' | 'volume'

export type IndicatorKind =
  | 'sma' | 'ema' | 'wma' | 'rma' | 'vwma'
  | 'bb_upper' | 'bb_lower' | 'highest' | 'lowest'
  | 'rsi' | 'stoch' | 'cci' | 'mom' | 'roc'
  | 'macd' | 'macd_signal' | 'macd_hist'
  | 'atr' | 'stdev'

// crossover..lte compare two numeric series; and/or combine two conditions.
export type ConditionKind =
  | 'crossover' | 'crossunder'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'and' | 'or'

export type ActionKind = 'entry_long' | 'entry_short' | 'exit_long' | 'exit_short'

export type PlotStyle = 'line' | 'histogram' | 'circles' | 'columns'

// ---- Node payloads -----------------------------------------------------
export interface SourceData {
  kind: 'source'
  source: SourceKind
  [key: string]: unknown
}

// A fixed number, e.g. the 70 in "RSI < 70".
export interface ValueData {
  kind: 'value'
  value: number
  [key: string]: unknown
}

export interface IndicatorData {
  kind: 'indicator'
  indicator: IndicatorKind
  length: number
  source: SourceKind // used when nothing is connected
  [key: string]: unknown
}

export interface ConditionData {
  kind: 'condition'
  condition: ConditionKind
  sourceA: SourceKind // fallbacks when a handle is not connected
  sourceB: SourceKind
  [key: string]: unknown
}

export interface PlotData {
  kind: 'plot'
  title: string
  color: string
  style: PlotStyle
  [key: string]: unknown
}

export interface ActionData {
  kind: 'action'
  action: ActionKind
  [key: string]: unknown
}

export type BlockData = SourceData | ValueData | IndicatorData | ConditionData | PlotData | ActionData

export type BuilderNode = Node<BlockData, 'block'>

export interface BuilderGraph {
  nodes: BuilderNode[]
  edges: Edge[]
}

// ---- Strategy settings (risk + what the MT5 alert carries) --------------
export type StopKind = 'none' | 'percent' | 'atr'
export type TargetKind = 'none' | 'percent' | 'atr' | 'rr'

export interface StrategySettings {
  lot: number          // lot size sent to MT5 with every entry
  symbol: string       // '' = use the chart symbol (syminfo.ticker)
  stopKind: StopKind
  stopValue: number    // percent of price, or ATR multiple
  targetKind: TargetKind
  targetValue: number  // percent of price, ATR multiple, or multiple of the stop (rr)
}

export const DEFAULT_SETTINGS: StrategySettings = {
  lot: 0.1,
  symbol: '',
  stopKind: 'atr',
  stopValue: 1.5,
  targetKind: 'rr',
  targetValue: 2,
}

// ---- Run results ---------------------------------------------------------
export interface SignalMarker {
  index: number
  side: 'buy' | 'sell'
}

export interface BacktestStats {
  initialCapital: number
  netProfit: number
  netProfitPct: number
  grossProfit: number
  grossLoss: number
  profitFactor: number // Infinity when there are no losing trades
  winRate: number      // 0-100
  totalTrades: number  // closed trades
  winTrades: number
  lossTrades: number
  openTrades: number
  maxDrawdownPct: number
  avgTrade: number
}

// 'price' plots share the candle scale; 'sub' plots (RSI, ATR, 0/1 signals...)
// get their own pane under the chart.
export type PlotPane = 'price' | 'sub'

export interface PlotMeta {
  title: string
  color: string
  style: PlotStyle
  pane: PlotPane
}

export interface PlotResult extends PlotMeta {
  data: number[] // one value per bar
}

export interface RunResult {
  ok: boolean
  plots: PlotResult[]
  markers: SignalMarker[]
  isStrategy: boolean
  stats: BacktestStats | null
  error?: string
  barCount: number
}

export interface Candle {
  open: number
  high: number
  low: number
  close: number
  volume: number
  openTime: number
  closeTime?: number
}

// A message the UI translates: key into the locale files + its parameters.
export interface Issue {
  key: string
  params?: Record<string, string | number>
}
