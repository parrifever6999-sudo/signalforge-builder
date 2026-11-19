import { describe, it, expect } from 'vitest'
import { canConnect, connectEdge, edgeId, outputKeys, pruneEdges } from './connect'
import { node, edge, ind, cond, act, plot, hourlyCandles, undeclared } from '../codegen/testkit'
import { example, EXAMPLES } from './examples'
import { generatePine } from '../codegen/generator'
import { runPine } from '../engine/pineRunner'
import { generateCandles } from '../data/sampleData'
import { sanitizeState, decodeShare, encodeShare } from './graphIO'

const nodes = [
  node('price', { kind: 'source', source: 'close' }),
  node('num', { kind: 'value', value: 30 }),
  node('ema', { kind: 'indicator', indicator: 'ema', length: 9, source: 'close' }),
  node('atr', { kind: 'indicator', indicator: 'atr', length: 14, source: 'close' }),
  node('cross', { kind: 'condition', condition: 'crossover', sourceA: 'close', sourceB: 'close' }),
  node('and', { kind: 'condition', condition: 'and', sourceA: 'close', sourceB: 'close' }),
  node('buy', { kind: 'action', action: 'entry_long' }),
  node('plot', { kind: 'plot', title: 'P', color: '#2563eb', style: 'line' }),
]
const link = (source: string, target: string, targetHandle: string | null = null) => ({ source, target, targetHandle })

describe('canConnect', () => {
  it('numbers go into indicators and comparisons', () => {
    expect(canConnect(nodes, [], link('price', 'ema'))).toBe(true)
    expect(canConnect(nodes, [], link('ema', 'cross', 'a'))).toBe(true)
    expect(canConnect(nodes, [], link('num', 'cross', 'b'))).toBe(true)
  })

  it('conditions go into orders and AND/OR, never into number inputs', () => {
    expect(canConnect(nodes, [], link('cross', 'buy'))).toBe(true)
    expect(canConnect(nodes, [], link('cross', 'and', 'a'))).toBe(true)
    expect(canConnect(nodes, [], link('cross', 'ema'))).toBe(false)
    expect(canConnect(nodes, [], link('cross', 'cross', 'a'))).toBe(false)
  })

  it('a number cannot fire an order or feed AND/OR', () => {
    expect(canConnect(nodes, [], link('ema', 'buy'))).toBe(false)
    expect(canConnect(nodes, [], link('ema', 'and', 'a'))).toBe(false)
  })

  it('a chart line takes numbers and conditions', () => {
    expect(canConnect(nodes, [], link('ema', 'plot'))).toBe(true)
    expect(canConnect(nodes, [], link('cross', 'plot'))).toBe(true)
  })

  it('blocks without an input or an output refuse the wire', () => {
    expect(canConnect(nodes, [], link('ema', 'atr'))).toBe(false) // ATR takes no source
    expect(canConnect(nodes, [], link('ema', 'price'))).toBe(false)
    expect(canConnect(nodes, [], link('buy', 'plot'))).toBe(false)
    expect(canConnect(nodes, [], link('plot', 'ema'))).toBe(false)
  })

  it('a condition needs to know which side the wire lands on', () => {
    expect(canConnect(nodes, [], link('ema', 'cross'))).toBe(false)
  })

  it('no block connects to itself or closes a loop', () => {
    const more = [...nodes, node('sma', { kind: 'indicator', indicator: 'sma', length: 5, source: 'close' })]
    expect(canConnect(more, [], link('ema', 'ema'))).toBe(false)
    expect(canConnect(more, [edge('ema', 'sma')], link('sma', 'ema'))).toBe(false)
  })

  it('unknown blocks are refused', () => {
    expect(canConnect(nodes, [], link('ghost', 'ema'))).toBe(false)
    expect(canConnect(nodes, [], { source: null, target: 'ema' })).toBe(false)
  })
})

describe('connectEdge', () => {
  it('a new wire replaces the one already in that input', () => {
    const first = connectEdge([], link('price', 'ema'))
    const second = connectEdge(first, link('num', 'ema'))
    expect(second).toHaveLength(1)
    expect(second[0].source).toBe('num')
  })

  it('the two sides of a condition are separate inputs', () => {
    const a = connectEdge([], link('ema', 'cross', 'a'))
    const both = connectEdge(a, link('num', 'cross', 'b'))
    expect(both.map((e) => e.targetHandle)).toEqual(['a', 'b'])
  })
})

describe('blocks with several outputs', () => {
  const many = [
    ind('bb', 'bb'), ind('st', 'supertrend'), ind('ema', 'ema'),
    cond('cross', 'crossover'), cond('rise', 'rising'), cond('not', 'not'),
    cond('hours', 'session'), cond('days', 'weekdays'), cond('and', 'and'),
    act('buy', 'entry_long'), plot('plot'),
  ]
  const from = (source: string, out: string | null, target: string, targetHandle: string | null = null) =>
    ({ source, target, sourceHandle: out, targetHandle })

  it('name their outputs; the others have a single unnamed one', () => {
    expect(outputKeys(many[0].data)).toEqual(['basis', 'upper', 'lower'])
    expect(outputKeys(many[1].data)).toEqual(['line', 'trend'])
    expect(outputKeys(many[2].data)).toEqual([])
    expect(outputKeys(many[3].data)).toEqual([])
  })

  it('a wire must leave from an output that exists', () => {
    expect(canConnect(many, [], from('bb', 'upper', 'cross', 'b'))).toBe(true)
    expect(canConnect(many, [], from('st', 'trend', 'plot'))).toBe(true)
    expect(canConnect(many, [], from('bb', null, 'cross', 'b'))).toBe(false)
    expect(canConnect(many, [], from('bb', 'nope', 'cross', 'b'))).toBe(false)
    expect(canConnect(many, [], from('ema', 'upper', 'cross', 'b'))).toBe(false)
  })

  it('rising and NOT take one wire; the time filters take none', () => {
    expect(canConnect(many, [], from('ema', null, 'rise', 'a'))).toBe(true)
    expect(canConnect(many, [], from('ema', null, 'rise', 'b'))).toBe(false)
    expect(canConnect(many, [], from('cross', null, 'not', 'a'))).toBe(true)
    expect(canConnect(many, [], from('ema', null, 'not', 'a'))).toBe(false)
    expect(canConnect(many, [], from('cross', null, 'hours', 'a'))).toBe(false)
    expect(canConnect(many, [], from('ema', null, 'days'))).toBe(false)
    // Their output is a condition like any other.
    expect(canConnect(many, [], from('hours', null, 'and', 'a'))).toBe(true)
    expect(canConnect(many, [], from('days', null, 'buy'))).toBe(true)
  })

  it('two outputs of one block into the two sides of a condition are two wires', () => {
    const one = connectEdge([], from('bb', 'upper', 'cross', 'a'))
    const two = connectEdge(one, from('bb', 'lower', 'cross', 'b'))
    expect(two.map((e) => e.id)).toEqual(['e-bb.upper-cross-a', 'e-bb.lower-cross-b'])
    expect(two.map((e) => e.sourceHandle)).toEqual(['upper', 'lower'])
    expect(edgeId(from('ema', null, 'plot'))).toBe('e-ema-plot-in')
  })
})

describe('pruneEdges: wires after a block changes', () => {
  const wires = [
    edge('price', 'ind'), edge('ind', 'cross', 'b', 'upper'), edge('ind', 'plot', null, 'lower'), edge('cross', 'buy'),
  ].map((e) => ({ ...e, targetHandle: e.targetHandle ?? null }))
  const graph = (indicator: string) => [
    node('price', { kind: 'source', source: 'close' }), ind('ind', indicator),
    cond('cross', 'crossover'), act('buy', 'entry_long'), plot('plot'),
  ]

  it('nothing changes while every wire still fits', () => {
    expect(pruneEdges(graph('bb'), wires)).toEqual(wires)
  })

  it('an output that is gone moves to the first output of the new block', () => {
    const out = pruneEdges(graph('macd_full'), wires)
    expect(out.map((e) => [e.source, e.sourceHandle, e.target])).toEqual([
      ['price', null, 'ind'], ['ind', 'macd', 'cross'], ['ind', 'macd', 'plot'], ['cross', null, 'buy'],
    ])
    expect(out[1].id).toBe('e-ind.macd-cross-b')
  })

  it('a block with one output loses the output names', () => {
    const out = pruneEdges(graph('ema'), wires)
    expect(out.map((e) => e.sourceHandle)).toEqual([null, null, null, null])
    for (const e of out) expect(canConnect(graph('ema'), [], e)).toBe(true)
  })

  it('a block that takes no source loses the wire that fed it', () => {
    const out = pruneEdges(graph('donchian'), wires)
    expect(out.some((e) => e.target === 'ind')).toBe(false)
    expect(out).toHaveLength(3)
  })

  it('a condition that changes shape drops what no longer has a place', () => {
    const nodes = [ind('a', 'ema'), ind('b', 'sma'), cond('c', 'rising'), act('buy', 'entry_long')]
    const before = [edge('a', 'c', 'a'), edge('b', 'c', 'b'), edge('c', 'buy')]
    expect(pruneEdges(nodes, before).map((e) => e.source)).toEqual(['a', 'c'])
    expect(pruneEdges(nodes.filter((n) => n.id !== 'a'), before).map((e) => e.source)).toEqual(['c'])
  })
})

describe('built-in examples', () => {
  it.each(EXAMPLES)('%s: valid wiring, no warnings, trades in the engine', async (key) => {
    const state = example(key)
    // Every wire of the example is one the canvas would let the user draw.
    let edges: typeof state.edges = []
    for (const e of state.edges) {
      expect(canConnect(state.nodes, edges, e), `${e.source} -> ${e.target}`).toBe(true)
      edges = connectEdge(edges, e)
    }
    expect(edges).toHaveLength(state.edges.length)
    // And it survives being saved and opened again unchanged.
    const reopened = sanitizeState(JSON.parse(JSON.stringify(state)))!
    expect(reopened.nodes).toEqual(state.nodes)
    expect(reopened.edges).toEqual(state.edges)

    const gen = generatePine(state.nodes, state.edges, state.title, state.settings)
    expect(gen.error).toBeUndefined()
    expect(gen.warnings).toEqual([])
    expect(gen.isStrategy).toBe(true)
    expect(undeclared(gen.code)).toEqual([])
    const result = await runPine(gen.code, generateCandles(600, 42), gen.plotMeta)
    expect(result.error).toBeUndefined()
    expect(result.stats?.totalTrades ?? 0).toBeGreaterThan(0)
    // The same on an hourly chart, where the 4-hour blocks and the clocks matter.
    const hourly = await runPine(gen.code, hourlyCandles(1500), gen.plotMeta, { timeframe: '60' })
    expect(hourly.error).toBeUndefined()
    expect(hourly.stats?.totalTrades ?? 0).toBeGreaterThan(0)
  })

  it.each(EXAMPLES)('%s: comes back the same from a share link', (key) => {
    const state = example(key)
    const back = decodeShare(encodeShare(state))!
    expect(back.nodes).toEqual(state.nodes)
    expect(back.edges).toEqual(state.edges)
    expect(back.settings).toEqual(state.settings)
  })

  it('the pro example uses what the newer blocks are for', () => {
    const state = example('pro')
    const { code } = generatePine(state.nodes, state.edges, state.title, state.settings)
    expect(code).toContain('ta.supertrend(3, 10)')
    expect(code).toContain('timeframe.change("240")')
    expect(code).toContain('dayofweek(time, "UTC")')
    expect(code).toContain('qty=math.min(strategy.equity * 1 / 100 / sfStopDist')
    expect(code).toContain('sfStop := math.max(nz(sfStop, high - sfTrailDist), high - sfTrailDist)')
  })
})

describe('simulated account', () => {
  it('a short trade is never cut in pieces by a simulated margin call', async () => {
    const state = example('breakout')
    const gen = generatePine(state.nodes, state.edges, state.title, state.settings)
    const result = await runPine(gen.code, generateCandles(600, 42), gen.plotMeta)
    // One position at a time: a bar holds at most one order of each side, and
    // every closed trade is exactly one entry and one exit.
    const seen = result.markers.map((m) => `${m.index}:${m.side}`)
    expect(new Set(seen).size).toBe(seen.length)
    expect(result.markers.length).toBe((result.stats?.totalTrades ?? 0) * 2 + (result.stats?.openTrades ?? 0))
    expect(gen.code).toContain('margin_long=0, margin_short=0')
  })
})
