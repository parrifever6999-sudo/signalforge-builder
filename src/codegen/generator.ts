import type { Node, Edge } from '@xyflow/react'
import type {
  BlockData, BuilderNode, ActionKind, SourceKind, PlotStyle, PlotMeta, StrategySettings, Issue,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { INDICATORS, PLOT_COLORS, PLOT_STYLES, SOURCES, CONDITIONS } from '../blocks/definitions'

export interface GenResult {
  code: string
  error?: Issue
  warnings: Issue[]
  isStrategy: boolean
  plotMeta: PlotMeta[]
}

// What a block hands to the blocks wired after it. "price" says whether the
// value moves on the candle scale (a moving average of price does, RSI does not).
interface Val {
  expr: string
  type: 'num' | 'bool'
  price: boolean
}

type AlertAction = 'buy' | 'sell' | 'closebuy' | 'closesell'

const ident = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '_')
const varName = (id: string) => 'v_' + ident(id)
const condName = (id: string) => 'c_' + ident(id)

function sourcePine(src: SourceKind): string {
  return SOURCES.find((s) => s.key === src)?.pine ?? 'close'
}

function sourceVal(src: SourceKind): Val {
  const def = SOURCES.find((s) => s.key === src)
  return { expr: def?.pine ?? 'close', type: 'num', price: def?.price ?? true }
}

function colorPine(hex: string): string {
  return PLOT_COLORS.find((c) => c.key === hex)?.pine ?? 'color.blue'
}

function stylePine(style: PlotStyle): string {
  return PLOT_STYLES.find((s) => s.key === style)?.pine ?? 'plot.style_line'
}

function escTitle(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function fmtNum(n: number, fallback = 0): string {
  const v = Number.isFinite(n) ? n : fallback
  return String(Number(v.toFixed(6)))
}

// Tag sent as "strategy" in every alert, so results can be grouped per strategy.
export function strategySlug(title: string): string {
  const s = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
  return s || 'strategy'
}

// Broker symbols are letters, digits and a few separators (XAUUSD.m, US30#).
export function cleanSymbol(s: string): string {
  return (s ?? '').trim().replace(/[^A-Za-z0-9._#+-]/g, '').slice(0, 24)
}

// Pine string expression that evaluates to the JSON SignalForge expects.
function alertJson(action: AlertAction, symbol: string, slug: string): string {
  const sym = symbol ? `"symbol":"${symbol}"` : `"symbol":"' + syminfo.ticker + '"`
  const lot = action === 'buy' || action === 'sell' ? `,"lot":"' + str.tostring(lotSize) + '"` : ''
  return `'{"action":"${action}",${sym}${lot},"strategy":"${slug}"}'`
}

const positive = (n: number, fallback: number) => {
  const v = Math.abs(Number(n))
  return Number.isFinite(v) && v > 0 ? v : fallback
}

/**
 * Turns the block graph into Pine Script v6.
 *
 * With at least one wired action the script is a strategy() whose orders carry
 * the SignalForge alert JSON; otherwise it is a plain indicator().
 */
export function generatePine(
  nodes: Node<BlockData>[],
  edges: Edge[],
  title = 'My Strategy',
  settings: StrategySettings = DEFAULT_SETTINGS,
): GenResult {
  const nodeById = new Map<string, BuilderNode>()
  nodes.forEach((n) => nodeById.set(n.id, n as BuilderNode))

  const incoming = new Map<string, { handle: string | null; source: string }[]>()
  edges.forEach((e) => {
    if (!incoming.has(e.target)) incoming.set(e.target, [])
    incoming.get(e.target)!.push({ handle: e.targetHandle ?? null, source: e.source })
  })
  // Handle "a" before "b", whatever order the edges were drawn in.
  incoming.forEach((list) => list.sort((x, y) => (x.handle ?? '').localeCompare(y.handle ?? '')))

  const calc: string[] = []
  const warnings: Issue[] = []
  const warned = new Set<string>()
  const warn = (key: string) => {
    if (!warned.has(key)) { warned.add(key); warnings.push({ key }) }
  }

  // Each block is built once. A block wired into several others is reused by
  // the expression it produced, never by a guessed variable name.
  const memo = new Map<string, Val | null>()
  const visiting = new Set<string>()
  let loop = false

  function resolve(id: string): Val | null {
    if (memo.has(id)) return memo.get(id) ?? null
    if (visiting.has(id)) { loop = true; return null }
    visiting.add(id)
    const val = build(id)
    visiting.delete(id)
    memo.set(id, val)
    return val
  }

  function build(id: string): Val | null {
    const node = nodeById.get(id)
    const data = node?.data
    if (!data) return null
    const ins = incoming.get(id) ?? []

    switch (data.kind) {
      case 'source':
        return sourceVal(data.source)

      case 'value':
        return { expr: fmtNum(Number(data.value)), type: 'num', price: false }

      case 'indicator': {
        const def = INDICATORS[data.indicator]
        if (!def) return null
        const len = Math.min(5000, Math.max(1, Math.round(Number(data.length)) || def.defaultLength))
        const v = varName(id)
        let src = sourceVal(data.source ?? def.defaultSource)
        if (def.usesSource) {
          for (const inc of ins) {
            const up = resolve(inc.source)
            if (up?.type === 'num') { src = up; break }
            if (up?.type === 'bool') warn('warn.needsNumber')
          }
        }
        calc.push(`${v} = ${def.build(src.expr, len)}`)
        return { expr: v, type: 'num', price: def.scale === 'input' && def.usesSource && src.price }
      }

      case 'condition': {
        const def = CONDITIONS[data.condition]
        if (!def) return null
        const c = condName(id)

        if (def.kind === 'logic') {
          const parts: string[] = []
          for (const inc of ins) {
            const up = resolve(inc.source)
            if (up?.type === 'bool') parts.push(up.expr)
          }
          if (parts.length < 2) { warn('warn.logicNeedsTwo'); return null }
          calc.push(`${c} = ${parts[0]} ${def.pine} ${parts[1]}`)
          return { expr: c, type: 'bool', price: false }
        }

        let a = sourcePine(data.sourceA)
        let b = sourcePine(data.sourceB)
        let gotA = false
        let gotB = false
        for (const inc of ins) {
          const up = resolve(inc.source)
          if (!up) continue
          if (up.type !== 'num') { warn('warn.needsNumber'); continue }
          if (inc.handle === 'b' && !gotB) { b = up.expr; gotB = true }
          else if (inc.handle !== 'b' && !gotA) { a = up.expr; gotA = true }
          else if (!gotB) { b = up.expr; gotB = true }
        }
        calc.push(def.kind === 'cross' ? `${c} = ${def.pine}(${a}, ${b})` : `${c} = ${a} ${def.pine} ${b}`)
        return { expr: c, type: 'bool', price: false }
      }

      default:
        return null // actions and plots are end points
    }
  }

  // ---- End points: actions and plots ----
  const actions: { action: ActionKind; cond: string }[] = []
  for (const n of nodes) {
    const data = (n as BuilderNode).data
    if (data?.kind !== 'action') continue
    let cond: string | null = null
    for (const inc of incoming.get(n.id) ?? []) {
      const up = resolve(inc.source)
      if (up?.type === 'bool') { cond = up.expr; break }
    }
    if (!cond) { warn('warn.actionNeedsCondition'); continue }
    actions.push({ action: data.action, cond })
  }

  const plots: (PlotMeta & { expr: string })[] = []
  const usedTitles = new Set<string>()
  for (const n of nodes) {
    const data = (n as BuilderNode).data
    if (data?.kind !== 'plot') continue
    let val: Val | null = null
    for (const inc of incoming.get(n.id) ?? []) {
      val = resolve(inc.source)
      if (val) break
    }
    const expr = !val ? 'close' : val.type === 'bool' ? `(${val.expr} ? 1 : 0)` : val.expr
    const base = (String(data.title ?? '').replace(/\s+/g, ' ').trim() || 'Plot').slice(0, 40)
    let plotTitle = base
    for (let i = 2; usedTitles.has(plotTitle); i++) plotTitle = `${base} ${i}`
    usedTitles.add(plotTitle)
    plots.push({
      expr,
      title: plotTitle,
      color: data.color,
      style: data.style,
      pane: !val || val.price ? 'price' : 'sub',
    })
  }

  // A script with something off the price scale (RSI, ATR, a 0/1 signal) goes
  // in its own pane on TradingView; its price-scale plots are pinned to the chart.
  const overlay = !plots.some((p) => p.pane === 'sub')
  const plotLines = plots.map((p) =>
    `plot(${p.expr}, "${escTitle(p.title)}", color=${colorPine(p.color)}, style=${stylePine(p.style)}` +
    (!overlay && p.pane === 'price' ? ', force_overlay=true)' : ')'),
  )
  const plotMeta: PlotMeta[] = plots.map(({ title, color, style, pane }) => ({ title, color, style, pane }))

  const isStrategy = actions.length > 0
  if (loop) {
    return { code: '', error: { key: 'error.loop' }, warnings, isStrategy: false, plotMeta: [] }
  }
  if (!isStrategy && plotLines.length === 0) {
    return { code: '', error: { key: 'error.empty' }, warnings, isStrategy: false, plotMeta: [] }
  }

  // ---- Assemble the script ----
  const out: string[] = ['//@version=6']
  if (!isStrategy) {
    out.push(`indicator("${escTitle(title)}", overlay=${overlay})`, '', ...calc, ...plotLines)
    return { code: out.join('\n') + '\n', warnings, isStrategy, plotMeta }
  }

  const slug = strategySlug(title)
  const symbol = cleanSymbol(settings.symbol)
  const hasLong = actions.some((a) => a.action === 'entry_long')
  const hasShort = actions.some((a) => a.action === 'entry_short')

  const stopKind = settings.stopKind
  let targetKind = settings.targetKind
  if (targetKind === 'rr' && stopKind === 'none') { warn('warn.rrNeedsStop'); targetKind = 'none' }
  const useStop = stopKind !== 'none' && (hasLong || hasShort)
  const useTarget = targetKind !== 'none' && (hasLong || hasShort)
  const stopVal = fmtNum(positive(settings.stopValue, 1.5))
  const targetVal = fmtNum(positive(settings.targetValue, 2))
  const stopExpr = stopKind === 'percent' ? `close * ${stopVal} / 100` : `sfAtr * ${stopVal}`
  const targetExpr =
    targetKind === 'percent' ? `close * ${targetVal} / 100`
    : targetKind === 'atr' ? `sfAtr * ${targetVal}`
    : `sfStopDist * ${targetVal}`

  out.push(
    `strategy("${escTitle(title)}", overlay=${overlay}, initial_capital=10000, ` +
    'default_qty_type=strategy.percent_of_equity, default_qty_value=100, ' +
    // margin 0 = no simulated margin calls. With Pine v6 defaults (100) a
    // short sized at the whole balance is cut in pieces on any adverse tick.
    'commission_type=strategy.commission.percent, commission_value=0.05, margin_long=0, margin_short=0)',
    '',
    '// Lot size sent to MT5 with every entry (SignalForge reads it from the alert)',
    `lotSize = input.float(${fmtNum(Math.max(0.01, positive(settings.lot, 0.1)))}, "Lot size (MT5)", minval=0.01, step=0.01)`,
    '',
    ...calc,
  )

  if (useStop || useTarget) {
    out.push('', '// Stop and target distances, fixed on the entry bar')
    if ((useStop && stopKind === 'atr') || (useTarget && targetKind === 'atr')) out.push('sfAtr = ta.atr(14)')
    if (useStop) out.push('var float sfStopDist = na')
    if (useTarget) out.push('var float sfTakeDist = na')
  }

  out.push('', '// One position at a time: entries only fire when flat, so TradingView and MT5 stay in sync')
  for (const a of actions) {
    if (a.action === 'entry_long' || a.action === 'entry_short') {
      const long = a.action === 'entry_long'
      out.push(`if ${a.cond} and strategy.position_size == 0`)
      if (useStop) out.push(`    sfStopDist := ${stopExpr}`)
      if (useTarget) out.push(`    sfTakeDist := ${targetExpr}`)
      out.push(
        long
          ? `    strategy.entry("Long", strategy.long, alert_message=${alertJson('buy', symbol, slug)})`
          : `    strategy.entry("Short", strategy.short, alert_message=${alertJson('sell', symbol, slug)})`,
      )
    } else if (a.action === 'exit_long') {
      out.push(
        `if ${a.cond} and strategy.position_size > 0`,
        `    strategy.close("Long", alert_message=${alertJson('closebuy', symbol, slug)})`,
      )
    } else {
      out.push(
        `if ${a.cond} and strategy.position_size < 0`,
        `    strategy.close("Short", alert_message=${alertJson('closesell', symbol, slug)})`,
      )
    }
  }

  if (useStop || useTarget) {
    const bracket = (long: boolean) => {
      const parts: string[] = []
      if (useStop) parts.push(`stop=strategy.position_avg_price ${long ? '-' : '+'} sfStopDist`)
      if (useTarget) parts.push(`limit=strategy.position_avg_price ${long ? '+' : '-'} sfTakeDist`)
      return parts.join(', ')
    }
    out.push('', '// Protective exits: TradingView sends the close alert when the stop or the target is hit')
    if (hasLong) {
      out.push(
        'if strategy.position_size > 0',
        `    strategy.exit("XL", from_entry="Long", ${bracket(true)}, alert_message=${alertJson('closebuy', symbol, slug)})`,
      )
    }
    if (hasShort) {
      out.push(
        'if strategy.position_size < 0',
        `    strategy.exit("XS", from_entry="Short", ${bracket(false)}, alert_message=${alertJson('closesell', symbol, slug)})`,
      )
    }
  }

  if (plotLines.length) out.push('', ...plotLines)
  return { code: out.join('\n') + '\n', warnings, isStrategy, plotMeta }
}
