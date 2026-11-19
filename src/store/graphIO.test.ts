import { describe, it, expect } from 'vitest'
import { sanitizeState, encodeShare, decodeShare } from './graphIO'
import { generatePine } from '../codegen/generator'
import { emaCrossGraph, settings } from '../codegen/testkit'

// A title with an accented letter, built from its code point so this file stays ASCII.
const ACCENTED = 'Cruce r' + String.fromCharCode(225) + 'pido'

describe('sanitizeState', () => {
  it('keeps a valid strategy as it is', () => {
    const { nodes, edges } = emaCrossGraph()
    const out = sanitizeState({ title: 'EMA', nodes, edges, settings: settings(), market: 'BTCUSDT', timeframe: '1h' })
    expect(out?.nodes).toHaveLength(8)
    expect(out?.edges).toHaveLength(9)
    expect(out?.market).toBe('BTCUSDT')
    expect(generatePine(out!.nodes, out!.edges, out!.title, out!.settings).code)
      .toBe(generatePine(nodes, edges, 'EMA', settings()).code)
  })

  it('drops what it does not recognise', () => {
    const out = sanitizeState({
      title: 'x',
      nodes: [
        { id: 'a', position: { x: 1, y: 2 }, data: { kind: 'indicator', indicator: 'ema', length: 9, source: 'close' } },
        { id: 'b', position: { x: 1, y: 2 }, data: { kind: 'script', code: 'alert(1)' } },
        { id: 'c', position: { x: 1, y: 2 }, data: { kind: 'indicator', indicator: '__proto__', length: 9 } },
        { id: 'bad id"', position: { x: 1, y: 2 }, data: { kind: 'source', source: 'close' } },
        { id: 'a', position: { x: 9, y: 9 }, data: { kind: 'source', source: 'close' } }, // repeated id
        { id: 'd', data: { kind: 'action', action: 'drop_tables' } },
        'nonsense',
      ],
      edges: [
        { source: 'a', target: 'a' }, // loop on itself
        { source: 'a', target: 'zzz' }, // unknown block
        { source: 'b', target: 'a' }, // dropped block
      ],
    })
    expect(out?.nodes.map((n) => n.id)).toEqual(['a'])
    expect(out?.edges).toEqual([])
  })

  it('coerces fields to safe values', () => {
    const out = sanitizeState({
      title: 'a\nb',
      nodes: [
        { id: 'i', position: { x: 'NaN', y: 1e99 }, data: { kind: 'indicator', indicator: 'rsi', length: -4, source: 'nope' } },
        { id: 'p', position: null, data: { kind: 'plot', title: 'T"\n)', color: 'red;}', style: 'boom' } },
        { id: 'v', position: {}, data: { kind: 'value', value: 'abc' } },
      ],
      edges: [{ source: 'i', target: 'p', targetHandle: 'zzz' }],
      settings: { lot: -5, symbol: 'XAU"USD', stopKind: 'weird', stopValue: 'x', targetKind: 'rr', targetValue: -3 },
      market: 'DOGE',
      timeframe: '1s',
    })!
    expect(out.title).toBe('a b')
    expect(out.nodes[0].position).toEqual({ x: 0, y: 20000 })
    expect(out.nodes[0].data).toEqual({ kind: 'indicator', indicator: 'rsi', length: 1, source: 'close' })
    expect(out.nodes[1].data).toEqual({ kind: 'plot', title: 'T" )', color: '#2563eb', style: 'line' })
    expect(out.nodes[2].data).toEqual({ kind: 'value', value: 0 })
    expect(out.edges[0].targetHandle).toBeNull()
    expect(out.settings).toEqual({
      lot: 0.01, symbol: 'XAUUSD', stopKind: 'atr', stopValue: 1.5, targetKind: 'rr', targetValue: 3,
      // what the file did not carry gets the defaults
      trailKind: 'none', trailValue: 2, beKind: 'none', beValue: 1, maxBars: 0,
      sizeKind: 'equity', sizeValue: 100, feePct: 0.05, slipPct: 0.02,
    })
    expect(out.market).toBeUndefined()
    expect(out.timeframe).toBeUndefined()
    // Whatever came in, the script that comes out is well formed.
    const { code } = generatePine(out.nodes, out.edges, out.title, out.settings)
    expect(code).toContain('plot(v_i, "T\\" )", color=color.blue')
  })

  it('keeps the newer settings inside their limits', () => {
    const { settings: st } = sanitizeState({
      nodes: [],
      settings: {
        trailKind: 'rr', trailValue: -4, beKind: 'rr', beValue: 1e9, maxBars: -12.6,
        sizeKind: 'martingale', sizeValue: 0, feePct: 80, slipPct: 'x',
      },
    })!
    expect(st).toMatchObject({
      trailKind: 'none', trailValue: 4, beKind: 'rr', beValue: 1000, maxBars: 13,
      sizeKind: 'equity', sizeValue: 0.01, feePct: 5, slipPct: 0.02,
    })
  })

  it('a block keeps only the fields it has, each inside its limits', () => {
    const data = (raw: Record<string, unknown>) =>
      sanitizeState({ nodes: [{ id: 'x', position: { x: 0, y: 0 }, data: raw }] })!.nodes[0]?.data
    expect(data({ kind: 'indicator', indicator: 'ema', length: 9, params: { mult: 3 }, tf: 'D' }))
      .toEqual({ kind: 'indicator', indicator: 'ema', length: 9, source: 'close' })
    expect(data({ kind: 'indicator', indicator: 'bb', params: { mult: 'abc', evil: 1 } }))
      .toEqual({ kind: 'indicator', indicator: 'bb', length: 20, source: 'close', params: { mult: 2 } })
    expect(data({ kind: 'indicator', indicator: 'htf_ema', tf: '1"); x' }))
      .toEqual({ kind: 'indicator', indicator: 'htf_ema', length: 50, source: 'close', tf: '240' })
    expect(data({ kind: 'indicator', indicator: 'mfi' })).toMatchObject({ source: 'hlc3' })
    expect(data({ kind: 'condition', condition: 'rising', length: 0 }))
      .toEqual({ kind: 'condition', condition: 'rising', sourceA: 'close', sourceB: 'close', length: 1 })
    expect(data({ kind: 'condition', condition: 'session', from: 99, to: -5, tz: 'Moon' }))
      .toEqual({ kind: 'condition', condition: 'session', sourceA: 'close', sourceB: 'close', from: 23, to: 1, tz: 'UTC' })
    expect(data({ kind: 'condition', condition: 'weekdays', days: '6-2-2-9-x', tz: 'Asia/Tokyo' }))
      .toEqual({ kind: 'condition', condition: 'weekdays', sourceA: 'close', sourceB: 'close', days: '26', tz: 'Asia/Tokyo' })
    expect(data({ kind: 'condition', condition: 'gt', length: 5, days: '1', tz: 'UTC' }))
      .toEqual({ kind: 'condition', condition: 'gt', sourceA: 'close', sourceB: 'close' })
    expect(data({ kind: 'condition', condition: 'toString' })).toBeUndefined()
  })

  it('a wire from a block with several outputs always names one that exists', () => {
    const out = sanitizeState({
      nodes: [
        { id: 'b', position: {}, data: { kind: 'indicator', indicator: 'bb' } },
        { id: 'e', position: {}, data: { kind: 'indicator', indicator: 'ema' } },
        { id: 'p', position: {}, data: { kind: 'plot' } },
        { id: 'q', position: {}, data: { kind: 'plot' } },
        { id: 'r', position: {}, data: { kind: 'plot' } },
      ],
      edges: [
        { source: 'b', target: 'p', sourceHandle: 'lower' },
        { source: 'b', target: 'q', sourceHandle: '__proto__' },
        { source: 'e', target: 'r', sourceHandle: 'lower' },
      ],
    })!
    expect(out.edges.map((e) => [e.id, e.sourceHandle])).toEqual([
      ['e-b.lower-p-in', 'lower'], ['e-b.basis-q-in', 'basis'], ['e-e-r-in', null],
    ])
  })

  it('remembers how many candles to load, if it is a depth on offer', () => {
    expect(sanitizeState({ nodes: [], depth: 5000 })?.depth).toBe(5000)
    expect(sanitizeState({ nodes: [], depth: 999999 })?.depth).toBeUndefined()
    expect(sanitizeState({ nodes: [], market: 'CUSTOM' })?.market).toBeUndefined()
  })

  it('refuses input that is not a strategy', () => {
    expect(sanitizeState(null)).toBeNull()
    expect(sanitizeState('x')).toBeNull()
    expect(sanitizeState({ nodes: 'x' })).toBeNull()
  })

  it('caps the size of what it accepts', () => {
    const nodes = Array.from({ length: 500 }, (_, i) => ({
      id: `n${i}`, position: { x: 0, y: 0 }, data: { kind: 'source', source: 'close' },
    }))
    expect(sanitizeState({ nodes, edges: [] })?.nodes).toHaveLength(200)
  })
})

describe('share links', () => {
  it('a strategy survives the round trip, accents included', () => {
    const { nodes, edges } = emaCrossGraph()
    const state = {
      title: ACCENTED, nodes, edges, settings: settings({ lot: 0.25 }), market: 'PAXGUSDT', timeframe: '4h',
    }
    const packed = encodeShare(state)
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/)
    const back = decodeShare(packed)!
    expect(back.title).toBe(ACCENTED)
    expect(back.settings.lot).toBe(0.25)
    expect(back.market).toBe('PAXGUSDT')
    expect(generatePine(back.nodes, back.edges, back.title, back.settings).code)
      .toBe(generatePine(nodes, edges, state.title, state.settings).code)
  })

  it('garbage in the link is ignored', () => {
    expect(decodeShare('')).toBeNull()
    expect(decodeShare('!!!not-base64!!!')).toBeNull()
    expect(decodeShare('eyJub2RlcyI6MX0')).toBeNull() // {"nodes":1}
  })
})
