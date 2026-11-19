import type {
  BlockType, IndicatorKind, SourceKind, PlotStyle, ConditionKind, ActionKind,
} from '../types'

// Texts shown to the user live in src/locales/*.json; this file keeps what the
// generator needs plus technical names that are the same in every language.

export const SOURCES: { key: SourceKind; label: string; pine: string; price: boolean }[] = [
  { key: 'close',  label: 'Close',  pine: 'close',  price: true },
  { key: 'open',   label: 'Open',   pine: 'open',   price: true },
  { key: 'high',   label: 'High',   pine: 'high',   price: true },
  { key: 'low',    label: 'Low',    pine: 'low',    price: true },
  { key: 'hl2',    label: 'HL2',    pine: 'hl2',    price: true },
  { key: 'hlc3',   label: 'HLC3',   pine: 'hlc3',   price: true },
  { key: 'ohlc4',  label: 'OHLC4',  pine: 'ohlc4',  price: true },
  { key: 'volume', label: 'Volume', pine: 'volume', price: false },
]

export interface IndicatorDef {
  label: string
  defaultLength: number
  defaultSource: SourceKind
  // false = the Pine function takes no source. TradingView rejects
  // ta.atr(source, length), so the generator must not pass one.
  usesSource: boolean
  usesLength: boolean
  // 'input': moves on the same scale as what feeds it (a moving average of
  // price is a price). 'own': has its own scale (RSI, ATR...).
  scale: 'input' | 'own'
  build: (src: string, len: number) => string
}

const fn = (name: string) => (src: string, len: number) => `${name}(${src}, ${len})`
const macdLine = (src: string) => `ta.ema(${src}, 12) - ta.ema(${src}, 26)`

const onPrice = { defaultSource: 'close' as SourceKind, usesSource: true, usesLength: true, scale: 'input' as const }
const ownScale = { defaultSource: 'close' as SourceKind, usesSource: true, usesLength: true, scale: 'own' as const }

export const INDICATORS: Record<IndicatorKind, IndicatorDef> = {
  sma:  { label: 'SMA',  defaultLength: 20, ...onPrice, build: fn('ta.sma') },
  ema:  { label: 'EMA',  defaultLength: 20, ...onPrice, build: fn('ta.ema') },
  wma:  { label: 'WMA',  defaultLength: 20, ...onPrice, build: fn('ta.wma') },
  rma:  { label: 'RMA (Wilder)', defaultLength: 14, ...onPrice, build: fn('ta.rma') },
  vwma: { label: 'VWMA', defaultLength: 20, ...onPrice, build: fn('ta.vwma') },
  bb_upper: {
    label: 'Bollinger upper', defaultLength: 20, ...onPrice,
    build: (s, n) => `ta.sma(${s}, ${n}) + 2 * ta.stdev(${s}, ${n})`,
  },
  bb_lower: {
    label: 'Bollinger lower', defaultLength: 20, ...onPrice,
    build: (s, n) => `ta.sma(${s}, ${n}) - 2 * ta.stdev(${s}, ${n})`,
  },
  // Highest/lowest of the bars BEFORE the current one, so "close crosses above
  // the highest high" can actually happen.
  highest: {
    label: 'Highest (previous bars)', defaultLength: 20, ...onPrice, defaultSource: 'high',
    build: (s, n) => `ta.highest(${s}, ${n})[1]`,
  },
  lowest: {
    label: 'Lowest (previous bars)', defaultLength: 20, ...onPrice, defaultSource: 'low',
    build: (s, n) => `ta.lowest(${s}, ${n})[1]`,
  },

  rsi:   { label: 'RSI', defaultLength: 14, ...ownScale, build: fn('ta.rsi') },
  stoch: {
    label: 'Stochastic %K', defaultLength: 14, ...ownScale, usesSource: false,
    build: (_s, n) => `ta.stoch(close, high, low, ${n})`,
  },
  cci: { label: 'CCI', defaultLength: 20, ...ownScale, build: fn('ta.cci') },
  mom: { label: 'Momentum', defaultLength: 10, ...ownScale, build: fn('ta.mom') },
  roc: { label: 'ROC', defaultLength: 9, ...ownScale, build: fn('ta.roc') },

  macd: {
    label: 'MACD line (12, 26)', defaultLength: 12, ...ownScale, usesLength: false,
    build: (s) => macdLine(s),
  },
  macd_signal: {
    label: 'MACD signal (9)', defaultLength: 9, ...ownScale, usesLength: false,
    build: (s) => `ta.ema(${macdLine(s)}, 9)`,
  },
  macd_hist: {
    label: 'MACD histogram', defaultLength: 9, ...ownScale, usesLength: false,
    build: (s) => `(${macdLine(s)}) - ta.ema(${macdLine(s)}, 9)`,
  },

  atr:   { label: 'ATR', defaultLength: 14, ...ownScale, usesSource: false, build: (_s, n) => `ta.atr(${n})` },
  stdev: { label: 'Std dev', defaultLength: 20, ...ownScale, build: fn('ta.stdev') },
}

export const PLOT_COLORS: { key: string; pine: string }[] = [
  { key: '#2563eb', pine: 'color.blue' },
  { key: '#dc2626', pine: 'color.red' },
  { key: '#16a34a', pine: 'color.green' },
  { key: '#f59e0b', pine: 'color.orange' },
  { key: '#8b5cf6', pine: 'color.purple' },
  { key: '#0891b2', pine: 'color.teal' },
  { key: '#eab308', pine: 'color.yellow' },
  { key: '#ec4899', pine: 'color.fuchsia' },
]

export const PLOT_STYLES: { key: PlotStyle; pine: string }[] = [
  { key: 'line',      pine: 'plot.style_line' },
  { key: 'histogram', pine: 'plot.style_histogram' },
  { key: 'circles',   pine: 'plot.style_circles' },
  { key: 'columns',   pine: 'plot.style_columns' },
]

// cross/compare take two numbers; logic takes two conditions.
export const CONDITIONS: Record<
  ConditionKind,
  { kind: 'cross' | 'compare' | 'logic'; pine: string; symbol: string }
> = {
  crossover:  { kind: 'cross',   pine: 'ta.crossover',  symbol: 'A crosses above B' },
  crossunder: { kind: 'cross',   pine: 'ta.crossunder', symbol: 'A crosses below B' },
  gt:         { kind: 'compare', pine: '>',  symbol: 'A > B' },
  lt:         { kind: 'compare', pine: '<',  symbol: 'A < B' },
  gte:        { kind: 'compare', pine: '>=', symbol: 'A >= B' },
  lte:        { kind: 'compare', pine: '<=', symbol: 'A <= B' },
  and:        { kind: 'logic',   pine: 'and', symbol: 'A and B' },
  or:         { kind: 'logic',   pine: 'or',  symbol: 'A or B' },
}

export const ACTIONS: ActionKind[] = ['entry_long', 'entry_short', 'exit_long', 'exit_short']

export type PaletteGroup = 'data' | 'trend' | 'momentum' | 'volatility' | 'conditions' | 'orders' | 'chart'

export interface BlockMeta {
  key: string
  type: BlockType
  group: PaletteGroup
}

// Draggable palette. Name and description come from block.<key>.* in the locales.
export const PALETTE: BlockMeta[] = [
  { key: 'source', type: 'source', group: 'data' },
  { key: 'value',  type: 'value',  group: 'data' },

  { key: 'ema',      type: 'indicator', group: 'trend' },
  { key: 'sma',      type: 'indicator', group: 'trend' },
  { key: 'bb_upper', type: 'indicator', group: 'trend' },
  { key: 'bb_lower', type: 'indicator', group: 'trend' },
  { key: 'highest',  type: 'indicator', group: 'trend' },
  { key: 'lowest',   type: 'indicator', group: 'trend' },

  { key: 'rsi',       type: 'indicator', group: 'momentum' },
  { key: 'macd_hist', type: 'indicator', group: 'momentum' },
  { key: 'stoch',     type: 'indicator', group: 'momentum' },
  { key: 'cci',       type: 'indicator', group: 'momentum' },

  { key: 'atr',   type: 'indicator', group: 'volatility' },
  { key: 'stdev', type: 'indicator', group: 'volatility' },

  { key: 'crossover',  type: 'condition', group: 'conditions' },
  { key: 'crossunder', type: 'condition', group: 'conditions' },
  { key: 'gt',         type: 'condition', group: 'conditions' },
  { key: 'lt',         type: 'condition', group: 'conditions' },
  { key: 'and',        type: 'condition', group: 'conditions' },
  { key: 'or',         type: 'condition', group: 'conditions' },

  { key: 'entry_long',  type: 'action', group: 'orders' },
  { key: 'entry_short', type: 'action', group: 'orders' },
  { key: 'exit_long',   type: 'action', group: 'orders' },
  { key: 'exit_short',  type: 'action', group: 'orders' },

  { key: 'plot', type: 'plot', group: 'chart' },
]

export const PALETTE_GROUPS: PaletteGroup[] = [
  'data', 'trend', 'momentum', 'volatility', 'conditions', 'orders', 'chart',
]

export const TYPE_COLORS: Record<BlockType, string> = {
  source: '#8a8f87',
  value: '#8a8f87',
  indicator: '#60a5fa',
  condition: '#22d3ee',
  action: '#c4ff34',
  plot: '#c084fc',
}

// What each kind of block gives to the next one, and what it accepts.
export type ValueType = 'num' | 'bool'
