import { describe, it, expect } from 'vitest'
import { canConnect, connectEdge } from './connect'
import { node, edge } from '../codegen/testkit'
import { example, EXAMPLES } from './examples'
import { generatePine } from '../codegen/generator'
import { runPine } from '../engine/pineRunner'
import { generateCandles } from '../data/sampleData'
import { sanitizeState } from './graphIO'

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
    const result = await runPine(gen.code, generateCandles(600, 42), gen.plotMeta)
    expect(result.error).toBeUndefined()
    expect(result.stats?.totalTrades ?? 0).toBeGreaterThan(0)
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
