import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { Edge, Connection, NodeChange, EdgeChange, ReactFlowInstance } from '@xyflow/react'
import type {
  BlockData, BlockType, BuilderNode, Candle, RunResult, StrategySettings,
  IndicatorKind, ConditionKind, ActionKind,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { ACTIONS, CONDITIONS, INDICATORS, PLOT_COLORS } from '../blocks/definitions'
import type { GenResult } from '../codegen/generator'
import { runPine } from '../engine/pineRunner'
import { generateCandles } from '../data/sampleData'
import { fetchCandles, SAMPLE_MARKET } from '../data/market'
import type { Timeframe } from '../data/market'
import { isTimeframe } from '../data/market'
import type { Lang } from '../lang'
import { canConnect, connectEdge } from './connect'
import { cleanSettings } from './graphIO'
import type { SavedState } from './graphIO'
import { example } from './examples'
import type { ExampleKey } from './examples'

// 'live' = real candles, 'sample' = the user chose the offline series,
// 'fallback' = real candles failed and the offline series stands in.
export type DataState = 'loading' | 'live' | 'sample' | 'fallback'

export type FlowInstance = ReactFlowInstance<BuilderNode, Edge>

interface BuilderState {
  nodes: BuilderNode[]
  edges: Edge[]
  title: string
  settings: StrategySettings
  market: string
  timeframe: Timeframe
  lang: Lang

  candles: Candle[]
  dataState: DataState
  dataError: string | null

  runResult: RunResult | null
  runFor: Candle[] | null // the candles runResult was computed on
  isRunning: boolean

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
  setLang: (l: Lang) => void

  loadCandles: () => Promise<void>
  run: (gen: GenResult) => Promise<void>

  loadExample: (key: ExampleKey) => void
  applyState: (state: SavedState) => void
  snapshot: () => SavedState
  clear: () => void
}

const SAMPLE_BARS = 600

function blockData(key: string, type: BlockType, plotCount: number): BlockData | null {
  switch (type) {
    case 'source':
      return { kind: 'source', source: 'close' }
    case 'value':
      return { kind: 'value', value: 50 }
    case 'indicator': {
      const kind = (key in INDICATORS ? key : 'ema') as IndicatorKind
      const def = INDICATORS[kind]
      return { kind: 'indicator', indicator: kind, length: def.defaultLength, source: def.defaultSource }
    }
    case 'condition': {
      const kind = (key in CONDITIONS ? key : 'crossover') as ConditionKind
      return { kind: 'condition', condition: kind, sourceA: 'close', sourceB: 'close' }
    }
    case 'action': {
      const kind = (ACTIONS.includes(key as ActionKind) ? key : 'entry_long') as ActionKind
      return { kind: 'action', action: kind }
    }
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
  lang: 'en',

  candles: [],
  dataState: 'loading',
  dataError: null,

  runResult: null,
  runFor: null,
  isRunning: false,

  instance: null,
  setInstance: (i) => set({ instance: i }),

  onNodesChange: (changes) => set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  onConnect: (connection) =>
    set((s) => (canConnect(s.nodes, s.edges, connection) ? { edges: connectEdge(s.edges, connection) } : s)),

  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } as BlockData } : n)),
    })),

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
  setLang: (l) => {
    if (typeof document !== 'undefined') document.documentElement.lang = l
    set({ lang: l })
  },

  loadCandles: async () => {
    const { market, timeframe } = get()
    const seq = ++loadSeq
    if (market === SAMPLE_MARKET) {
      set({ candles: generateCandles(SAMPLE_BARS, 42), dataState: 'sample', dataError: null })
      return
    }
    set({ dataState: 'loading', dataError: null })
    try {
      const candles = await fetchCandles(market, timeframe)
      if (seq !== loadSeq) return
      set({ candles, dataState: 'live', dataError: null })
    } catch (err) {
      if (seq !== loadSeq) return
      set({
        candles: generateCandles(SAMPLE_BARS, 42),
        dataState: 'fallback',
        dataError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  run: async (gen) => {
    const seq = ++runSeq
    const { candles } = get()
    if (gen.error || !gen.code || candles.length === 0) {
      set({ runResult: null, runFor: null, isRunning: false })
      return
    }
    set({ isRunning: true })
    const result = await runPine(gen.code, candles, gen.plotMeta)
    if (seq !== runSeq) return
    set({ isRunning: false, runResult: { ...result, isStrategy: gen.isStrategy }, runFor: candles })
  },

  loadExample: (key) => get().applyState(example(key)),

  applyState: (state) => {
    const { market, timeframe, instance } = get()
    const nextMarket = state.market ?? market
    const nextTimeframe = isTimeframe(state.timeframe) ? state.timeframe : timeframe
    set({
      nodes: state.nodes,
      edges: state.edges,
      title: state.title,
      settings: cleanSettings(state.settings),
      market: nextMarket,
      timeframe: nextTimeframe,
    })
    // runResult is left alone on purpose: the run is triggered by a change in
    // the generated script, and loading the strategy already on the canvas
    // changes nothing, so wiping the result here would leave the panels empty.
    if (nextMarket !== market || nextTimeframe !== timeframe) void get().loadCandles()
    if (instance) setTimeout(() => instance.fitView({ padding: 0.15 }), 50)
  },

  snapshot: () => {
    const { nodes, edges, title, settings, market, timeframe } = get()
    return { title, nodes, edges, settings, market, timeframe }
  },

  clear: () => set({ nodes: [], edges: [], runResult: null, runFor: null }),
}))
