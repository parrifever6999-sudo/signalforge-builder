import { describe, it, expect, beforeEach } from 'vitest'
import { useBuilder } from './builderStore'
import { example } from './examples'
import { generatePine } from '../codegen/generator'
import { generateCandles } from '../data/sampleData'
import { CUSTOM_MARKET, SAMPLE_MARKET } from '../data/market'
import { canConnect } from './connect'

const gen = () => {
  const s = useBuilder.getState()
  return generatePine(s.nodes, s.edges, s.title, s.settings)
}

describe('builder store', () => {
  beforeEach(() => {
    useBuilder.setState({
      nodes: [], edges: [], runResult: null, isRunning: false,
      market: SAMPLE_MARKET, candles: generateCandles(300, 42), candlesTf: 'D', dataState: 'sample',
      custom: null, holdout: false,
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

  it('a new block starts with the settings of its kind', () => {
    const add = (key: string, type: 'indicator' | 'condition') => {
      useBuilder.getState().addBlock(key, type, { x: 0, y: 0 })
      return useBuilder.getState().nodes.at(-1)!.data
    }
    expect(add('supertrend', 'indicator')).toEqual({
      kind: 'indicator', indicator: 'supertrend', length: 10, source: 'close', params: { factor: 3 },
    })
    expect(add('htf_ema', 'indicator')).toMatchObject({ length: 50, tf: '240' })
    expect(add('session', 'condition')).toMatchObject({ from: 8, to: 17, tz: 'UTC' })
    expect(add('weekdays', 'condition')).toMatchObject({ days: '23456', tz: 'UTC' })
    expect(add('rising', 'condition')).toMatchObject({ length: 3 })
  })

  it('changing what a block is starts from its defaults and drops the wires that no longer fit', () => {
    useBuilder.getState().applyState({ ...example('pro'), market: SAMPLE_MARKET })
    // n1 is the Supertrend: its "line" output feeds two conditions and a plot.
    useBuilder.getState().updateNodeData('n1', { indicator: 'bb' })
    let { nodes, edges } = useBuilder.getState()
    expect(nodes.find((n) => n.id === 'n1')?.data).toEqual({
      kind: 'indicator', indicator: 'bb', length: 20, source: 'close', params: { mult: 2 },
    })
    const fromN1 = edges.filter((e) => e.source === 'n1')
    expect(fromN1).toHaveLength(3)
    expect(fromN1.every((e) => e.sourceHandle === 'basis')).toBe(true)
    // Whatever is left is a wire the canvas would let the user draw.
    for (const e of edges) expect(canConnect(nodes, [], e), e.id).toBe(true)
    expect(gen().error).toBeUndefined()

    // An ordinary edit (a length) touches neither the other fields nor the wires.
    useBuilder.getState().updateNodeData('n1', { length: 30 })
    expect(useBuilder.getState().edges).toBe(edges)
    expect(useBuilder.getState().nodes.find((n) => n.id === 'n1')?.data).toMatchObject({ length: 30, params: { mult: 2 } })

    // A comparison turned into another comparison keeps both wires...
    useBuilder.getState().updateNodeData('n6', { condition: 'lt' })
    expect(useBuilder.getState().edges.filter((e) => e.target === 'n6')).toHaveLength(2)
    // ...and AND turned into OR keeps both conditions.
    useBuilder.getState().updateNodeData('n7', { condition: 'or' })
    ;({ nodes, edges } = useBuilder.getState())
    expect(nodes.find((n) => n.id === 'n7')?.data).toMatchObject({ condition: 'or' })
    expect(edges.filter((e) => e.target === 'n7')).toHaveLength(2)
  })

  it('a price file replaces the candles and is run on its own timeframe', async () => {
    const hour = 3600000
    const rows = Array.from({ length: 400 }, (_, i) => {
      const price = 100 + Math.sin(i / 9) * 8 + i * 0.01
      return `${(Date.UTC(2024, 0, 2) + i * hour) / 1000},${price},${price + 1},${price - 1},${price + 0.5},10`
    })
    const error = useBuilder.getState().importCsv('XAUUSD_H1.csv', ['time,open,high,low,close,volume', ...rows].join('\n'))
    expect(error).toBeNull()
    const s = useBuilder.getState()
    expect(s.market).toBe(CUSTOM_MARKET)
    expect(s.dataState).toBe('custom')
    expect(s.candles).toHaveLength(400)
    expect(s.candlesTf).toBe('60')
    expect(s.custom?.name).toBe('XAUUSD_H1')

    useBuilder.getState().applyState({ ...example('ema'), market: undefined })
    await useBuilder.getState().run(gen())
    expect(useBuilder.getState().runResult?.ok).toBe(true)
    expect(useBuilder.getState().runResult?.barCount).toBe(400)
    // The file is not part of what gets saved or shared.
    expect(JSON.stringify(useBuilder.getState().snapshot())).not.toContain('"candles"')
  })

  it('a file that cannot be read changes nothing and says why', () => {
    const before = useBuilder.getState().candles
    expect(useBuilder.getState().importCsv('notes.txt', 'hello world')).toBe('csv.columns')
    expect(useBuilder.getState().importCsv('empty.csv', '')).toBe('csv.empty')
    expect(useBuilder.getState().candles).toBe(before)
    expect(useBuilder.getState().market).toBe(SAMPLE_MARKET)
  })

  it('the depth only takes values on offer', () => {
    useBuilder.setState({ depth: 3000 })
    useBuilder.getState().setDepth(77)
    expect(useBuilder.getState().depth).toBe(3000)
    useBuilder.setState({ depth: 5000 })
    expect(useBuilder.getState().snapshot().depth).toBe(5000)
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
