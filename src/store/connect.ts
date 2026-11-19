import type { Edge } from '@xyflow/react'
import type { BlockData, BuilderNode } from '../types'
import { CONDITIONS, INDICATORS } from '../blocks/definitions'

type ValueType = 'num' | 'bool'

export interface Link {
  source: string | null
  target: string | null
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

// What a block takes in: a number, a condition, either, or nothing.
export function inputOf(data: BlockData): ValueType | 'any' | null {
  switch (data.kind) {
    case 'indicator':
      return INDICATORS[data.indicator]?.usesSource ? 'num' : null
    case 'condition':
      return CONDITIONS[data.condition]?.kind === 'logic' ? 'bool' : 'num'
    case 'action':
      return 'bool'
    case 'plot':
      return 'any'
    default:
      return null
  }
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

/**
 * Whether a wire may be drawn: the types must match (a number cannot go where
 * a condition is expected) and it must not close a loop.
 */
export function canConnect(nodes: BuilderNode[], edges: Edge[], link: Link): boolean {
  if (!link.source || !link.target || link.source === link.target) return false
  const from = nodes.find((n) => n.id === link.source)
  const to = nodes.find((n) => n.id === link.target)
  if (!from || !to) return false
  const out = outputOf(from.data)
  const accepts = inputOf(to.data)
  if (!out || !accepts) return false
  if (accepts !== 'any' && accepts !== out) return false
  if (to.data.kind === 'condition' && link.targetHandle !== 'a' && link.targetHandle !== 'b') return false
  return !reaches(link.target, link.source, edges)
}

// Each input takes one wire: a new one replaces whatever was there.
export function connectEdge(edges: Edge[], link: Link): Edge[] {
  if (!link.source || !link.target) return edges
  const handle = link.targetHandle ?? null
  const kept = edges.filter((e) => !(e.target === link.target && (e.targetHandle ?? null) === handle))
  return [
    ...kept,
    {
      id: `e-${link.source}-${link.target}-${handle ?? 'in'}`,
      source: link.source,
      target: link.target,
      targetHandle: handle,
    },
  ]
}
