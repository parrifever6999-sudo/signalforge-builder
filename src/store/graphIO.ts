import type { Edge } from '@xyflow/react'
import type {
  BlockData, BuilderNode, StrategySettings, SourceKind, IndicatorKind, ConditionKind, ActionKind,
  PlotStyle, StopKind, TargetKind, TrailKind, BreakevenKind, SizeKind, IndicatorData, ConditionData,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'
import {
  ACTIONS, CONDITIONS, INDICATORS, PLOT_COLORS, PLOT_STYLES, SOURCES,
  DEFAULT_HTF, isHtf, isTimezone, paramValues,
} from '../blocks/definitions'
import { cleanSymbol } from '../codegen/generator'
import { isDepth, isMarket, isTimeframe } from '../data/market'
import { edgeId, outputKeys } from './connect'

// A strategy as it is saved to a file, kept in the browser or packed in a link.
export interface SavedState {
  title: string
  nodes: BuilderNode[]
  edges: Edge[]
  settings: StrategySettings
  market?: string
  timeframe?: string
  depth?: number
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
const own = (table: object, key: unknown) => Object.prototype.hasOwnProperty.call(table, String(key))

function source(v: unknown, fallback: SourceKind = 'close'): SourceKind {
  return SOURCES.some((s) => s.key === v) ? (v as SourceKind) : fallback
}

// A block as the canvas and the generator expect it: known kind, every field
// inside its limits, defaults where something is missing.
export function cleanData(raw: unknown): BlockData | null {
  if (!isObj(raw)) return null
  switch (raw.kind) {
    case 'source':
      return { kind: 'source', source: source(raw.source) }
    case 'value':
      return { kind: 'value', value: finite(raw.value, 0) }
    case 'indicator': {
      const key = raw.indicator as IndicatorKind
      const def = own(INDICATORS, key) ? INDICATORS[key] : null
      if (!def) return null
      const data: IndicatorData = {
        kind: 'indicator',
        indicator: key,
        length: clamp(Math.round(finite(raw.length, def.defaultLength)), 1, 5000),
        source: source(raw.source, def.defaultSource),
      }
      // Only what the block really has is kept, so a saved file stays small
      // and two equal strategies compare equal.
      if (def.params.length) data.params = paramValues(def, raw.params)
      if (def.usesTf) data.tf = isHtf(raw.tf) ? raw.tf : DEFAULT_HTF
      return data
    }
    case 'condition': {
      const key = raw.condition as ConditionKind
      if (!own(CONDITIONS, key)) return null
      const data: ConditionData = {
        kind: 'condition', condition: key, sourceA: source(raw.sourceA), sourceB: source(raw.sourceB),
      }
      const family = CONDITIONS[key].kind
      if (family === 'trend') data.length = clamp(Math.round(finite(raw.length, 3)), 1, 500)
      if (family === 'session') {
        data.from = clamp(Math.round(finite(raw.from, 8)), 0, 23)
        data.to = clamp(Math.round(finite(raw.to, 17)), 1, 24)
      }
      if (family === 'weekdays') {
        data.days = [...new Set(String(raw.days ?? '23456').replace(/[^1-7]/g, ''))].sort().join('')
      }
      if (family === 'session' || family === 'weekdays') data.tz = isTimezone(raw.tz) ? raw.tz : 'UTC'
      return data
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

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

export function cleanSettings(raw: unknown): StrategySettings {
  const r = isObj(raw) ? raw : {}
  const d = DEFAULT_SETTINGS
  const size = (v: unknown, fallback: number) => clamp(Math.abs(finite(v, fallback)), 0, 1000)
  return {
    lot: clamp(finite(r.lot, d.lot), 0.01, 1000),
    symbol: cleanSymbol(String(r.symbol ?? '')),
    stopKind: oneOf<StopKind>(r.stopKind, ['none', 'percent', 'atr'], d.stopKind),
    stopValue: size(r.stopValue, d.stopValue),
    targetKind: oneOf<TargetKind>(r.targetKind, ['none', 'percent', 'atr', 'rr'], d.targetKind),
    targetValue: size(r.targetValue, d.targetValue),
    trailKind: oneOf<TrailKind>(r.trailKind, ['none', 'percent', 'atr'], d.trailKind),
    trailValue: size(r.trailValue, d.trailValue),
    beKind: oneOf<BreakevenKind>(r.beKind, ['none', 'percent', 'atr', 'rr'], d.beKind),
    beValue: size(r.beValue, d.beValue),
    maxBars: clamp(Math.round(Math.abs(finite(r.maxBars, d.maxBars))), 0, 10000),
    sizeKind: oneOf<SizeKind>(r.sizeKind, ['equity', 'risk'], d.sizeKind),
    sizeValue: clamp(Math.abs(finite(r.sizeValue, d.sizeValue)), 0.01, 500),
    feePct: clamp(Math.abs(finite(r.feePct, d.feePct)), 0, 5),
    slipPct: clamp(Math.abs(finite(r.slipPct, d.slipPct)), 0, 5),
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
  const byId = new Map<string, BuilderNode>()
  for (const n of raw.nodes.slice(0, MAX_NODES)) {
    if (!isObj(n) || typeof n.id !== 'string' || !ID_RE.test(n.id) || byId.has(n.id)) continue
    const data = cleanData(n.data)
    if (!data) continue
    const pos = isObj(n.position) ? n.position : {}
    const node: BuilderNode = {
      id: n.id,
      type: 'block',
      position: { x: clamp(finite(pos.x, 0), -20000, 20000), y: clamp(finite(pos.y, 0), -20000, 20000) },
      data,
    }
    byId.set(n.id, node)
    nodes.push(node)
  }

  const edges: Edge[] = []
  const seen = new Set<string>()
  for (const e of (Array.isArray(raw.edges) ? raw.edges : []).slice(0, MAX_EDGES)) {
    if (!isObj(e) || typeof e.source !== 'string' || typeof e.target !== 'string') continue
    const from = byId.get(e.source)
    if (!from || !byId.has(e.target) || e.source === e.target) continue
    const targetHandle = e.targetHandle === 'a' || e.targetHandle === 'b' ? e.targetHandle : null
    // A wire from a block with several outputs must name one that exists.
    const keys = outputKeys(from.data)
    const sourceHandle = keys.length ? (keys.includes(String(e.sourceHandle)) ? String(e.sourceHandle) : keys[0]) : null
    const link = { source: e.source, target: e.target, sourceHandle, targetHandle }
    const id = edgeId(link)
    if (seen.has(id)) continue
    seen.add(id)
    edges.push({ id, ...link })
  }

  return {
    title: String(raw.title ?? 'My Strategy').replace(/[\r\n]+/g, ' ').slice(0, 80),
    nodes,
    edges,
    settings: cleanSettings(raw.settings),
    market: isMarket(raw.market) ? raw.market : undefined,
    timeframe: isTimeframe(raw.timeframe) ? raw.timeframe : undefined,
    depth: isDepth(raw.depth) ? raw.depth : undefined,
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
    edges: state.edges.map((e) => ({
      source: e.source,
      target: e.target,
      targetHandle: e.targetHandle ?? null,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    })),
    settings: state.settings,
    market: state.market,
    timeframe: state.timeframe,
    depth: state.depth,
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
