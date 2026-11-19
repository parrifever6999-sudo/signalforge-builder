import type { Node, Edge } from '@xyflow/react'

// ---- Block kinds -------------------------------------------------------
export type BlockType = 'source' | 'value' | 'indicator' | 'condition' | 'plot' | 'action'

export type SourceKind = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4' | 'volume'

export type IndicatorKind =
  // moving averages
  | 'sma' | 'ema' | 'wma' | 'rma' | 'vwma' | 'hma' | 'dema' | 'tema' | 'alma' | 'linreg' | 'vwap'
  // channels and levels
  | 'bb' | 'keltner' | 'donchian' | 'supertrend' | 'sar' | 'ichimoku' | 'highest' | 'lowest' | 'prev'
  // momentum
  | 'rsi' | 'stochastic' | 'stochrsi' | 'macd_full' | 'cci' | 'mom' | 'roc' | 'wpr' | 'mfi'
  | 'cmo' | 'tsi' | 'ao' | 'adx' | 'change' | 'percentrank'
  // volatility
  | 'atr' | 'atr_pct' | 'tr' | 'stdev' | 'bb_width' | 'zscore'
  // volume
  | 'obv' | 'accdist' | 'cmf'
  // higher timeframe
  | 'htf_close' | 'htf_high' | 'htf_low' | 'htf_ema' | 'htf_rsi'
  // kept so strategies saved with the first version still open
  | 'bb_upper' | 'bb_lower' | 'stoch' | 'macd' | 'macd_signal' | 'macd_hist'

// cross/compare take two numbers, rising/falling one number, and/or two
// conditions, not one condition; session and weekdays take nothing.
export type ConditionKind =
  | 'crossover' | 'crossunder' | 'cross'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'rising' | 'falling'
  | 'and' | 'or' | 'not'
  | 'session' | 'weekdays'

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
  params?: Record<string, number> // settings other than the length (multiplier, signal...)
  tf?: string // higher-timeframe blocks: the Pine timeframe they read
  [key: string]: unknown
}

export interface ConditionData {
  kind: 'condition'
  condition: ConditionKind
  sourceA: SourceKind // fallbacks when a handle is not connected
  sourceB: SourceKind
  length?: number // rising / falling: how many bars in a row
  from?: number   // session: first hour, 0-23
  to?: number     // session: hour it ends, 0-24, not included
  tz?: string     // session and weekdays: time zone
  days?: string   // weekdays: Pine day numbers, '23456' = Monday to Friday
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
export type TrailKind = 'none' | 'percent' | 'atr'
export type BreakevenKind = 'none' | 'percent' | 'atr' | 'rr'
export type SizeKind = 'equity' | 'risk'

export interface StrategySettings {
  lot: number          // lot size sent to MT5 with every entry
  symbol: string       // '' = use the chart symbol (syminfo.ticker)
  stopKind: StopKind
  stopValue: number    // percent of price, or ATR multiple
  targetKind: TargetKind
  targetValue: number  // percent of price, ATR multiple, or multiple of the stop (rr)
  trailKind: TrailKind
  trailValue: number   // how far the stop follows the best price: percent or ATR multiple
  beKind: BreakevenKind
  beValue: number      // gain that moves the stop to the entry price
  maxBars: number      // close the trade after this many bars; 0 = never
  sizeKind: SizeKind
  sizeValue: number    // equity: percent of the balance per trade; risk: percent lost if the stop is hit
  feePct: number       // commission per side, percent
  slipPct: number      // slippage per side, percent
}

export const DEFAULT_SETTINGS: StrategySettings = {
  lot: 0.1,
  symbol: '',
  stopKind: 'atr',
  stopValue: 1.5,
  targetKind: 'rr',
  targetValue: 2,
  trailKind: 'none',
  trailValue: 2,
  beKind: 'none',
  beValue: 1,
  maxBars: 0,
  sizeKind: 'equity',
  sizeValue: 100,
  feePct: 0.05,
  slipPct: 0.02,
}

// ---- Run results ---------------------------------------------------------
export interface SignalMarker {
  index: number
  side: 'buy' | 'sell'
}

// One closed trade, as the robustness checks need it.
export interface Trade {
  entryIndex: number
  exitIndex: number
  side: 'long' | 'short'
  profit: number    // in account currency, costs included
  returnPct: number // profit over the balance just before the trade
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
  trades: Trade[]
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
