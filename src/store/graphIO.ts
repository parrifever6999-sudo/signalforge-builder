import type { Edge } from '@xyflow/react'
import type {
  BlockData, BuilderNode, StrategySettings, SourceKind, IndicatorKind, ConditionKind, ActionKind,
  PlotStyle, StopKind, TargetKind,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { ACTIONS, CONDITIONS, INDICATORS, PLOT_COLORS, PLOT_STYLES, SOURCES } from '../blocks/definitions'
import { cleanSymbol } from '../codegen/generator'
import { isMarket, isTimeframe } from '../data/market'

// A strategy as it is saved to a file, kept in the browser or packed in a link.
export interface SavedState {
  title: string
  nodes: BuilderNode[]
  edges: Edge[]
  settings: StrategySettings
  market?: string
  timeframe?: string
}

const MAX_NODES = 200
const MAX_EDGES = 400
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const finite = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function source(v: unknown, fallback: SourceKind = 'close'): SourceKind {
  return SOURCES.some((s) => s.key === v) ? (v as SourceKind) : fallback
}

function cleanData(raw: unknown): BlockData | null {
  if (!isObj(raw)) return null
  switch (raw.kind) {
    case 'source':
      return { kind: 'source', source: source(raw.source) }
    case 'value':
      return { kind: 'value', value: finite(raw.value, 0) }
    case 'indicator': {
      const key = raw.indicator as IndicatorKind
      const def = Object.prototype.hasOwnProperty.call(INDICATORS, String(key)) ? INDICATORS[key] : null
      if (!def) return null
      return {
        kind: 'indicator',
        indicator: key,
        length: clamp(Math.round(finite(raw.length, def.defaultLength)), 1, 5000),
        source: source(raw.source, def.defaultSource),
      }
    }
    case 'condition': {
      const key = raw.condition as ConditionKind
      if (!Object.prototype.hasOwnProperty.call(CONDITIONS, String(key))) return null
      return { kind: 'condition', condition: key, sourceA: source(raw.sourceA), sourceB: source(raw.sourceB) }
    }
    case 'plot':
      return {
        kind: 'plot',
        title: String(raw.title ?? 'Plot').replace(/[\r\n]+/g, ' ').slice(0, 40),
        color: PLOT_COLORS.some((c) => c.key === raw.color) ? String(raw.color) : PLOT_COLORS[0].key,
        style: PLOT_STYLES.some((s) => s.key === raw.style) ? (raw.style as PlotStyle) : 'line',
      }
    case 'action':
      return ACTIONS.includes(raw.action as ActionKind)
        ? { kind: 'action', action: raw.action as ActionKind }
        : null
    default:
      return null
  }
}

export function cleanSettings(raw: unknown): StrategySettings {
  const r = isObj(raw) ? raw : {}
  const stopKinds: StopKind[] = ['none', 'percent', 'atr']
  const targetKinds: TargetKind[] = ['none', 'percent', 'atr', 'rr']
  return {
    lot: clamp(finite(r.lot, DEFAULT_SETTINGS.lot), 0.01, 1000),
    symbol: cleanSymbol(String(r.symbol ?? '')),
    stopKind: stopKinds.includes(r.stopKind as StopKind) ? (r.stopKind as StopKind) : DEFAULT_SETTINGS.stopKind,
    stopValue: clamp(Math.abs(finite(r.stopValue, DEFAULT_SETTINGS.stopValue)), 0, 1000),
    targetKind: targetKinds.includes(r.targetKind as TargetKind)
      ? (r.targetKind as TargetKind)
      : DEFAULT_SETTINGS.targetKind,
    targetValue: clamp(Math.abs(finite(r.targetValue, DEFAULT_SETTINGS.targetValue)), 0, 1000),
  }
}

/**
 * Rebuilds a saved strategy from untrusted input (a file the user opens, a
 * link someone sent). Anything it does not recognise is dropped, so what
 * reaches the canvas and the generator is always well formed.
 */
export function sanitizeState(raw: unknown): SavedState | null {
  if (!isObj(raw) || !Array.isArray(raw.nodes)) return null

  const nodes: BuilderNode[] = []
  const ids = new Set<string>()
  for (const n of raw.nodes.slice(0, MAX_NODES)) {
    if (!isObj(n) || typeof n.id !== 'string' || !ID_RE.test(n.id) || ids.has(n.id)) continue
    const data = cleanData(n.data)
    if (!data) continue
    const pos = isObj(n.position) ? n.position : {}
    ids.add(n.id)
    nodes.push({
      id: n.id,
      type: 'block',
      position: { x: clamp(finite(pos.x, 0), -20000, 20000), y: clamp(finite(pos.y, 0), -20000, 20000) },
      data,
    })
  }

  const edges: Edge[] = []
  const seen = new Set<string>()
  for (const e of (Array.isArray(raw.edges) ? raw.edges : []).slice(0, MAX_EDGES)) {
    if (!isObj(e) || typeof e.source !== 'string' || typeof e.target !== 'string') continue
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue
    const handle = e.targetHandle === 'a' || e.targetHandle === 'b' ? e.targetHandle : null
    const id = `e-${e.source}-${e.target}-${handle ?? 'in'}`
    if (seen.has(id)) continue
    seen.add(id)
    edges.push({ id, source: e.source, target: e.target, targetHandle: handle })
  }

  return {
    title: String(raw.title ?? 'My Strategy').replace(/[\r\n]+/g, ' ').slice(0, 80),
    nodes,
    edges,
    settings: cleanSettings(raw.settings),
    market: isMarket(raw.market) ? raw.market : undefined,
    timeframe: isTimeframe(raw.timeframe) ? raw.timeframe : undefined,
  }
}

// ---- Share links: the strategy packed into the part of the URL after # ----

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(b64: string): string {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function encodeShare(state: SavedState): string {
  const compact = {
    title: state.title,
    nodes: state.nodes.map((n) => ({
      id: n.id,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: n.data,
    })),
    edges: state.edges.map((e) => ({ source: e.source, target: e.target, targetHandle: e.targetHandle ?? null })),
    settings: state.settings,
    market: state.market,
    timeframe: state.timeframe,
  }
  return toBase64Url(JSON.stringify(compact))
}

export function decodeShare(packed: string): SavedState | null {
  if (!packed || packed.length > 60000) return null
  try {
    return sanitizeState(JSON.parse(fromBase64Url(packed)))
  } catch {
    return null
  }
}
