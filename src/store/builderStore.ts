import { create } from 'zustand'
import { addEdge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import type { Node, Edge, Connection, ReactFlowInstance, Viewport } from '@xyflow/react'
import type { BlockData, IndicatorKind, PlotStyle, BuilderNode, BuilderGraph, RunResult } from '../types'
import { INDICATORS, PLOT_COLORS } from '../blocks/definitions'
import { generatePine } from '../codegen/generator'
import { runPine } from '../engine/pineRunner'
import { generateCandles } from '../data/sampleData'

// Estado persistente del grafo
interface GraphState {
  nodes: Node<BlockData>[]
  edges: Edge[]
  lastViewport: Viewport | null
}

interface BuilderState {
  // Grafo
  nodes: Node<BlockData>[]
  edges: Edge[]
  onNodesChange: (changes: any) => void
  onEdgesChange: (changes: any) => void
  onConnect: (connection: Connection) => void

  // Selección / edición
  selectedId: string | null
  selectNode: (id: string | null) => void
  updateNodeData: (id: string, patch: Partial<BlockData>) => void

  // Configuración general
  strategyTitle: string
  setStrategyTitle: (t: string) => void

  // Resultados
  runResult: RunResult | null
  isRunning: boolean

  // Persistencia
  instance: ReactFlowInstance | null
  setInstance: (i: ReactFlowInstance | null) => void

  // Acciones
  addBlock: (blockKey: string, type: string, position?: { x: number; y: number }) => void
  removeNode: (id: string) => void
  onDrop: (event: any, screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number }) => void
  run: () => Promise<void>
  loadDemo: () => void
  saveGraph: () => GraphState | null
  loadGraph: (state: GraphState) => void
  clear: () => void
}

let idCounter = 1
const nextId = () => `n${idCounter++}`

// Fábrica de un nodo según el bloque del palette
function createBlockNode(blockKey: string, type: string, position: { x: number; y: number }): BuilderNode | null {
  const id = nextId()
  const common = { id, position }

  if (type === 'source') {
    return {
      ...common,
      type: 'block',
      data: { kind: 'source', source: 'close' },
    }
  }

  if (type === 'indicator') {
    const def = INDICATORS[blockKey as IndicatorKind] ?? INDICATORS.sma
    const key = (blockKey in INDICATORS ? blockKey : 'sma') as IndicatorKind
    return {
      ...common,
      type: 'block',
      data: { kind: 'indicator', indicator: key, length: def.defaultLength, source: 'close' },
    }
  }

  if (type === 'condition') {
    const key = (blockKey === 'crossunder' ? 'crossunder' : 'crossover') as 'crossover' | 'crossunder'
    return {
      ...common,
      type: 'block',
      data: { kind: 'condition', condition: key, sourceA: 'close', sourceB: 'close' },
    }
  }

  if (type === 'action') {
    const valid = ['entry_long', 'entry_short', 'exit_long', 'exit_short']
    const key = (valid.includes(blockKey) ? blockKey : 'entry_long') as
      'entry_long' | 'entry_short' | 'exit_long' | 'exit_short'
    return {
      ...common,
      type: 'block',
      data: { kind: 'action', action: key },
    }
  }

  if (type === 'plot') {
    return {
      ...common,
      type: 'block',
      data: { kind: 'plot', title: 'My Plot', color: PLOT_COLORS[0].key, style: 'line' },
    }
  }

  return null
}

export const useBuilder = create<BuilderState>((set, get) => ({
  nodes: [],
  edges: [],
  lastViewport: null,
  selectedId: null,
  strategyTitle: 'My Strategy',
  runResult: null,
  isRunning: false,
  instance: null,

  setInstance: (i) => set({ instance: i }),

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) as Node<BlockData>[] })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  onConnect: (connection) =>
    set((s) => ({ edges: addEdge(connection, s.edges) })),

  selectNode: (id) => set({ selectedId: id }),

  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } as BlockData } : n,
      ),
    })),

  setStrategyTitle: (t) => set({ strategyTitle: t }),

  addBlock: (blockKey, type, position) => {
    const pos = position ?? {
      x: 80 + Math.random() * 200,
      y: 80 + Math.random() * 300,
    }
    const node = createBlockNode(blockKey, type, pos)
    if (node) set((s) => ({ nodes: [...s.nodes, node] }))
  },

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  onDrop: (event, screenToFlowPosition) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/pineblock')
    if (!raw) return
    let parsed: { blockKey: string; type: string }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    get().addBlock(parsed.blockKey, parsed.type, position)
  },

  run: async () => {
    const { nodes, edges, strategyTitle } = get()
    set({ isRunning: true, runResult: null })

    const gen = generatePine(nodes as BuilderNode[], edges, strategyTitle)
    const { code, error } = gen

    if (error || !code) {
      set({
        isRunning: false,
        runResult: { ok: false, plots: [], markers: [], isStrategy: false, stats: null, error: error ?? 'Sin código.', barCount: 0 },
      })
      return
    }

    // Metadata de plots en orden de aparición
    const plotMeta = (nodes as BuilderNode[])
      .filter((n) => n.data?.kind === 'plot')
      .map((n) => {
        const d = n.data as any
        return { title: d.title as string, color: d.color as string, style: d.style as PlotStyle }
      })

    const candles = generateCandles(300, 42)
    const result = await runPine(code, candles, plotMeta)
    set({ isRunning: false, runResult: { ...result, isStrategy: gen.isStrategy } })
  },

  loadDemo: () => {
    idCounter = 1
    // Estrategia de ejemplo: EMA 9 / EMA 21 con cruce → entrar long / salir long
    const source = createBlockNode('close', 'source', { x: 40, y: 220 })
    const emaFast = createBlockNode('ema', 'indicator', { x: 280, y: 120 })
    const emaSlow = createBlockNode('ema', 'indicator', { x: 280, y: 320 })
    const cross = createBlockNode('crossover', 'condition', { x: 540, y: 160 })
    const entryLong = createBlockNode('entry_long', 'action', { x: 820, y: 80 })
    const crossUnder = createBlockNode('crossunder', 'condition', { x: 540, y: 360 })
    const exitLong = createBlockNode('exit_long', 'action', { x: 820, y: 380 })
    const plotFast = createBlockNode('plot', 'plot', { x: 820, y: 230 })
    if (!source || !emaFast || !emaSlow || !cross || !entryLong || !crossUnder || !exitLong || !plotFast) return

    ;(emaFast.data as any).length = 9
    ;(emaSlow.data as any).length = 21
    ;(cross.data as any).condition = 'crossover'
    ;(crossUnder.data as any).condition = 'crossunder'
    ;(plotFast.data as any).title = 'EMA 9'
    ;(plotFast.data as any).color = PLOT_COLORS[0].key
    ;(entryLong.data as any).action = 'entry_long'
    ;(exitLong.data as any).action = 'exit_long'

    const nodes = [source, emaFast, emaSlow, cross, crossUnder, entryLong, exitLong, plotFast]
    const edges: Edge[] = [
      // Fuente a las dos EMAs
      { id: 'e1', source: source.id, target: emaFast.id },
      { id: 'e2', source: source.id, target: emaSlow.id },
      // EMA rápida → A del crossover ; EMA lenta → B del crossover
      { id: 'e3', source: emaFast.id, target: cross.id, targetHandle: 'a' },
      { id: 'e4', source: emaSlow.id, target: cross.id, targetHandle: 'b' },
      { id: 'e5', source: emaFast.id, target: crossUnder.id, targetHandle: 'a' },
      { id: 'e6', source: emaSlow.id, target: crossUnder.id, targetHandle: 'b' },
      // Condiciones → acciones
      { id: 'e7', source: cross.id, target: entryLong.id },
      { id: 'e8', source: crossUnder.id, target: exitLong.id },
      // EMA rápida al plot
      { id: 'e9', source: emaFast.id, target: plotFast.id },
    ]
    set({ nodes, edges, strategyTitle: 'EMA 9/21 Crossover Strategy', runResult: null })
  },

  saveGraph: () => {
    const { nodes, edges, instance } = get()
    return { nodes, edges, lastViewport: instance?.getViewport() ?? null }
  },

  loadGraph: (state) =>
    set({
      nodes: state.nodes,
      edges: state.edges,
      runResult: null,
    }),

  clear: () => set({ nodes: [], edges: [], selectedId: null, runResult: null }),
}))