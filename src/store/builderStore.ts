import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { Edge, Connection, NodeChange, EdgeChange, ReactFlowInstance } from '@xyflow/react'
import type { BlockData, BlockType, BuilderNode, Candle, RunResult, StrategySettings } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { PLOT_COLORS } from '../blocks/definitions'
import type { GenResult } from '../codegen/generator'
import { runPine } from '../engine/pineRunner'
import { generateCandles } from '../data/sampleData'
import {
  fetchCandles, pineTimeframe, isDepth, isTimeframe, CUSTOM_MARKET, DEFAULT_DEPTH, SAMPLE_MARKET,
} from '../data/market'
import type { Timeframe } from '../data/market'
import { parseCsv } from '../data/csv'
import type { CsvError } from '../data/csv'
import type { Lang } from '../lang'
import { canConnect, connectEdge, pruneEdges } from './connect'
import { cleanData, cleanSettings } from './graphIO'
import type { SavedState } from './graphIO'
import { example } from './examples'
import type { ExampleKey } from './examples'

// 'live' = real candles, 'sample' = the user chose the offline series,
// 'fallback' = real candles failed and the offline series stands in,
// 'custom' = candles from a file the user loaded.
export type DataState = 'loading' | 'live' | 'sample' | 'fallback' | 'custom'

export type FlowInstance = ReactFlowInstance<BuilderNode, Edge>

// A price history the user loaded from a file. It lives in memory only.
export interface CustomData {
  name: string
  candles: Candle[]
  timeframe: string // as Pine names it
}

interface BuilderState {
  nodes: BuilderNode[]
  edges: Edge[]
  title: string
  settings: StrategySettings
  market: string
  timeframe: Timeframe
  depth: number
  lang: Lang

  candles: Candle[]
  candlesTf: string // timeframe of the loaded candles, as Pine names it
  dataState: DataState
  dataError: string | null
  custom: CustomData | null

  runResult: RunResult | null
  runFor: Candle[] | null // the candles runResult was computed on
  isRunning: boolean
  // Out-of-sample test: while on, the last part of the history is kept out of
  // sight so the strategy is not tuned to it.
  holdout: boolean

  instance: FlowInstance | null
  setInstance: (i: FlowInstance | null) => void

  onNodesChange: (changes: NodeChange<BuilderNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  updateNodeData: (id: string, patch: Record<string, unknown>) => void
  addBlock: (key: string, type: BlockType, position?: { x: number; y: number }) => void
  removeNode: (id: string) => void

  setTitle: (t: string) => void
  setSettings: (patch: Partial<StrategySettings>) => void
  setMarket: (m: string) => void
  setTimeframe: (tf: Timeframe) => void
  setDepth: (n: number) => void
  setLang: (l: Lang) => void
  setHoldout: (on: boolean) => void
  importCsv: (name: string, text: string) => CsvError | null

  loadCandles: () => Promise<void>
  run: (gen: GenResult) => Promise<void>

  loadExample: (key: ExampleKey) => void
  applyState: (state: SavedState) => void
  snapshot: () => SavedState
  clear: () => void
}

const SAMPLE_BARS = 600
const SAMPLE_TF = 'D'

// A new block with the defaults of its kind (cleanData fills them in).
function blockData(key: string, type: BlockType, plotCount: number): BlockData | null {
  switch (type) {
    case 'source':
      return { kind: 'source', source: 'close' }
    case 'value':
      return { kind: 'value', value: 50 }
    case 'indicator':
      return cleanData({ kind: 'indicator', indicator: key }) ?? cleanData({ kind: 'indicator', indicator: 'ema' })
    case 'condition':
      return cleanData({ kind: 'condition', condition: key }) ?? cleanData({ kind: 'condition', condition: 'crossover' })
    case 'action':
      return cleanData({ kind: 'action', action: key }) ?? { kind: 'action', action: 'entry_long' }
    case 'plot':
      return { kind: 'plot', title: 'Line', color: PLOT_COLORS[plotCount % PLOT_COLORS.length].key, style: 'line' }
    default:
      return null
  }
}

// Bumped on every request so a slow answer cannot overwrite a newer one.
let loadSeq = 0
let runSeq = 0

export const useBuilder = create<BuilderState>((set, get) => ({
  nodes: [],
  edges: [],
  title: 'My Strategy',
  settings: { ...DEFAULT_SETTINGS },
  market: 'BTCUSDT',
  timeframe: '1h',
  depth: DEFAULT_DEPTH,
  lang: 'en',

  candles: [],
  candlesTf: SAMPLE_TF,
  dataState: 'loading',
  dataError: null,
  custom: null,

  runResult: null,
  runFor: null,
  isRunning: false,
  holdout: false,

  instance: null,
  setInstance: (i) => set({ instance: i }),

  onNodesChange: (changes) => set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  onConnect: (connection) =>
    set((s) => (canConnect(s.nodes, s.edges, connection) ? { edges: connectEdge(s.edges, connection) } : s)),

  updateNodeData: (id, patch) =>
    set((s) => {
      // Picking another indicator or condition starts from that block's own
      // defaults, and the wires that no longer fit it are dropped.
      const swapped = 'indicator' in patch || 'condition' in patch
      const nodes = s.nodes.map((n) => {
        if (n.id !== id) return n
        const merged = { ...n.data, ...patch }
        const data = swapped
          ? cleanData('indicator' in patch ? { kind: 'indicator', indicator: patch.indicator } : merged)
          : (merged as BlockData)
        return data ? { ...n, data } : n
      })
      return swapped ? { nodes, edges: pruneEdges(nodes, s.edges) } : { nodes }
    }),

  addBlock: (key, type, position) => {
    const { nodes, instance } = get()
    const data = blockData(key, type, nodes.filter((n) => n.data.kind === 'plot').length)
    if (!data) return
    let counter = nodes.length + 1
    while (nodes.some((n) => n.id === `n${counter}`)) counter++
    // Without a drop point, land near the middle of what the user is looking at.
    const jitter = () => Math.round((Math.random() - 0.5) * 80)
    const pos = position ?? (instance
      ? instance.screenToFlowPosition({ x: window.innerWidth / 2 + jitter(), y: window.innerHeight / 3 + jitter() })
      : { x: 80 + jitter(), y: 80 + jitter() })
    set({ nodes: [...nodes, { id: `n${counter}`, type: 'block', position: pos, data }] })
  },

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
    })),

  setTitle: (t) => set({ title: t.slice(0, 80) }),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  setMarket: (m) => {
    set({ market: m })
    void get().loadCandles()
  },
  setTimeframe: (tf) => {
    set({ timeframe: tf })
    void get().loadCandles()
  },
  setDepth: (n) => {
    if (!isDepth(n)) return
    set({ depth: n })
    void get().loadCandles()
  },
  setLang: (l) => {
    if (typeof document !== 'undefined') document.documentElement.lang = l
    set({ lang: l })
  },
  setHoldout: (on) => set({ holdout: on }),

  importCsv: (name, text) => {
    const parsed = parseCsv(text)
    if (!parsed.ok) return parsed.error
    ++loadSeq // a download still on its way must not replace the file
    const custom = { name: name.replace(/\.[A-Za-z0-9]+$/, '').slice(0, 40) || 'CSV', candles: parsed.candles, timeframe: parsed.timeframe }
    set({
      custom, market: CUSTOM_MARKET, candles: custom.candles, candlesTf: custom.timeframe,
      dataState: 'custom', dataError: null,
    })
    return null
  },

  loadCandles: async () => {
    const { market, timeframe, depth, custom } = get()
    const seq = ++loadSeq
    if (market === CUSTOM_MARKET && custom) {
      set({ candles: custom.candles, candlesTf: custom.timeframe, dataState: 'custom', dataError: null })
      return
    }
    if (market === SAMPLE_MARKET) {
      set({ candles: generateCandles(SAMPLE_BARS, 42), candlesTf: SAMPLE_TF, dataState: 'sample', dataError: null })
      return
    }
    set({ dataState: 'loading', dataError: null })
    try {
      const candles = await fetchCandles(market, timeframe, depth)
      if (seq !== loadSeq) return
      set({ candles, candlesTf: pineTimeframe(timeframe), dataState: 'live', dataError: null })
    } catch (err) {
      if (seq !== loadSeq) return
      set({
        candles: generateCandles(SAMPLE_BARS, 42),
        candlesTf: SAMPLE_TF,
        dataState: 'fallback',
        dataError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  run: async (gen) => {
    const seq = ++runSeq
    const { candles, candlesTf, market } = get()
    if (gen.error || !gen.code || candles.length === 0) {
      set({ runResult: null, runFor: null, isRunning: false })
      return
    }
    set({ isRunning: true })
    const result = await runPine(gen.code, candles, gen.plotMeta, { timeframe: candlesTf, ticker: market })
    if (seq !== runSeq) return
    set({ isRunning: false, runResult: { ...result, isStrategy: gen.isStrategy }, runFor: candles })
  },

  loadExample: (key) => get().applyState(example(key)),

  applyState: (state) => {
    const { market, timeframe, depth, instance } = get()
    const nextMarket = state.market ?? market
    const nextTimeframe = isTimeframe(state.timeframe) ? state.timeframe : timeframe
    const nextDepth = isDepth(state.depth) ? state.depth : depth
    set({
      nodes: state.nodes,
      edges: state.edges,
      title: state.title,
      settings: cleanSettings(state.settings),
      market: nextMarket,
      timeframe: nextTimeframe,
      depth: nextDepth,
    })
    // runResult is left alone on purpose: the run is triggered by a change in
    // the generated script, and loading the strategy already on the canvas
    // changes nothing, so wiping the result here would leave the panels empty.
    if (nextMarket !== market || nextTimeframe !== timeframe || nextDepth !== depth) void get().loadCandles()
    if (instance) setTimeout(() => instance.fitView({ padding: 0.15 }), 50)
  },

  snapshot: () => {
    const { nodes, edges, title, settings, market, timeframe, depth } = get()
    return { title, nodes, edges, settings, market, timeframe, depth }
  },

  clear: () => set({ nodes: [], edges: [], runResult: null, runFor: null }),
}))
