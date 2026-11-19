import type { Node, Edge } from '@xyflow/react'

// ── Tipos de bloque ──────────────────────────────────────────────
export type BlockType = 'source' | 'indicator' | 'condition' | 'plot' | 'action'

// Fuentes de datos de precio
export type SourceKind = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4' | 'volume'

// Indicadores soportados por el generador (mapeados a ta.*)
export type IndicatorKind =
  | 'sma' | 'ema' | 'wma' | 'rma' | 'vwma'
  | 'rsi' | 'atr' | 'cci' | 'mom' | 'roc'
  | 'stdev' | 'variance' | 'median' | 'mode'

// Tipos de condición (comparación entre dos series)
export type ConditionKind =
  | 'crossover'   // A cruza por encima de B
  | 'crossunder'  // A cruza por debajo de B
  | 'gt'          // A > B
  | 'lt'          // A < B
  | 'gte'         // A >= B
  | 'lte'         // A <= B

// Tipos de acción de estrategia
export type ActionKind =
  | 'entry_long'   // strategy.entry("Long", strategy.long)
  | 'entry_short'  // strategy.entry("Short", strategy.short)
  | 'exit_long'    // strategy.close("Long")
  | 'exit_short'   // strategy.close("Short")

// Estilos de plot de Pine Script
export type PlotStyle = 'line' | 'histogram' | 'circles' | 'columns'

// ── Datos de un nodo lógico (payload de React Flow) ──────────────
export interface SourceData {
  kind: 'source'
  source: SourceKind
  [key: string]: unknown
}

export interface IndicatorData {
  kind: 'indicator'
  indicator: IndicatorKind
  length: number
  source: SourceKind   // fuente a la que se aplica (si no viene conectada)
  [key: string]: unknown
}

export interface ConditionData {
  kind: 'condition'
  condition: ConditionKind
  // Fallbacks si no hay conexiones (A y B)
  sourceA: SourceKind
  sourceB: SourceKind
  [key: string]: unknown
}

export interface PlotData {
  kind: 'plot'
  title: string
  color: string
  style: PlotStyle
  [key: string]: unknown
}

export interface ActionData {
  kind: 'action'
  action: ActionKind
  [key: string]: unknown
}

export type BlockData = SourceData | IndicatorData | ConditionData | PlotData | ActionData

// Nodo de React Flow con nuestro payload
export type BuilderNode = Node<BlockData, 'block'>

// Grafo completo del builder
export interface BuilderGraph {
  nodes: BuilderNode[]
  edges: Edge[]
}

// Marcador de señal (compra/venta) para dibujar en el gráfico
export interface SignalMarker {
  index: number
  side: 'buy' | 'sell'
}

// Estadísticas de backtest extraídas de ctx.strategy
export interface BacktestStats {
  netProfit: number
  grossProfit: number
  grossLoss: number
  profitFactor: number      // grossprofit / |grossloss|  (Infinity si no hay pérdidas)
  winRate: number           // 0–100
  totalTrades: number       // operaciones cerradas
  winTrades: number
  lossTrades: number
  openTrades: number
  maxDrawdown: number       // valor absoluto
  maxDrawdownPct: number    // %
  avgTrade: number          // netProfit / totalTrades
  sharpe: number
  cagr: number              // %
}

// Resultado de ejecutar un script Pine con PineTS
export interface PlotResult {
  title: string
  color: string
  style: PlotStyle
  data: number[]   // serie de valores (uno por barra)
}

export interface RunResult {
  ok: boolean
  plots: PlotResult[]
  markers: SignalMarker[]
  isStrategy: boolean
  stats: BacktestStats | null
  error?: string
  barCount: number
}

// Una vela OHLCV
export interface Candle {
  open: number
  high: number
  low: number
  close: number
  volume: number
  openTime: number
}