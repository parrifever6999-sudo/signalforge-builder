import type { Edge } from '@xyflow/react'
import type { BlockData, BuilderNode } from '../types'
import { CONDITIONS, INDICATORS, conditionInputs } from '../blocks/definitions'

type ValueType = 'num' | 'bool'

export interface Link {
  source: string | null
  target: string | null
  sourceHandle?: string | null
  targetHandle?: string | null
}

// What a block puts out, or null when it has no output.
export function outputOf(data: BlockData): ValueType | null {
  switch (data.kind) {
    case 'source':
    case 'value':
    case 'indicator':
      return 'num'
    case 'condition':
      return 'bool'
    default:
      return null
  }
}

// The named outputs of a block (Bollinger: basis, upper, lower). Empty for the
// blocks that put out a single value.
export function outputKeys(data: BlockData): string[] {
  if (data.kind !== 'indicator') return []
  const keys = (INDICATORS[data.indicator]?.outputs ?? []).map((o) => o.key)
  return keys.length === 1 && keys[0] === '' ? [] : keys
}

// What a block takes in: a number, a condition, either, or nothing.
export function inputOf(data: BlockData): ValueType | 'any' | null {
  switch (data.kind) {
    case 'indicator':
      return INDICATORS[data.indicator]?.usesSource ? 'num' : null
    case 'condition':
      return CONDITIONS[data.condition] ? conditionInputs(data.condition)?.type ?? null : null
    case 'action':
      return 'bool'
    case 'plot':
      return 'any'
    default:
      return null
  }
}

// The input handles a block has: 'a' and 'b' on conditions, one unnamed otherwise.
function inputHandles(data: BlockData): (string | null)[] {
  if (data.kind === 'condition') return conditionInputs(data.condition)?.handles ?? []
  return inputOf(data) ? [null] : []
}

function reaches(from: string, to: string, edges: Edge[]): boolean {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length) {
    const id = stack.pop() as string
    if (id === to) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const e of edges) if (e.source === id) stack.push(e.target)
  }
  return false
}

// A wire fits when it leaves from an output that exists, lands on an input
// that exists and carries the type that input takes.
function fits(from: BuilderNode, to: BuilderNode, link: Link): boolean {
  const out = outputOf(from.data)
  const accepts = inputOf(to.data)
  if (!out || !accepts) return false
  if (accepts !== 'any' && accepts !== out) return false
  const keys = outputKeys(from.data)
  const sourceHandle = link.sourceHandle ?? null
  if (keys.length ? !keys.includes(sourceHandle ?? '') : sourceHandle !== null) return false
  return inputHandles(to.data).includes(link.targetHandle ?? null)
}

/**
 * Whether a wire may be drawn: the types must match (a number cannot go where
 * a condition is expected) and it must not close a loop.
 */
export function canConnect(nodes: BuilderNode[], edges: Edge[], link: Link): boolean {
  if (!link.source || !link.target || link.source === link.target) return false
  const from = nodes.find((n) => n.id === link.source)
  const to = nodes.find((n) => n.id === link.target)
  if (!from || !to) return false
  return fits(from, to, link) && !reaches(link.target, link.source, edges)
}

export function edgeId(link: Link): string {
  const out = link.sourceHandle ? `.${link.sourceHandle}` : ''
  return `e-${link.source}${out}-${link.target}-${link.targetHandle ?? 'in'}`
}

// Each input takes one wire: a new one replaces whatever was there.
export function connectEdge(edges: Edge[], link: Link): Edge[] {
  if (!link.source || !link.target) return edges
  const handle = link.targetHandle ?? null
  const kept = edges.filter((e) => !(e.target === link.target && (e.targetHandle ?? null) === handle))
  return [
    ...kept,
    {
      id: edgeId(link),
      source: link.source,
      target: link.target,
      sourceHandle: link.sourceHandle ?? null,
      targetHandle: handle,
    },
  ]
}

/**
 * Drops the wires that no longer fit after a block changed (an indicator
 * swapped for one with other outputs, or for one that takes no source). A wire
 * from an output that is gone moves to the first output of the new block.
 */
export function pruneEdges(nodes: BuilderNode[], edges: Edge[]): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out: Edge[] = []
  for (const e of edges) {
    const from = byId.get(e.source)
    const to = byId.get(e.target)
    if (!from || !to) continue
    const keys = outputKeys(from.data)
    const wanted = e.sourceHandle ?? null
    const sourceHandle = keys.length ? (keys.includes(wanted ?? '') ? wanted : keys[0]) : null
    const link = { source: e.source, target: e.target, sourceHandle, targetHandle: e.targetHandle ?? null }
    if (!fits(from, to, link)) continue
    out.push(sourceHandle === wanted ? e : { ...e, id: edgeId(link), sourceHandle })
  }
  return out
}
