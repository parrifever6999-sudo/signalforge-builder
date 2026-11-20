import { describe, it, expect } from 'vitest'
import { generatePine } from './generator'
import { runPine } from '../engine/pineRunner'
import { generateCandles } from '../data/sampleData'
import { node, edge, settings, emaCrossGraph, rsiGraph, undeclared, ind, plot, hourlyCandles } from './testkit'
import { INDICATORS, PALETTE } from '../blocks/definitions'
import type { IndicatorKind } from '../types'

describe('generatePine: shared blocks', () => {
  it('one price block feeding two indicators never leaves an undeclared variable', () => {
    const { nodes, edges } = emaCrossGraph()
    const { code, error } = generatePine(nodes, edges, 'EMA cross')
    expect(error).toBeUndefined()
    expect(code).not.toContain('v_n1')
    expect(code).toContain('ta.ema(close, 9)')
    expect(code).toContain('ta.ema(close, 21)')
    expect(undeclared(code)).toEqual([])
  })

  it('one condition feeding two actions is referenced by its own name', () => {
    const nodes = [
      node('n1', { kind: 'indicator', indicator: 'ema', length: 9, source: 'close' }),
      node('n2', { kind: 'indicator', indicator: 'ema', length: 21, source: 'close' }),
      node('n3', { kind: 'condition', condition: 'crossover', sourceA: 'close', sourceB: 'close' }),
      node('n4', { kind: 'action', action: 'entry_long' }),
      node('n5', { kind: 'action', action: 'exit_short' }),
    ]
    const edges = [
      edge('n1', 'n3', 'a'), edge('n2', 'n3', 'b'),
      edge('n3', 'n4'), edge('n3', 'n5'),
    ]
    const { code } = generatePine(nodes, edges, 'Shared condition')
    expect(code).not.toContain('v_n3')
    expect(undeclared(code)).toEqual([])
    expect(code.match(/c_n3 = /g)).toHaveLength(1)
  })
})

describe('generatePine: indicator signatures', () => {
  it('ATR takes only a length (TradingView rejects ta.atr(source, length))', () => {
    const nodes = [
      node('n1', { kind: 'indicator', indicator: 'atr', length: 14, source: 'close' }),
      node('n2', { kind: 'plot', title: 'ATR', color: '#2563eb', style: 'line' }),
    ]
    const { code } = generatePine(nodes, [edge('n1', 'n2')], 'ATR')
    expect(code).toContain('ta.atr(14)')
    expect(code).not.toMatch(/ta\.atr\([^)]*,/)
  })
})

describe('generatePine: SignalForge alerts', () => {
  it('entries carry action, symbol, lot and strategy; closes carry no lot', () => {
    const { nodes, edges } = emaCrossGraph()
    const { code } = generatePine(nodes, edges, 'EMA Cross 9/21')
    expect(code).toContain(
      `alert_message='{"action":"buy","symbol":"' + syminfo.ticker + '","lot":"' + str.tostring(lotSize) + '","strategy":"ema_cross_9_21"}'`,
    )
    expect(code).toContain(
      `strategy.close("Long", alert_message='{"action":"closebuy","symbol":"' + syminfo.ticker + '","strategy":"ema_cross_9_21"}')`,
    )
    expect(code).toContain('lotSize = input.float(0.1, "Lot size (MT5)", minval=0.01, step=0.01)')
  })

  it('a fixed symbol replaces syminfo.ticker and loses anything that could break the JSON', () => {
    const { nodes, edges } = emaCrossGraph()
    const { code } = generatePine(nodes, edges, 'X', settings({
      lot: 0.5, symbol: ` XAU"USD'.m `, stopKind: 'none', targetKind: 'none',
    }))
    expect(code).toContain('"symbol":"XAUUSD.m"')
    expect(code).not.toContain('syminfo.ticker')
    expect(code).toContain('input.float(0.5,')
  })

  it('entries only fire when flat and exits only when in that position', () => {
    const { nodes, edges } = emaCrossGraph()
    const { code } = generatePine(nodes, edges, 'X')
    expect(code).toContain('if c_n4 and strategy.position_size == 0')
    expect(code).toContain('if c_n5 and strategy.position_size > 0')
    expect(code).not.toContain('if true')
  })
})

describe('generatePine: stop and target', () => {
  it('ATR stop with a reward/risk target', () => {
    const { nodes, edges } = emaCrossGraph()
    const { code } = generatePine(nodes, edges, 'X', settings())
    expect(code).toContain('sfAtr = ta.atr(14)')
    expect(code).toContain('sfStopDist := sfAtr * 1.5')
    expect(code).toContain('sfTakeDist := sfStopDist * 2')
    expect(code).toContain(
      'strategy.exit("XL", from_entry="Long", stop=strategy.position_avg_price - sfStopDist, limit=strategy.position_avg_price + sfTakeDist, alert_message=',
    )
    expect(code).not.toContain('"XS"') // no short entry in this graph
  })

  it('percent stop and percent target, mirrored for shorts', () => {
    const nodes = [
      node('n1', { kind: 'indicator', indicator: 'ema', length: 9, source: 'close' }),
      node('n2', { kind: 'indicator', indicator: 'ema', length: 21, source: 'close' }),
      node('n3', { kind: 'condition', condition: 'crossunder', sourceA: 'close', sourceB: 'close' }),
      node('n4', { kind: 'action', action: 'entry_short' }),
    ]
    const edges = [edge('n1', 'n3', 'a'), edge('n2', 'n3', 'b'), edge('n3', 'n4')]
    const { code } = generatePine(nodes, edges, 'X', settings({
      stopKind: 'percent', stopValue: 1, targetKind: 'percent', targetValue: 3,
    }))
    expect(code).toContain('sfStopDist := close * 1 / 100')
    expect(code).toContain('sfTakeDist := close * 3 / 100')
    expect(code).not.toContain('sfAtr')
    expect(code).toContain(
      `strategy.exit("XS", from_entry="Short", stop=strategy.position_avg_price + sfStopDist, limit=strategy.position_avg_price - sfTakeDist, alert_message='{"action":"closesell"`,
    )
  })

  it('no stop and no target leaves no protective exit', () => {
    const { nodes, edges } = emaCrossGraph()
    const { code } = generatePine(nodes, edges, 'X', settings({ stopKind: 'none', targetKind: 'none' }))
    expect(code).not.toContain('strategy.exit')
    expect(code).not.toContain('sfStopDist')
  })

  it('a reward/risk target without a stop is dropped with a warning', () => {
    const { nodes, edges } = emaCrossGraph()
    const { code, warnings } = generatePine(nodes, edges, 'X', settings({ stopKind: 'none' }))
    expect(code).not.toContain('strategy.exit')
    expect(warnings.map((w) => w.key)).toContain('warn.rrNeedsStop')
  })

  it('zero or negative distances fall back to a positive default', () => {
    const { nodes, edges } = emaCrossGraph()
    const { code } = generatePine(nodes, edges, 'X', settings({ stopValue: 0, targetValue: -3 }))
    expect(code).toContain('sfStopDist := sfAtr * 1.5')
    expect(code).toContain('sfTakeDist := sfStopDist * 3')
  })
})

describe('generatePine: number and logic blocks', () => {
  it('a number block is written as a literal', () => {
    const { nodes, edges } = rsiGraph()
    const { code } = generatePine(nodes, edges, 'RSI dip')
    expect(code).toContain('c_lt = v_r < 30')
    expect(code).toContain('c_gt = close > v_f')
  })

  it('AND joins two conditions', () => {
    const { nodes, edges } = rsiGraph()
    const { code, warnings } = generatePine(nodes, edges, 'RSI dip')
    expect(code).toContain('c_and = c_lt and c_gt')
    expect(code).toContain('if c_and and strategy.position_size == 0')
    expect(warnings).toEqual([])
    expect(undeclared(code)).toEqual([])
  })

  it('AND with a single condition is skipped with a warning, never emitted half-built', () => {
    const { nodes, edges } = rsiGraph()
    const { code, warnings, isStrategy, error } = generatePine(
      nodes, edges.filter((e) => e.source !== 'gt'), 'RSI dip',
    )
    expect(code).not.toContain('c_and')
    expect(isStrategy).toBe(false)
    expect(error?.key).toBe('error.empty')
    expect(warnings.map((w) => w.key)).toEqual(
      expect.arrayContaining(['warn.logicNeedsTwo', 'warn.actionNeedsCondition']),
    )
  })

  it('edges drawn b-first still land on the right side', () => {
    const { nodes, edges } = rsiGraph()
    const { code } = generatePine(nodes, [...edges].reverse(), 'RSI dip')
    expect(code).toContain('c_lt = v_r < 30')
    expect(code).toContain('c_gt = close > v_f')
  })

  it('a condition wired into a number input is ignored with a warning', () => {
    const { nodes, edges } = rsiGraph()
    const { code, warnings } = generatePine(nodes, [...edges, edge('lt', 'f')], 'RSI dip')
    expect(code).toContain('v_f = ta.ema(close, 50)')
    expect(warnings.map((w) => w.key)).toContain('warn.needsNumber')
  })
})

describe('generatePine: broken graphs', () => {
  it('an action with nothing wired is skipped, never "if true"', () => {
    const nodes = [
      node('n1', { kind: 'action', action: 'entry_long' }),
      node('n2', { kind: 'plot', title: 'Close', color: '#2563eb', style: 'line' }),
    ]
    const { code, warnings, isStrategy } = generatePine(nodes, [], 'X')
    expect(isStrategy).toBe(false)
    expect(code).toContain('indicator("X", overlay=true)')
    expect(code).not.toContain('if true')
    expect(warnings.map((w) => w.key)).toContain('warn.actionNeedsCondition')
  })

  it('a loop is reported instead of recursing forever', () => {
    const nodes = [
      node('a', { kind: 'indicator', indicator: 'ema', length: 9, source: 'close' }),
      node('b', { kind: 'indicator', indicator: 'ema', length: 21, source: 'close' }),
      node('p', { kind: 'plot', title: 'P', color: '#2563eb', style: 'line' }),
    ]
    const { code, error } = generatePine(nodes, [edge('a', 'b'), edge('b', 'a'), edge('b', 'p')], 'X')
    expect(error?.key).toBe('error.loop')
    expect(code).toBe('')
  })

  it('an empty canvas says so', () => {
    expect(generatePine([], [], 'X').error?.key).toBe('error.empty')
  })

  it('a title with quotes or line breaks cannot break the script header', () => {
    const { nodes, edges } = emaCrossGraph()
    const { code } = generatePine(nodes, edges, 'My "best"\nidea')
    expect(code.split('\n')[1]).toMatch(/^strategy\("My \\"best\\" idea", overlay=true/)
  })

  it('two plots with the same title get distinct titles', () => {
    const nodes = [
      node('a', { kind: 'indicator', indicator: 'ema', length: 9, source: 'close' }),
      node('p1', { kind: 'plot', title: 'EMA', color: '#2563eb', style: 'line' }),
      node('p2', { kind: 'plot', title: 'EMA', color: '#dc2626', style: 'line' }),
    ]
    const { plotMeta } = generatePine(nodes, [edge('a', 'p1'), edge('a', 'p2')], 'X')
    expect(plotMeta.map((p) => p.title)).toEqual(['EMA', 'EMA 2'])
  })
})

describe('generatePine: which pane a plot belongs to', () => {
  const plot = (id: string, title: string) => node(id, { kind: 'plot', title, color: '#2563eb', style: 'line' })

  it('only price-scale plots: the script overlays the chart', () => {
    const nodes = [
      node('e', { kind: 'indicator', indicator: 'ema', length: 20, source: 'close' }),
      node('b', { kind: 'indicator', indicator: 'bb_upper', length: 20, source: 'close' }),
      plot('p1', 'EMA'), plot('p2', 'Band'),
    ]
    const { code, plotMeta } = generatePine(nodes, [edge('e', 'p1'), edge('b', 'p2')], 'X')
    expect(code).toContain('indicator("X", overlay=true)')
    expect(code).not.toContain('force_overlay')
    expect(plotMeta.map((p) => p.pane)).toEqual(['price', 'price'])
  })

  it('an oscillator sends the script to its own pane', () => {
    const nodes = [node('r', { kind: 'indicator', indicator: 'rsi', length: 14, source: 'close' }), plot('p', 'RSI')]
    const { code, plotMeta } = generatePine(nodes, [edge('r', 'p')], 'X')
    expect(code).toContain('indicator("X", overlay=false)')
    expect(plotMeta[0].pane).toBe('sub')
  })

  it('mixed scales: own pane, with the price plots pinned to the chart', () => {
    const nodes = [
      node('e', { kind: 'indicator', indicator: 'ema', length: 20, source: 'close' }),
      node('r', { kind: 'indicator', indicator: 'rsi', length: 14, source: 'close' }),
      plot('p1', 'EMA'), plot('p2', 'RSI'),
    ]
    const { code, plotMeta } = generatePine(nodes, [edge('e', 'p1'), edge('r', 'p2')], 'X')
    expect(code).toContain('overlay=false')
    expect(code).toContain('plot(v_e, "EMA", color=color.blue, style=plot.style_line, force_overlay=true)')
    expect(code).toContain('plot(v_r, "RSI", color=color.blue, style=plot.style_line)')
    expect(plotMeta.map((p) => p.pane)).toEqual(['price', 'sub'])
  })

  it('a moving average of an oscillator stays off the price scale', () => {
    const nodes = [
      node('r', { kind: 'indicator', indicator: 'rsi', length: 14, source: 'close' }),
      node('m', { kind: 'indicator', indicator: 'sma', length: 5, source: 'close' }),
      plot('p', 'RSI smooth'),
    ]
    const { code, plotMeta } = generatePine(nodes, [edge('r', 'm'), edge('m', 'p')], 'X')
    expect(code).toContain('v_m = ta.sma(v_r, 5)')
    expect(plotMeta[0].pane).toBe('sub')
  })

  it('volume and its averages are off the price scale too', () => {
    const nodes = [
      node('v', { kind: 'source', source: 'volume' }),
      node('m', { kind: 'indicator', indicator: 'sma', length: 20, source: 'close' }),
      plot('p', 'Vol avg'),
    ]
    expect(generatePine(nodes, [edge('v', 'm'), edge('m', 'p')], 'X').plotMeta[0].pane).toBe('sub')
  })
})

describe('every indicator block', () => {
  const kinds = Object.keys(INDICATORS) as IndicatorKind[]

  // Every output of every block, with the settings a new block starts with.
  const outputs = kinds.flatMap((kind) => INDICATORS[kind].outputs.map((o) => [kind, o.key || '(single)', o.key] as const))

  it.each(outputs)('%s %s produces values in the engine', async (kind, _name, out) => {
    const nodes = [ind('i', kind), plot('p')]
    const { code, plotMeta, error, warnings } = generatePine(nodes, [edge('i', 'p', null, out || null)], kind)
    expect(error).toBeUndefined()
    expect(warnings).toEqual([])
    expect(undeclared(code)).toEqual([])
    // The slowest to start is the 4-hour EMA 50: 200 hourly candles before its first value.
    const result = await runPine(code, hourlyCandles(1000), plotMeta, { timeframe: '60' })
    expect(result.error).toBeUndefined()
    const values = result.plots[0].data.filter((v) => Number.isFinite(v))
    expect(values.length).toBeGreaterThan(750)
    // A series stuck on one value would mean the block is not wired to the data.
    expect(new Set(values).size).toBeGreaterThan(1)
  })

  it('the palette offers every block that is not kept only for old saves', () => {
    const offered = PALETTE.filter((b) => b.type === 'indicator').map((b) => b.key).sort()
    expect(offered).toEqual(kinds.filter((k) => !INDICATORS[k].legacy).sort())
    expect(offered.length).toBeGreaterThanOrEqual(49)
  })

  it('blocks without a source never receive one', () => {
    for (const kind of kinds.filter((k) => !INDICATORS[k].usesSource)) {
      const nodes = [
        node('s', { kind: 'source', source: 'open' }),
        node('i', { kind: 'indicator', indicator: kind, length: 14, source: 'open' }),
        node('p', { kind: 'plot', title: 'P', color: '#2563eb', style: 'line' }),
      ]
      const { code } = generatePine(nodes, [edge('s', 'i'), edge('i', 'p')], kind)
      expect(code).not.toContain('open')
    }
  })

  it('the breakout blocks look at the bars before the current one', () => {
    const nodes = [
      node('h', { kind: 'indicator', indicator: 'highest', length: 20, source: 'high' }),
      node('c', { kind: 'condition', condition: 'crossover', sourceA: 'close', sourceB: 'close' }),
      node('go', { kind: 'action', action: 'entry_long' }),
    ]
    const { code } = generatePine(nodes, [edge('h', 'c', 'b'), edge('c', 'go')], 'Breakout')
    expect(code).toContain('v_h = ta.highest(high, 20)[1]')
    expect(code).toContain('c_c = ta.crossover(close, v_h)')
  })
})

describe('generated scripts run in the engine', () => {
  it('the example strategy runs and produces trades', async () => {
    const { nodes, edges } = emaCrossGraph()
    const { code, plotMeta } = generatePine(nodes, edges, 'EMA cross')
    const result = await runPine(code, generateCandles(300, 42), plotMeta)
    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.plots[0].data.filter((v) => Number.isFinite(v)).length).toBeGreaterThan(200)
    expect(result.stats?.totalTrades ?? 0).toBeGreaterThan(0)
  })

  it('long and short entries with only a stop and a target still close their trades', async () => {
    const nodes = [
      node('n2', { kind: 'indicator', indicator: 'ema', length: 9, source: 'close' }),
      node('n3', { kind: 'indicator', indicator: 'ema', length: 21, source: 'close' }),
      node('n4', { kind: 'condition', condition: 'crossover', sourceA: 'close', sourceB: 'close' }),
      node('n5', { kind: 'condition', condition: 'crossunder', sourceA: 'close', sourceB: 'close' }),
      node('n6', { kind: 'action', action: 'entry_long' }),
      node('n7', { kind: 'action', action: 'entry_short' }),
    ]
    const edges = [
      edge('n2', 'n4', 'a'), edge('n3', 'n4', 'b'),
      edge('n2', 'n5', 'a'), edge('n3', 'n5', 'b'),
      edge('n4', 'n6'), edge('n5', 'n7'),
    ]
    const { code, error } = generatePine(nodes, edges, 'Both sides')
    expect(error).toBeUndefined()
    const result = await runPine(code, generateCandles(300, 42), [])
    expect(result.error).toBeUndefined()
    // Nothing in this graph closes a trade except the protective exit.
    expect(result.stats?.totalTrades ?? 0).toBeGreaterThan(0)
    expect(result.markers.some((m) => m.side === 'sell')).toBe(true)
  })

  it('a condition can be plotted and OR-ed', async () => {
    const nodes = [
      node('r', { kind: 'indicator', indicator: 'rsi', length: 14, source: 'close' }),
      node('v', { kind: 'value', value: 45 }),
      node('lt', { kind: 'condition', condition: 'lt', sourceA: 'close', sourceB: 'close' }),
      node('f', { kind: 'indicator', indicator: 'ema', length: 50, source: 'close' }),
      node('gt', { kind: 'condition', condition: 'gt', sourceA: 'close', sourceB: 'close' }),
      node('or', { kind: 'condition', condition: 'or', sourceA: 'close', sourceB: 'close' }),
      node('go', { kind: 'action', action: 'entry_long' }),
      node('pl', { kind: 'plot', title: 'Signal', color: '#16a34a', style: 'columns' }),
    ]
    const edges = [
      edge('r', 'lt', 'a'), edge('v', 'lt', 'b'),
      edge('f', 'gt', 'b'),
      edge('lt', 'or', 'a'), edge('gt', 'or', 'b'),
      edge('or', 'go'), edge('or', 'pl'),
    ]
    const { code, plotMeta } = generatePine(nodes, edges, 'RSI dip')
    expect(code).toContain('plot((c_or ? 1 : 0), "Signal"')
    const result = await runPine(code, generateCandles(300, 42), plotMeta)
    expect(result.error).toBeUndefined()
    expect(result.plots[0].data.filter((v) => v === 1).length).toBeGreaterThan(0)
  })
})
