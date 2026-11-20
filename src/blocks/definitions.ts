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

// A setting of a block other than its length: a multiplier, a signal length...
export interface ParamDef {
  key: string
  def: number
  min: number
  max: number
  step: number // a whole step means the value must be a whole number
}

// 'input': moves on the same scale as what feeds it (a moving average of price
// is a price). 'price': always on the candle scale. 'own': has its own scale.
export type OutputScale = 'input' | 'own' | 'price'

export interface OutputDef {
  key: string // '' for blocks with a single output
  scale: OutputScale
}

export interface BuildArgs {
  v: string   // the variable this block declares (several outputs: v + '_' + key)
  src: string // Pine expression of what feeds it
  len: number
  p: Record<string, number>
  tf: string  // Pine timeframe, only for higher-timeframe blocks
}

export type IndicatorGroup = 'trend' | 'channels' | 'momentum' | 'volatility' | 'volume' | 'htf'

export interface IndicatorDef {
  label: string
  group: IndicatorGroup
  defaultLength: number
  defaultSource: SourceKind
  // false = the Pine function takes no source. TradingView rejects
  // ta.atr(source, length), so the generator must not pass one.
  usesSource: boolean
  usesLength: boolean
  params: ParamDef[]
  usesTf: boolean
  outputs: OutputDef[]
  legacy: boolean // still opens from old saves, no longer offered
  build: (a: BuildArgs) => string[] // the Pine lines that declare its variables
  // Candles of its own timeframe the block needs: "first" before it gives a
  // value at all, "settle" before where the data starts stops weighing on it.
  warmup?: Warmup
}

export type Warmup = (len: number) => { first: number; settle: number }

interface Opts {
  len?: number             // omitted = the block has no length
  src?: SourceKind | null  // null = the block takes no source
  scale?: OutputScale
  params?: ParamDef[]
  tf?: boolean
  legacy?: boolean
  warmup?: Warmup
}

const P = (key: string, def: number, min: number, max: number, step = 1): ParamDef => ({ key, def, min, max, step })

function def(
  label: string,
  group: IndicatorGroup,
  o: Opts,
  outputs: OutputDef[],
  build: (a: BuildArgs) => string[],
): IndicatorDef {
  return {
    label,
    group,
    defaultLength: o.len ?? 14,
    defaultSource: o.src ?? 'close',
    usesSource: o.src !== null,
    usesLength: o.len !== undefined,
    params: o.params ?? [],
    usesTf: o.tf ?? false,
    outputs,
    legacy: o.legacy ?? false,
    build,
    warmup: o.warmup,
  }
}

// A block with one output: "v = <expression>".
const one = (label: string, group: IndicatorGroup, o: Opts, expr: (a: BuildArgs) => string): IndicatorDef =>
  def(label, group, o, [{ key: '', scale: o.scale ?? 'own' }], (a) => [`${a.v} = ${expr(a)}`])

const outs = (scale: OutputScale, ...keys: string[]): OutputDef[] => keys.map((key) => ({ key, scale }))
const fn = (name: string) => (a: BuildArgs) => `${name}(${a.src}, ${a.len})`
const macdLine = (src: string) => `ta.ema(${src}, 12) - ta.ema(${src}, 26)`

// Higher-timeframe blocks are written by hand instead of with request.security:
// the value only changes when a candle of that timeframe has closed, so the
// backtest here, TradingView's history and the live chart all see the same
// thing and nothing repaints.
const newBar = (tf: string) => `timeframe.change("${tf}")`
// Candles of its timeframe, counted in lengths, until the value an average
// starts from weighs under 2% of it: 3 for an EMA, 5 for the slower RSI.
const EMA_SETTLE = 3
const RSI_SETTLE = 5
// Said in the script too: TradingView loads its own amount of history, and on a
// chart with less than this the value is not yet the one of that timeframe.
const needsHistory = (candles: number) =>
  `// Worked out from the candles on the chart: it settles after about ${candles} candles of its timeframe`
// The first candle of that timeframe in the data may be cut short by where the
// data starts, so nothing is given until a whole one has gone by.
const htfRunning = (pick: 'high' | 'low') => (a: BuildArgs) => [
  `var float ${a.v} = na`,
  `var float ${a.v}_run = na`,
  `var int ${a.v}_n = 0`,
  `if ${newBar(a.tf)}`,
  '    if bar_index > 0',
  `        ${a.v}_n := ${a.v}_n + 1`,
  `    if ${a.v}_n >= 2`,
  `        ${a.v} := ${a.v}_run`,
  `    ${a.v}_run := ${pick}`,
  'else',
  `    ${a.v}_run := na(${a.v}_run) ? ${pick} : math.${pick === 'high' ? 'max' : 'min'}(${a.v}_run, ${pick})`,
]

export const INDICATORS: Record<IndicatorKind, IndicatorDef> = {
  // ---- Moving averages ----
  sma:  one('SMA',  'trend', { len: 20, scale: 'input' }, fn('ta.sma')),
  ema:  one('EMA',  'trend', { len: 20, scale: 'input' }, fn('ta.ema')),
  wma:  one('WMA',  'trend', { len: 20, scale: 'input' }, fn('ta.wma')),
  rma:  one('RMA (Wilder)', 'trend', { len: 14, scale: 'input' }, fn('ta.rma')),
  vwma: one('VWMA', 'trend', { len: 20, scale: 'input' }, fn('ta.vwma')),
  hma:  one('HMA (Hull)', 'trend', { len: 20, scale: 'input' }, fn('ta.hma')),
  dema: one('DEMA', 'trend', { len: 20, scale: 'input' },
    ({ src, len }) => `2 * ta.ema(${src}, ${len}) - ta.ema(ta.ema(${src}, ${len}), ${len})`),
  tema: one('TEMA', 'trend', { len: 20, scale: 'input' },
    ({ src, len }) =>
      `3 * ta.ema(${src}, ${len}) - 3 * ta.ema(ta.ema(${src}, ${len}), ${len}) + ` +
      `ta.ema(ta.ema(ta.ema(${src}, ${len}), ${len}), ${len})`),
  alma: one('ALMA', 'trend',
    { len: 9, scale: 'input', params: [P('offset', 0.85, 0, 1, 0.05), P('sigma', 6, 1, 20)] },
    ({ src, len, p }) => `ta.alma(${src}, ${len}, ${p.offset}, ${p.sigma})`),
  linreg: one('Linear regression', 'trend', { len: 20, scale: 'input' },
    ({ src, len }) => `ta.linreg(${src}, ${len}, 0)`),
  vwap: one('VWAP', 'trend', { src: 'hlc3', scale: 'input' }, ({ src }) => `ta.vwap(${src})`),

  // ---- Channels and levels ----
  bb: def('Bollinger bands', 'channels',
    { len: 20, params: [P('mult', 2, 0.1, 10, 0.1)] }, outs('input', 'basis', 'upper', 'lower'),
    ({ v, src, len, p }) => [`[${v}_basis, ${v}_upper, ${v}_lower] = ta.bb(${src}, ${len}, ${p.mult})`]),
  keltner: def('Keltner channel', 'channels',
    { len: 20, params: [P('mult', 1.5, 0.1, 10, 0.1)] }, outs('input', 'basis', 'upper', 'lower'),
    ({ v, src, len, p }) => [`[${v}_basis, ${v}_upper, ${v}_lower] = ta.kc(${src}, ${len}, ${p.mult})`]),
  // Built on the bars BEFORE the current one, like the two blocks below: a
  // close can never cross a high that already includes it.
  donchian: def('Donchian channel (previous bars)', 'channels',
    { len: 20, src: null }, outs('price', 'upper', 'lower', 'basis'),
    ({ v, len }) => [
      `${v}_upper = ta.highest(high, ${len})[1]`,
      `${v}_lower = ta.lowest(low, ${len})[1]`,
      `${v}_basis = (${v}_upper + ${v}_lower) / 2`,
    ]),
  supertrend: def('Supertrend', 'channels',
    { len: 10, src: null, params: [P('factor', 3, 0.5, 20, 0.1)] },
    [{ key: 'line', scale: 'price' }, { key: 'trend', scale: 'own' }],
    ({ v, len, p }) => [
      `[${v}_line, ${v}_dir] = ta.supertrend(${p.factor}, ${len})`,
      `${v}_trend = ${v}_dir < 0 ? 1 : -1`, // 1 = up, -1 = down
    ]),
  sar: one('Parabolic SAR', 'channels',
    { src: null, scale: 'price', params: [P('start', 0.02, 0.001, 1, 0.01), P('inc', 0.02, 0.001, 1, 0.01), P('max', 0.2, 0.01, 5, 0.01)] },
    ({ p }) => `ta.sar(${p.start}, ${p.inc}, ${p.max})`),
  // The two spans are the cloud as it is drawn under the current candle, that
  // is, the value worked out "shift" bars ago.
  ichimoku: def('Ichimoku', 'channels',
    { src: null, params: [P('conversion', 9, 1, 200), P('base', 26, 1, 200), P('spanB', 52, 1, 400), P('shift', 26, 1, 200)] },
    outs('price', 'tenkan', 'kijun', 'spanA', 'spanB'),
    ({ v, p }) => [
      `${v}_tenkan = (ta.highest(high, ${p.conversion}) + ta.lowest(low, ${p.conversion})) / 2`,
      `${v}_kijun = (ta.highest(high, ${p.base}) + ta.lowest(low, ${p.base})) / 2`,
      `${v}_leadA = (${v}_tenkan + ${v}_kijun) / 2`,
      `${v}_leadB = (ta.highest(high, ${p.spanB}) + ta.lowest(low, ${p.spanB})) / 2`,
      `${v}_spanA = ${v}_leadA[${p.shift - 1}]`,
      `${v}_spanB = ${v}_leadB[${p.shift - 1}]`,
    ]),
  highest: one('Highest (previous bars)', 'channels', { len: 20, src: 'high', scale: 'input' },
    ({ src, len }) => `ta.highest(${src}, ${len})[1]`),
  lowest: one('Lowest (previous bars)', 'channels', { len: 20, src: 'low', scale: 'input' },
    ({ src, len }) => `ta.lowest(${src}, ${len})[1]`),
  prev: one('Value N bars ago', 'channels', { len: 1, scale: 'input' }, ({ src, len }) => `${src}[${len}]`),

  // ---- Momentum ----
  rsi: one('RSI', 'momentum', { len: 14 }, fn('ta.rsi')),
  stochastic: def('Stochastic', 'momentum',
    { len: 14, src: null, params: [P('smoothK', 3, 1, 50), P('smoothD', 3, 1, 50)] }, outs('own', 'k', 'd'),
    ({ v, len, p }) => [
      `${v}_k = ta.sma(ta.stoch(close, high, low, ${len}), ${p.smoothK})`,
      `${v}_d = ta.sma(${v}_k, ${p.smoothD})`,
    ]),
  stochrsi: def('Stochastic RSI', 'momentum',
    { len: 14, params: [P('stoch', 14, 1, 200), P('smoothK', 3, 1, 50), P('smoothD', 3, 1, 50)] }, outs('own', 'k', 'd'),
    ({ v, src, len, p }) => [
      `${v}_rsi = ta.rsi(${src}, ${len})`,
      `${v}_k = ta.sma(ta.stoch(${v}_rsi, ${v}_rsi, ${v}_rsi, ${p.stoch}), ${p.smoothK})`,
      `${v}_d = ta.sma(${v}_k, ${p.smoothD})`,
    ]),
  macd_full: def('MACD', 'momentum',
    { params: [P('fast', 12, 1, 200), P('slow', 26, 2, 400), P('signal', 9, 1, 100)] }, outs('own', 'macd', 'signal', 'hist'),
    ({ v, src, p }) => [`[${v}_macd, ${v}_signal, ${v}_hist] = ta.macd(${src}, ${p.fast}, ${p.slow}, ${p.signal})`]),
  cci: one('CCI', 'momentum', { len: 20 }, fn('ta.cci')),
  mom: one('Momentum', 'momentum', { len: 10 }, fn('ta.mom')),
  roc: one('ROC', 'momentum', { len: 9 }, fn('ta.roc')),
  wpr: one('Williams %R', 'momentum', { len: 14, src: null }, ({ len }) => `ta.wpr(${len})`),
  mfi: one('MFI', 'momentum', { len: 14, src: 'hlc3' }, fn('ta.mfi')),
  cmo: one('CMO', 'momentum', { len: 9 }, fn('ta.cmo')),
  tsi: one('TSI', 'momentum', { params: [P('short', 13, 1, 100), P('long', 25, 1, 200)] },
    ({ src, p }) => `ta.tsi(${src}, ${p.short}, ${p.long})`),
  ao: one('Awesome oscillator', 'momentum', { src: null, params: [P('fast', 5, 1, 100), P('slow', 34, 2, 400)] },
    ({ p }) => `ta.sma(hl2, ${p.fast}) - ta.sma(hl2, ${p.slow})`),
  adx: def('ADX / DMI', 'momentum',
    { len: 14, src: null, params: [P('smoothing', 14, 1, 100)] }, outs('own', 'adx', 'plus', 'minus'),
    ({ v, len, p }) => [`[${v}_plus, ${v}_minus, ${v}_adx] = ta.dmi(${len}, ${p.smoothing})`]),
  change: one('Change over N bars', 'momentum', { len: 1 }, fn('ta.change')),
  percentrank: one('Percent rank', 'momentum', { len: 100 }, fn('ta.percentrank')),

  // ---- Volatility ----
  atr: one('ATR', 'volatility', { len: 14, src: null }, ({ len }) => `ta.atr(${len})`),
  atr_pct: one('ATR %', 'volatility', { len: 14, src: null }, ({ len }) => `ta.atr(${len}) / close * 100`),
  tr: one('True range', 'volatility', { src: null }, () => 'ta.tr(true)'),
  stdev: one('Std dev', 'volatility', { len: 20 }, fn('ta.stdev')),
  bb_width: one('Bollinger width %', 'volatility', { len: 20, params: [P('mult', 2, 0.1, 10, 0.1)] },
    ({ src, len, p }) => `2 * ${p.mult} * ta.stdev(${src}, ${len}) / ta.sma(${src}, ${len}) * 100`),
  zscore: one('Z-score', 'volatility', { len: 20 },
    ({ src, len }) => `(${src} - ta.sma(${src}, ${len})) / ta.stdev(${src}, ${len})`),

  // ---- Volume ----
  obv: one('OBV', 'volume', { src: null }, () => 'ta.obv'),
  accdist: one('Accumulation / distribution', 'volume', { src: null }, () => 'ta.accdist'),
  cmf: def('Chaikin money flow', 'volume', { len: 20, src: null }, outs('own', ''),
    ({ v, len }) => [
      `${v}_mfv = high == low ? 0.0 : (2 * close - low - high) / (high - low) * volume`,
      `${v} = math.sum(${v}_mfv, ${len}) / math.sum(volume, ${len})`,
    ]),

  // ---- Higher timeframe: the last candle of that timeframe that has closed ----
  htf_close: def('Higher TF close', 'htf', { src: null, tf: true }, outs('price', ''),
    ({ v, tf }) => [
      `var float ${v} = na`,
      `if ${newBar(tf)} and not na(close[1])`,
      `    ${v} := close[1]`,
    ]),
  htf_high: def('Higher TF high', 'htf', { src: null, tf: true }, outs('price', ''), htfRunning('high')),
  htf_low: def('Higher TF low', 'htf', { src: null, tf: true }, outs('price', ''), htfRunning('low')),
  // The EMA and the RSI start the way TradingView's own do: no value until
  // they have their length in candles of that timeframe, then the plain
  // average of those, then the usual smoothing. Started any other way they
  // would trade the first stretch of the data on a number that means nothing.
  htf_ema: def('Higher TF EMA', 'htf',
    { len: 50, src: null, tf: true, warmup: (len) => ({ first: len, settle: len * EMA_SETTLE }) }, outs('price', ''),
    ({ v, len, tf }) => [
      needsHistory(len * EMA_SETTLE),
      `var float ${v} = na`,
      `var float ${v}_sum = 0.0`,
      `var int ${v}_n = 0`,
      `if ${newBar(tf)} and not na(close[1])`,
      `    ${v}_n := ${v}_n + 1`,
      `    if ${v}_n <= ${len}`,
      `        ${v}_sum := ${v}_sum + close[1]`,
      `    ${v} := ${v}_n < ${len} ? na : ${v}_n == ${len} ? ${v}_sum / ${len} : ${v} + (close[1] - ${v}) * 2.0 / ${len + 1}`,
    ]),
  htf_rsi: def('Higher TF RSI', 'htf',
    { len: 14, src: null, tf: true, warmup: (len) => ({ first: len + 1, settle: len * RSI_SETTLE }) }, outs('own', ''),
    ({ v, len, tf }) => [
      needsHistory(len * RSI_SETTLE),
      `var float ${v} = na`,
      `var float ${v}_prev = na`,
      `var float ${v}_up = 0.0`,
      `var float ${v}_dn = 0.0`,
      `var int ${v}_n = 0`,
      `if ${newBar(tf)} and not na(close[1])`,
      `    if not na(${v}_prev)`,
      `        ${v}_chg = close[1] - ${v}_prev`,
      `        ${v}_n := ${v}_n + 1`,
      `        if ${v}_n <= ${len}`,
      `            ${v}_up := ${v}_up + math.max(${v}_chg, 0) / ${len}`,
      `            ${v}_dn := ${v}_dn + math.max(-${v}_chg, 0) / ${len}`,
      '        else',
      `            ${v}_up := (${v}_up * ${len - 1} + math.max(${v}_chg, 0)) / ${len}`,
      `            ${v}_dn := (${v}_dn * ${len - 1} + math.max(-${v}_chg, 0)) / ${len}`,
      `        if ${v}_n >= ${len}`,
      `            ${v} := ${v}_dn == 0 ? 100.0 : 100 - 100 / (1 + ${v}_up / ${v}_dn)`,
      `    ${v}_prev := close[1]`,
    ]),

  // ---- Kept so strategies saved with the first version still open ----
  bb_upper: one('Bollinger upper', 'channels', { len: 20, scale: 'input', legacy: true },
    ({ src, len }) => `ta.sma(${src}, ${len}) + 2 * ta.stdev(${src}, ${len})`),
  bb_lower: one('Bollinger lower', 'channels', { len: 20, scale: 'input', legacy: true },
    ({ src, len }) => `ta.sma(${src}, ${len}) - 2 * ta.stdev(${src}, ${len})`),
  stoch: one('Stochastic %K (raw)', 'momentum', { len: 14, src: null, legacy: true },
    ({ len }) => `ta.stoch(close, high, low, ${len})`),
  macd: one('MACD line (12, 26)', 'momentum', { legacy: true }, ({ src }) => macdLine(src)),
  macd_signal: one('MACD signal (9)', 'momentum', { legacy: true }, ({ src }) => `ta.ema(${macdLine(src)}, 9)`),
  macd_hist: one('MACD histogram (12, 26, 9)', 'momentum', { legacy: true },
    ({ src }) => `(${macdLine(src)}) - ta.ema(${macdLine(src)}, 9)`),
}

export const INDICATOR_GROUPS: IndicatorGroup[] = ['trend', 'channels', 'momentum', 'volatility', 'volume', 'htf']

const round6 = (n: number) => Number(n.toFixed(6))

// The settings of a block as the generator will write them: inside their
// limits, and whole where Pine wants a whole number.
export function paramValues(d: IndicatorDef, raw: unknown): Record<string, number> {
  const given = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const out: Record<string, number> = {}
  for (const p of d.params) {
    const n = Number(given[p.key])
    let v = Number.isFinite(n) ? n : p.def
    if (Number.isInteger(p.step)) v = Math.round(v)
    out[p.key] = round6(Math.min(p.max, Math.max(p.min, v)))
  }
  return out
}

// Timeframes a higher-timeframe block can read, as Pine names them.
export const HTF_TIMEFRAMES = ['15', '60', '240', 'D', 'W'] as const
export const DEFAULT_HTF = '240'
export const isHtf = (v: unknown): v is string => (HTF_TIMEFRAMES as readonly unknown[]).includes(v)

// Time zones offered for the time filters (IANA names, as TradingView takes them).
export const TIMEZONES = [
  'UTC', 'Europe/London', 'Europe/Madrid', 'America/New_York', 'America/Chicago',
  'Asia/Tokyo', 'Asia/Hong_Kong', 'Australia/Sydney',
] as const
export const isTimezone = (v: unknown): v is string => (TIMEZONES as readonly unknown[]).includes(v)

// Pine numbers the days from Sunday = 1 to Saturday = 7. Shown Monday first.
export const WEEKDAYS = ['2', '3', '4', '5', '6', '7', '1'] as const

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

// What a condition takes in: 'cross' and 'compare' two numbers, 'trend' one
// number, 'logic' two conditions, 'not' one condition, the time filters nothing.
export type ConditionFamily = 'cross' | 'compare' | 'trend' | 'logic' | 'not' | 'session' | 'weekdays'

export const CONDITIONS: Record<ConditionKind, { kind: ConditionFamily; pine: string }> = {
  crossover:  { kind: 'cross',   pine: 'ta.crossover' },
  crossunder: { kind: 'cross',   pine: 'ta.crossunder' },
  cross:      { kind: 'cross',   pine: 'ta.cross' },
  gt:         { kind: 'compare', pine: '>' },
  lt:         { kind: 'compare', pine: '<' },
  gte:        { kind: 'compare', pine: '>=' },
  lte:        { kind: 'compare', pine: '<=' },
  rising:     { kind: 'trend',   pine: 'ta.rising' },
  falling:    { kind: 'trend',   pine: 'ta.falling' },
  and:        { kind: 'logic',   pine: 'and' },
  or:         { kind: 'logic',   pine: 'or' },
  not:        { kind: 'not',     pine: 'not' },
  session:    { kind: 'session', pine: '' },
  weekdays:   { kind: 'weekdays', pine: '' },
}

// Conditions that can be swapped for one another inside a block without
// touching its wires: they take the same inputs.
export function swappable(kind: ConditionKind): ConditionKind[] {
  const family = CONDITIONS[kind].kind
  const same = (f: ConditionFamily) =>
    family === 'cross' || family === 'compare' ? f === 'cross' || f === 'compare' : f === family
  return (Object.keys(CONDITIONS) as ConditionKind[]).filter((k) => same(CONDITIONS[k].kind))
}

// The inputs of a condition: what they take and which handles exist.
export function conditionInputs(kind: ConditionKind): { type: 'num' | 'bool'; handles: ('a' | 'b')[] } | null {
  switch (CONDITIONS[kind]?.kind) {
    case 'cross':
    case 'compare':
      return { type: 'num', handles: ['a', 'b'] }
    case 'trend':
      return { type: 'num', handles: ['a'] }
    case 'logic':
      return { type: 'bool', handles: ['a', 'b'] }
    case 'not':
      return { type: 'bool', handles: ['a'] }
    default:
      return null
  }
}

export const ACTIONS: ActionKind[] = ['entry_long', 'entry_short', 'exit_long', 'exit_short']

export type PaletteGroup =
  | 'data' | 'trend' | 'channels' | 'momentum' | 'volatility' | 'volume' | 'htf'
  | 'conditions' | 'time' | 'orders' | 'chart'

export interface BlockMeta {
  key: string
  type: BlockType
  group: PaletteGroup
}

const indicatorBlocks: BlockMeta[] = INDICATOR_GROUPS.flatMap((group) =>
  (Object.keys(INDICATORS) as IndicatorKind[])
    .filter((k) => INDICATORS[k].group === group && !INDICATORS[k].legacy)
    .map((key) => ({ key, type: 'indicator' as const, group })),
)

// Draggable palette. Name and description come from block.<key>.* in the locales.
export const PALETTE: BlockMeta[] = [
  { key: 'source', type: 'source', group: 'data' },
  { key: 'value',  type: 'value',  group: 'data' },

  ...indicatorBlocks,

  { key: 'crossover',  type: 'condition', group: 'conditions' },
  { key: 'crossunder', type: 'condition', group: 'conditions' },
  { key: 'gt',         type: 'condition', group: 'conditions' },
  { key: 'lt',         type: 'condition', group: 'conditions' },
  { key: 'rising',     type: 'condition', group: 'conditions' },
  { key: 'falling',    type: 'condition', group: 'conditions' },
  { key: 'and',        type: 'condition', group: 'conditions' },
  { key: 'or',         type: 'condition', group: 'conditions' },
  { key: 'not',        type: 'condition', group: 'conditions' },

  { key: 'session',  type: 'condition', group: 'time' },
  { key: 'weekdays', type: 'condition', group: 'time' },

  { key: 'entry_long',  type: 'action', group: 'orders' },
  { key: 'entry_short', type: 'action', group: 'orders' },
  { key: 'exit_long',   type: 'action', group: 'orders' },
  { key: 'exit_short',  type: 'action', group: 'orders' },

  { key: 'plot', type: 'plot', group: 'chart' },
]

export const PALETTE_GROUPS: PaletteGroup[] = [
  'data', 'trend', 'channels', 'momentum', 'volatility', 'volume', 'htf',
  'conditions', 'time', 'orders', 'chart',
]

export const TYPE_COLORS: Record<BlockType, string> = {
  source: '#8a8f87',
  value: '#8a8f87',
  indicator: '#60a5fa',
  condition: '#22d3ee',
  action: '#c4ff34',
  plot: '#c084fc',
}

// Colour of a condition block: comparisons, the logic that joins them, time filters.
export function conditionColor(kind: ConditionKind): string {
  const family = CONDITIONS[kind]?.kind
  if (family === 'logic' || family === 'not') return '#2dd4bf'
  if (family === 'session' || family === 'weekdays') return '#fbbf24'
  return TYPE_COLORS.condition
}

// What each kind of block gives to the next one, and what it accepts.
export type ValueType = 'num' | 'bool'
