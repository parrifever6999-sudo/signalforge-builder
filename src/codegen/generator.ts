import type { Node, Edge } from '@xyflow/react'
import type {
  BuilderNode, BlockData, IndicatorData, SourceData, ConditionData, PlotData, ActionData,
  SourceKind, PlotStyle,
} from '../types'
import { INDICATORS, PLOT_COLORS, PLOT_STYLES, SOURCES, CONDITIONS, ACTIONS } from '../blocks/definitions'

// Nombre de variable Pine válido a partir del id del nodo
function varName(id: string): string {
  return 'v_' + id.replace(/[^a-zA-Z0-9]/g, '_')
}
function condName(id: string): string {
  return 'c_' + id.replace(/[^a-zA-Z0-9]/g, '_')
}

// Convierte una clave de source a su identificador Pine
function sourcePine(src: SourceKind): string {
  return SOURCES.find((s) => s.key === src)?.pine ?? 'close'
}

// Convierte una clave de color hex a su constante Pine
function colorPine(hex: string): string {
  return PLOT_COLORS.find((c) => c.key === hex)?.pine ?? 'color.blue'
}

// Convierte una clave de estilo a su constante Pine
function stylePine(style: PlotStyle): string {
  return PLOT_STYLES.find((s) => s.key === style)?.pine ?? 'plot.style_line'
}

// Escapa comillas en el título
function esc(s: string): string {
  return s.replace(/"/g, '\\"')
}

interface GenResult {
  code: string
  error?: string
  isStrategy: boolean
}

interface Incoming {
  handle: string | null
  source: string
}

/**
 * Genera código Pine Script v6 a partir del grafo visual.
 *
 * Soporta:
 *  - source/indicator → series numéricas
 *  - condition (2 entradas A/B) → serie booleana (crossover, crossunder, > < ≥ ≤)
 *  - action → strategy.entry / strategy.close (envuelto en `if cond`)
 *  - plot → dibujo de series
 *
 * Si existe al menos una acción, el script se emite como `strategy()`;
 * en caso contrario como `indicator()`.
 */
export function generatePine(
  nodes: Node<BlockData>[],
  edges: Edge[],
  title = 'My Strategy',
): GenResult {
  const nodeById = new Map<string, BuilderNode>()
  nodes.forEach((n) => nodeById.set(n.id, n as BuilderNode))

  // Conexiones entrantes agrupadas por target, con su handle
  const incoming = new Map<string, Incoming[]>()
  edges.forEach((e) => {
    if (!incoming.has(e.target)) incoming.set(e.target, [])
    incoming.get(e.target)!.push({
      handle: e.targetHandle ?? null,
      source: e.source,
    })
  })

  const lines: string[] = []
  const emitted = new Set<string>()

  // Resuelve el "valor Pine" de un nodo (variable o expresión built-in).
  // Las fuentes devuelven 'src:<pine>'; el resto devuelve el nombre de variable.
  function emitNode(id: string): string | null {
    const node = nodeById.get(id)
    if (!node || !node.data) return null
    if (emitted.has(id)) return varName(id)

    const data = node.data
    emitted.add(id)

    switch (data.kind) {
      case 'source':
        return 'src:' + sourcePine((data as SourceData).source)

      case 'indicator': {
        const ind = data as IndicatorData
        const def = INDICATORS[ind.indicator]
        if (!def) return null
        let sourceExpr = sourcePine(ind.source)
        for (const inc of incoming.get(id) ?? []) {
          const up = emitNode(inc.source)
          if (up) { sourceExpr = up.startsWith('src:') ? up.slice(4) : up; break }
        }
        const v = varName(id)
        lines.push(`${v} = ${def.fn}(${sourceExpr}, ${ind.length})`)
        return v
      }

      case 'condition': {
        const cond = data as ConditionData
        // Entrada A: handle 'a' o primera disponible; fallback sourceA
        let exprA = sourcePine(cond.sourceA)
        let exprB = sourcePine(cond.sourceB)
        let gotA = false
        let gotB = false
        for (const inc of incoming.get(id) ?? []) {
          const up = emitNode(inc.source)
          if (!up) continue
          const val = up.startsWith('src:') ? up.slice(4) : up
          if (inc.handle === 'b' && !gotB) { exprB = val; gotB = true }
          else if ((inc.handle === 'a' || inc.handle === null) && !gotA) { exprA = val; gotA = true }
          else if (!gotB) { exprB = val; gotB = true }
        }
        const c = condName(id)
        const def = CONDITIONS[cond.condition]
        if (def.kind === 'cross') {
          const fn = cond.condition === 'crossover' ? 'ta.crossover' : 'ta.crossunder'
          lines.push(`${c} = ${fn}(${exprA}, ${exprB})`)
        } else {
          const op = { gt: '>', lt: '<', gte: '>=', lte: '<=' }[cond.condition as 'gt' | 'lt' | 'gte' | 'lte']
          lines.push(`${c} = ${exprA} ${op} ${exprB}`)
        }
        return c
      }

      case 'action': {
        const act = data as ActionData
        // Resuelve la condición de entrada (handle por defecto)
        let condExpr = 'true'
        for (const inc of incoming.get(id) ?? []) {
          const up = emitNode(inc.source)
          if (up) { condExpr = up.startsWith('src:') ? 'true' : up; break }
        }
        const body: Record<string, string> = {
          entry_long: 'strategy.entry("Long", strategy.long)',
          entry_short: 'strategy.entry("Short", strategy.short)',
          exit_long: 'strategy.close("Long")',
          exit_short: 'strategy.close("Short")',
        }
        const call = body[act.action] ?? 'strategy.entry("Long", strategy.long)'
        lines.push(`if ${condExpr}`)
        lines.push(`    ${call}`)
        return null
      }

      case 'plot': {
        const plot = data as PlotData
        let valueExpr: string | null = null
        for (const inc of incoming.get(id) ?? []) {
          const up = emitNode(inc.source)
          if (up) { valueExpr = up.startsWith('src:') ? up.slice(4) : up; break }
        }
        if (!valueExpr) valueExpr = 'close'
        lines.push(
          `plot(${valueExpr}, "${esc(plot.title)}", color=${colorPine(plot.color)}, style=${stylePine(plot.style)})`,
        )
        return null
      }
    }
  }

  // ¿Hay acciones? → strategy ; si no → indicator
  const hasAction = nodes.some((n) => (n as BuilderNode).data?.kind === 'action')
  const plotNodes = nodes.filter((n) => (n as BuilderNode).data?.kind === 'plot')

  if (!hasAction && plotNodes.length === 0) {
    return { code: '', error: 'Añade un bloque "Plot" o una "Acción" para generar código.', isStrategy: false }
  }

  // Punto de entrada: acciones y plots (las acciones generan la lógica primero)
  const actionNodes = nodes.filter((n) => (n as BuilderNode).data?.kind === 'action')
  actionNodes.forEach((an) => emitNode(an.id))
  plotNodes.forEach((pn) => emitNode(pn.id))

  const header = hasAction
    ? ['//@version=6', `strategy("${esc(title)}", overlay=true)`, '']
    : ['//@version=6', `indicator("${esc(title)}", overlay=true)`, '']

  const code = [...header, ...lines].join('\n')
  return { code, isStrategy: hasAction }
}