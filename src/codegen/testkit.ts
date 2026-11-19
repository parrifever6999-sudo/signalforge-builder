import type { Edge } from '@xyflow/react'
import type { BlockData, BuilderNode, Candle, PlotMeta, RunResult, StrategySettings } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { cleanData } from '../store/graphIO'
import { generateCandles } from '../data/sampleData'
import { runPine } from '../engine/pineRunner'

// Helpers shared by the tests.

export function node(id: string, data: BlockData): BuilderNode {
  return { id, type: 'block', position: { x: 0, y: 0 }, data } as BuilderNode
}

// "out" names the output the wire leaves from, on blocks that have several.
export function edge(source: string, target: string, targetHandle?: string | null, out?: string | null): Edge {
  return {
    id: `${source}${out ? `.${out}` : ''}-${target}-${targetHandle ?? ''}`,
    source, target, targetHandle, sourceHandle: out ?? null,
  }
}

// A block of any kind with the defaults the app gives it.
export function block(id: string, raw: Record<string, unknown>): BuilderNode {
  const data = cleanData(raw)
  if (!data) throw new Error(`not a block: ${JSON.stringify(raw)}`)
  return node(id, data)
}

export const ind = (id: string, indicator: string, more: Record<string, unknown> = {}) =>
  block(id, { kind: 'indicator', indicator, ...more })
export const cond = (id: string, condition: string, more: Record<string, unknown> = {}) =>
  block(id, { kind: 'condition', condition, ...more })
export const act = (id: string, action: string) => block(id, { kind: 'action', action })
export const plot = (id: string, title = 'P') => block(id, { kind: 'plot', title, color: '#2563eb', style: 'line' })

export function settings(over: Partial<StrategySettings> = {}): StrategySettings {
  return { ...DEFAULT_SETTINGS, ...over }
}

const HOUR = 3600000

// The sample series on an hourly clock, for what depends on the time of day or
// on a higher timeframe. It starts on Friday 2024-03-01, and 600 hours later
// the US clocks have changed (10 March), so time zones are really exercised.
export function hourlyCandles(count = 600, start = Date.UTC(2024, 2, 1), seed = 42): Candle[] {
  return generateCandles(count, seed).map((c, i) => ({
    ...c, openTime: start + i * HOUR, closeTime: start + (i + 1) * HOUR - 1,
  }))
}

// Runs a script and also reads the series of the expressions given, by name.
export async function runWith(
  code: string, candles: Candle[], series: Record<string, string>, timeframe = '60',
): Promise<{ result: RunResult; get: (name: string) => number[] }> {
  const names = Object.keys(series)
  const extra = names.map((name) => `plot(${series[name]}, "${name}")`).join('\n')
  const meta: PlotMeta[] = names.map((title) => ({ title, color: '#2563eb', style: 'line', pane: 'sub' }))
  const result = await runPine(`${code}${extra}\n`, candles, meta, { timeframe })
  return { result, get: (name) => result.plots[names.indexOf(name)]?.data ?? [] }
}

// Stretches of consecutive bars where a series has a value (one per open trade).
export function runs(series: number[]): number[][] {
  const out: number[][] = []
  let cur: number[] = []
  for (const v of series) {
    if (Number.isFinite(v)) cur.push(v)
    else if (cur.length) { out.push(cur); cur = [] }
  }
  if (cur.length) out.push(cur)
  return out
}

// The graph the app loads as its example: one price block feeding two EMAs.
export function emaCrossGraph() {
  const nodes = [
    node('n1', { kind: 'source', source: 'close' }),
    node('n2', { kind: 'indicator', indicator: 'ema', length: 9, source: 'close' }),
    node('n3', { kind: 'indicator', indicator: 'ema', length: 21, source: 'close' }),
    node('n4', { kind: 'condition', condition: 'crossover', sourceA: 'close', sourceB: 'close' }),
    node('n5', { kind: 'condition', condition: 'crossunder', sourceA: 'close', sourceB: 'close' }),
    node('n6', { kind: 'action', action: 'entry_long' }),
    node('n7', { kind: 'action', action: 'exit_long' }),
    node('n8', { kind: 'plot', title: 'EMA 9', color: '#2563eb', style: 'line' }),
  ]
  const edges = [
    edge('n1', 'n2'), edge('n1', 'n3'),
    edge('n2', 'n4', 'a'), edge('n3', 'n4', 'b'),
    edge('n2', 'n5', 'a'), edge('n3', 'n5', 'b'),
    edge('n4', 'n6'), edge('n5', 'n7'),
    edge('n2', 'n8'),
  ]
  return { nodes, edges }
}

// Fast EMA against slow EMA with nothing that closes a trade: whatever closes
// it is the trade management under test. "side" picks longs, shorts or both.
export function entriesOnly(side: 'long' | 'short' | 'both' = 'long') {
  const nodes = [
    ind('f', 'ema', { length: 9 }),
    ind('s', 'ema', { length: 21 }),
    cond('up', 'crossover'),
    cond('dn', 'crossunder'),
  ]
  const edges = [edge('f', 'up', 'a'), edge('s', 'up', 'b'), edge('f', 'dn', 'a'), edge('s', 'dn', 'b')]
  if (side !== 'short') { nodes.push(act('buy', 'entry_long')); edges.push(edge('up', 'buy')) }
  if (side !== 'long') { nodes.push(act('sell', 'entry_short')); edges.push(edge('dn', 'sell')) }
  return { nodes, edges }
}

// RSI below a number AND price above a slow EMA -> buy.
export function rsiGraph() {
  const nodes = [
    node('r', { kind: 'indicator', indicator: 'rsi', length: 14, source: 'close' }),
    node('v', { kind: 'value', value: 30 }),
    node('lt', { kind: 'condition', condition: 'lt', sourceA: 'close', sourceB: 'close' }),
    node('f', { kind: 'indicator', indicator: 'ema', length: 50, source: 'close' }),
    node('p', { kind: 'source', source: 'close' }),
    node('gt', { kind: 'condition', condition: 'gt', sourceA: 'close', sourceB: 'close' }),
    node('and', { kind: 'condition', condition: 'and', sourceA: 'close', sourceB: 'close' }),
    node('go', { kind: 'action', action: 'entry_long' }),
  ]
  const edges = [
    edge('r', 'lt', 'a'), edge('v', 'lt', 'b'),
    edge('p', 'gt', 'a'), edge('f', 'gt', 'b'),
    edge('lt', 'and', 'a'), edge('gt', 'and', 'b'),
    edge('and', 'go'),
  ]
  return { nodes, edges }
}

// Names the script declares more than once. TradingView stops at the second
// one ("already defined"); the engine that runs in the browser does not mind.
export function redeclared(code: string): string[] {
  const seen = new Set<string>()
  const twice: string[] = []
  const declare = (name: string) => { if (seen.has(name)) twice.push(name); else seen.add(name) }
  for (const line of code.split('\n')) {
    // name = ..., var float name = ...   (":=" assigns again, "==" compares)
    const one = /^\s*(?:var(?:ip)?\s+\w+\s+)?(\w+)\s*=(?!=)/.exec(line)
    const tuple = /^\s*\[([^\]]+)\]\s*=/.exec(line)
    if (one) declare(one[1])
    if (tuple) for (const name of tuple[1].split(',')) declare(name.trim())
  }
  return twice
}

// Every identifier the script uses as v_x / c_x must have been assigned first.
export function undeclared(code: string): string[] {
  const declared = new Set<string>()
  const missing: string[] = []
  for (const line of code.split('\n')) {
    const m = /^\s*(?:var\s+\w+\s+)?([vc]_\w+)\s*:?=/.exec(line)
    // [a, b, c] = ta.bb(...) declares the three at once
    const tuple = /^\s*\[([^\]]+)\]\s*=/.exec(line)
    const body = m || tuple ? line.slice(line.indexOf('=') + 1) : line
    for (const ref of body.match(/\b[vc]_\w+\b/g) ?? []) {
      if (!declared.has(ref)) missing.push(ref)
    }
    if (m) declared.add(m[1])
    if (tuple) for (const name of tuple[1].split(',')) declared.add(name.trim())
  }
  return missing
}
