import type { BlockType, IndicatorKind, SourceKind, PlotStyle, ConditionKind, ActionKind } from '../types'

// ── Metadata de cada bloque para la UI ───────────────────────────
export interface BlockMeta {
  key: string
  type: BlockType
  label: string
  description: string
  color: string          // color de acento del nodo
}

// Fuentes de precio disponibles
export const SOURCES: { key: SourceKind; label: string; pine: string }[] = [
  { key: 'close',  label: 'Close',   pine: 'close' },
  { key: 'open',   label: 'Open',    pine: 'open' },
  { key: 'high',   label: 'High',    pine: 'high' },
  { key: 'low',    label: 'Low',     pine: 'low' },
  { key: 'hl2',    label: 'HL2',     pine: 'hl2' },
  { key: 'hlc3',   label: 'HLC3',    pine: 'hlc3' },
  { key: 'ohlc4',  label: 'OHLC4',   pine: 'ohlc4' },
  { key: 'volume', label: 'Volume',  pine: 'volume' },
]

// Indicadores: clave -> { label, pine fn, defaultLen, descripcion }
export const INDICATORS: Record<
  IndicatorKind,
  { label: string; fn: string; defaultLength: number; group: string }
> = {
  sma:      { label: 'SMA (Media simple)',    fn: 'ta.sma',  defaultLength: 14, group: 'Moving Averages' },
  ema:      { label: 'EMA (Media exponencial)', fn: 'ta.ema', defaultLength: 14, group: 'Moving Averages' },
  wma:      { label: 'WMA (Media ponderada)',  fn: 'ta.wma',  defaultLength: 14, group: 'Moving Averages' },
  rma:      { label: 'RMA (Wilder)',           fn: 'ta.rma',  defaultLength: 14, group: 'Moving Averages' },
  vwma:     { label: 'VWMA (Media por volumen)', fn: 'ta.vwma', defaultLength: 14, group: 'Moving Averages' },
  rsi:      { label: 'RSI (Fuerza relativa)',  fn: 'ta.rsi',  defaultLength: 14, group: 'Oscillators' },
  cci:      { label: 'CCI (Índice canal)',     fn: 'ta.cci',  defaultLength: 20, group: 'Oscillators' },
  mom:      { label: 'Momentum',               fn: 'ta.mom',  defaultLength: 10, group: 'Oscillators' },
  roc:      { label: 'ROC (Tasa de cambio)',   fn: 'ta.roc',  defaultLength: 9,  group: 'Oscillators' },
  atr:      { label: 'ATR (Rango medio)',      fn: 'ta.atr',  defaultLength: 14, group: 'Volatility' },
  stdev:    { label: 'Desviación estándar',    fn: 'ta.stdev', defaultLength: 5, group: 'Volatility' },
  variance: { label: 'Varianza',               fn: 'ta.variance', defaultLength: 5, group: 'Volatility' },
  median:   { label: 'Mediana',                fn: 'ta.median', defaultLength: 9, group: 'Statistics' },
  mode:     { label: 'Moda',                   fn: 'ta.mode', defaultLength: 9, group: 'Statistics' },
}

// Paleta de colores para plots
export const PLOT_COLORS: { key: string; label: string; pine: string }[] = [
  { key: '#2563eb', label: 'Azul',    pine: 'color.blue' },
  { key: '#dc2626', label: 'Rojo',    pine: 'color.red' },
  { key: '#16a34a', label: 'Verde',   pine: 'color.green' },
  { key: '#f59e0b', label: 'Ámbar',   pine: 'color.orange' },
  { key: '#8b5cf6', label: 'Violeta', pine: 'color.purple' },
  { key: '#0891b2', label: 'Cian',    pine: 'color.teal' },
  { key: '#eab308', label: 'Amarillo', pine: 'color.yellow' },
  { key: '#ec4899', label: 'Fucsia',  pine: 'color.fuchsia' },
]

export const PLOT_STYLES: { key: PlotStyle; label: string; pine: string }[] = [
  { key: 'line',       label: 'Línea',      pine: 'plot.style_line' },
  { key: 'histogram',  label: 'Histograma', pine: 'plot.style_histogram' },
  { key: 'circles',    label: 'Círculos',   pine: 'plot.style_circles' },
  { key: 'columns',    label: 'Columnas',   pine: 'plot.style_columns' },
]

// Condiciones: comparación entre dos series (A y B)
export const CONDITIONS: Record<
  ConditionKind,
  { label: string; short: string; kind: 'cross' | 'compare' }
> = {
  crossover:  { label: 'Crossover (A cruza por encima de B)', short: 'A ✕↑ B', kind: 'cross' },
  crossunder: { label: 'Crossunder (A cruza por debajo de B)', short: 'A ✕↓ B', kind: 'cross' },
  gt:  { label: 'A mayor que B (A > B)',  short: 'A > B',  kind: 'compare' },
  lt:  { label: 'A menor que B (A < B)',  short: 'A < B',  kind: 'compare' },
  gte: { label: 'A mayor o igual (A ≥ B)', short: 'A ≥ B', kind: 'compare' },
  lte: { label: 'A menor o igual (A ≤ B)', short: 'A ≤ B', kind: 'compare' },
}

// Acciones de estrategia (entradas/salidas)
export const ACTIONS: Record<
  ActionKind,
  { label: string; short: string; side: 'buy' | 'sell' }
> = {
  entry_long:  { label: 'Abrir LONG (comprar)',  short: 'Entry Long',  side: 'buy' },
  entry_short: { label: 'Abrir SHORT (vender)',  short: 'Entry Short', side: 'sell' },
  exit_long:   { label: 'Cerrar LONG',           short: 'Exit Long',   side: 'sell' },
  exit_short:  { label: 'Cerrar SHORT',          short: 'Exit Short',  side: 'buy' },
}

// ── Bloques arrastrables del sidebar ─────────────────────────────
export const PALETTE: BlockMeta[] = [
  // Fuentes (arrastrar una genérica; el usuario elige cuál en el nodo)
  { key: 'source', type: 'source', label: 'Precio / Fuente', description: 'close, open, high, RSI… elige la serie base', color: '#64748b' },

  // Indicadores
  { key: 'sma', type: 'indicator', label: 'SMA', description: 'Media móvil simple', color: '#2563eb' },
  { key: 'ema', type: 'indicator', label: 'EMA', description: 'Media móvil exponencial', color: '#2563eb' },
  { key: 'rsi', type: 'indicator', label: 'RSI', description: 'Índice de fuerza relativa', color: '#8b5cf6' },
  { key: 'atr', type: 'indicator', label: 'ATR', description: 'Rango medio verdadero', color: '#f59e0b' },
  { key: 'cci', type: 'indicator', label: 'CCI', description: 'Índice de canal de mercancías', color: '#8b5cf6' },
  { key: 'stdev', type: 'indicator', label: 'Stdev', description: 'Desviación estándar', color: '#f59e0b' },

  // Condiciones (comparar dos series → señal booleana)
  { key: 'crossover', type: 'condition', label: 'Crossover', description: 'A cruza por encima de B', color: '#0ea5e9' },
  { key: 'crossunder', type: 'condition', label: 'Crossunder', description: 'A cruza por debajo de B', color: '#0ea5e9' },

  // Acciones de estrategia (entrada/salida)
  { key: 'entry_long', type: 'action', label: 'Entrar LONG', description: 'Abrir posición de compra', color: '#16a34a' },
  { key: 'entry_short', type: 'action', label: 'Entrar SHORT', description: 'Abrir posición de venta', color: '#dc2626' },
  { key: 'exit_long', type: 'action', label: 'Salir LONG', description: 'Cerrar posición de compra', color: '#dc2626' },
  { key: 'exit_short', type: 'action', label: 'Salir SHORT', description: 'Cerrar posición de venta', color: '#16a34a' },

  // Salida
  { key: 'plot', type: 'plot', label: 'Plot (Dibujar)', description: 'Dibuja la serie en el gráfico', color: '#16a34a' },
]

// Color de acento por tipo
export const TYPE_COLORS: Record<BlockType, string> = {
  source: '#64748b',
  indicator: '#2563eb',
  condition: '#0ea5e9',
  action: '#16a34a',
  plot: '#16a34a',
}