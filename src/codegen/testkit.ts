import type { Edge } from '@xyflow/react'
import type { BlockData, BuilderNode, StrategySettings } from '../types'
import { DEFAULT_SETTINGS } from '../types'

// Helpers shared by the generator tests.

export function node(id: string, data: BlockData): BuilderNode {
  return { id, type: 'block', position: { x: 0, y: 0 }, data } as BuilderNode
}

export function edge(source: string, target: string, targetHandle?: string): Edge {
  return { id: `${source}-${target}-${targetHandle ?? ''}`, source, target, targetHandle }
}

export function settings(over: Partial<StrategySettings> = {}): StrategySettings {
  return { ...DEFAULT_SETTINGS, ...over }
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

// Every identifier the script uses as v_x / c_x must have been assigned first.
export function undeclared(code: string): string[] {
  const declared = new Set<string>()
  const missing: string[] = []
  for (const line of code.split('\n')) {
    const m = /^\s*(?:var\s+\w+\s+)?([vc]_\w+)\s*:?=/.exec(line)
    const body = m ? line.slice(line.indexOf('=') + 1) : line
    for (const ref of body.match(/\b[vc]_\w+\b/g) ?? []) {
      if (!declared.has(ref)) missing.push(ref)
    }
    if (m) declared.add(m[1])
  }
  return missing
}
