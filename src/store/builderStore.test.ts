import { describe, it, expect, beforeEach } from 'vitest'
import { useBuilder } from './builderStore'
import { example } from './examples'
import { generatePine } from '../codegen/generator'
import { generateCandles } from '../data/sampleData'
import { SAMPLE_MARKET } from '../data/market'

const gen = () => {
  const s = useBuilder.getState()
  return generatePine(s.nodes, s.edges, s.title, s.settings)
}

describe('builder store', () => {
  beforeEach(() => {
    useBuilder.setState({
      nodes: [], edges: [], runResult: null, isRunning: false,
      market: SAMPLE_MARKET, candles: generateCandles(300, 42), dataState: 'sample',
    })
  })

  it('runs the strategy on the loaded candles', async () => {
    useBuilder.getState().applyState({ ...example('ema'), market: SAMPLE_MARKET })
    await useBuilder.getState().run(gen())
    const { runResult, isRunning, runFor, candles } = useBuilder.getState()
    expect(isRunning).toBe(false)
    expect(runResult?.ok).toBe(true)
    expect(runResult?.isStrategy).toBe(true)
    expect(runFor).toBe(candles)
  })

  // The run is triggered by a change in the script. Loading the strategy that
  // is already on the canvas changes nothing, so its results must stay.
  it('loading the same strategy again keeps its results', async () => {
    useBuilder.getState().applyState({ ...example('ema'), market: SAMPLE_MARKET })
    await useBuilder.getState().run(gen())
    useBuilder.getState().applyState({ ...example('ema'), market: SAMPLE_MARKET })
    expect(useBuilder.getState().runResult?.ok).toBe(true)
  })

  it('an empty canvas has no results', async () => {
    useBuilder.getState().applyState({ ...example('ema'), market: SAMPLE_MARKET })
    await useBuilder.getState().run(gen())
    useBuilder.getState().clear()
    await useBuilder.getState().run(gen())
    expect(useBuilder.getState().runResult).toBeNull()
  })

  it('a slow run never overwrites the result of a newer one', async () => {
    useBuilder.getState().applyState({ ...example('ema'), market: SAMPLE_MARKET })
    const first = useBuilder.getState().run(gen())
    useBuilder.getState().applyState({ ...example('breakout'), market: SAMPLE_MARKET })
    const second = useBuilder.getState().run(gen())
    await Promise.all([first, second])
    // The EMA example draws 'EMA 9'; the breakout draws 'High 20'.
    expect(useBuilder.getState().runResult?.plots.map((p) => p.title)).toEqual(['High 20', 'Low 20'])
  })

  it('a new wire replaces the old one and bad wires are refused', () => {
    useBuilder.getState().applyState({ ...example('ema'), market: SAMPLE_MARKET })
    const before = useBuilder.getState().edges.length
    // n3 (slow EMA) into input A of the first condition, which n2 was feeding.
    useBuilder.getState().onConnect({ source: 'n3', target: 'n4', sourceHandle: null, targetHandle: 'a' })
    const edges = useBuilder.getState().edges
    expect(edges).toHaveLength(before)
    expect(edges.find((e) => e.target === 'n4' && e.targetHandle === 'a')?.source).toBe('n3')
    // A number cannot fire an order.
    useBuilder.getState().onConnect({ source: 'n2', target: 'n6', sourceHandle: null, targetHandle: null })
    expect(useBuilder.getState().edges.find((e) => e.target === 'n6')?.source).toBe('n4')
  })

  it('removing a block removes its wires', () => {
    useBuilder.getState().applyState({ ...example('ema'), market: SAMPLE_MARKET })
    useBuilder.getState().removeNode('n2')
    const { nodes, edges } = useBuilder.getState()
    expect(nodes.some((n) => n.id === 'n2')).toBe(false)
    expect(edges.some((e) => e.source === 'n2' || e.target === 'n2')).toBe(false)
  })

  it('new blocks get an id nobody else has', () => {
    useBuilder.getState().applyState({ ...example('ema'), market: SAMPLE_MARKET })
    useBuilder.getState().removeNode('n3')
    useBuilder.getState().addBlock('rsi', 'indicator', { x: 0, y: 0 })
    useBuilder.getState().addBlock('plot', 'plot', { x: 0, y: 0 })
    const ids = useBuilder.getState().nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
