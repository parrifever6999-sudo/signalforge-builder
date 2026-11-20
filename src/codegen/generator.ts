import type { Node, Edge } from '@xyflow/react'
import type {
  BlockData, BuilderNode, ActionKind, SourceKind, PlotStyle, PlotMeta, StrategySettings, Issue, HtfNeed,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'
import {
  INDICATORS, PLOT_COLORS, PLOT_STYLES, SOURCES, CONDITIONS, DEFAULT_HTF, isHtf, isTimezone, paramValues,
} from '../blocks/definitions'

export interface GenResult {
  code: string
  error?: Issue
  warnings: Issue[]
  isStrategy: boolean
  plotMeta: PlotMeta[]
  // Blocks of the script that need history of a higher timeframe to be trusted.
  needs: HtfNeed[]
}

// What a block hands to the blocks wired after it. "price" says whether the
// value moves on the candle scale (a moving average of price does, RSI does not).
interface Val {
  expr: string
  type: 'num' | 'bool'
  price: boolean
}

// A block with several outputs (Bollinger: basis, upper, lower) hands one Val
// per output; a block with one output uses the key ''.
type Built = Map<string, Val>

type AlertAction = 'buy' | 'sell' | 'closebuy' | 'closesell'

// Two blocks must never end up with the same name: TradingView refuses a
// script that declares a name twice. An output or a helper line is joined to
// its block with one "_" ("v_a" + "_upper"), so inside the id every "_" is
// doubled and any other sign becomes "_0". No id can then spell another
// block's "id_output". The ids the app gives (n1, n2...) stay as they are.
const ident = (id: string) => id.replace(/[^a-zA-Z0-9]/g, (ch) => (ch === '_' ? '__' : '_0'))
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

const within = (n: unknown, fallback: number, lo: number, hi: number) => {
  const v = Number(n)
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : fallback))
}

// In the simulation a position sized by risk is capped at this many times the
// balance, so a very tight stop cannot ask for an absurd size.
export const MAX_LEVERAGE = 20

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
  const st: StrategySettings = { ...DEFAULT_SETTINGS, ...settings }
  const nodeById = new Map<string, BuilderNode>()
  nodes.forEach((n) => nodeById.set(n.id, n as BuilderNode))

  // "out" is which output of the source block the wire leaves from.
  const incoming = new Map<string, { handle: string | null; source: string; out: string | null }[]>()
  edges.forEach((e) => {
    if (!incoming.has(e.target)) incoming.set(e.target, [])
    incoming.get(e.target)!.push({ handle: e.targetHandle ?? null, source: e.source, out: e.sourceHandle ?? null })
  })
  // Handle "a" before "b", whatever order the edges were drawn in.
  incoming.forEach((list) => list.sort((x, y) => (x.handle ?? '').localeCompare(y.handle ?? '')))

  const calc: string[] = []
  const needs: HtfNeed[] = []
  const warnings: Issue[] = []
  const warned = new Set<string>()
  const warn = (key: string) => {
    if (!warned.has(key)) { warned.add(key); warnings.push({ key }) }
  }

  // Each block is built once. A block wired into several others is reused by
  // the expression it produced, never by a guessed variable name.
  const memo = new Map<string, Built | null>()
  const visiting = new Set<string>()
  let loop = false

  function resolve(id: string, out: string | null = null): Val | null {
    if (!memo.has(id)) {
      if (visiting.has(id)) { loop = true; return null }
      visiting.add(id)
      const built = build(id)
      visiting.delete(id)
      memo.set(id, built)
    }
    const built = memo.get(id)
    if (!built) return null
    // An output that no longer exists (the block was changed) falls back to the first one.
    return built.get(out ?? '') ?? built.values().next().value ?? null
  }

  const single = (val: Val): Built => new Map([['', val]])
  const bool = (expr: string): Built => single({ expr, type: 'bool', price: false })

  function build(id: string): Built | null {
    const node = nodeById.get(id)
    const data = node?.data
    if (!data) return null
    const ins = incoming.get(id) ?? []

    switch (data.kind) {
      case 'source':
        return single(sourceVal(data.source))

      case 'value':
        return single({ expr: fmtNum(Number(data.value)), type: 'num', price: false })

      case 'indicator': {
        const def = INDICATORS[data.indicator]
        if (!def) return null
        const len = Math.min(5000, Math.max(1, Math.round(Number(data.length)) || def.defaultLength))
        const v = varName(id)
        let src = sourceVal(data.source ?? def.defaultSource)
        if (def.usesSource) {
          for (const inc of ins) {
            const up = resolve(inc.source, inc.out)
            if (up?.type === 'num') { src = up; break }
            if (up?.type === 'bool') warn('warn.needsNumber')
          }
        }
        const tf = isHtf(data.tf) ? data.tf : DEFAULT_HTF
        calc.push(...def.build({ v, src: src.expr, len, p: paramValues(def, data.params), tf }))
        if (def.warmup) needs.push({ indicator: data.indicator, tf, length: len, ...def.warmup(len) })
        const built: Built = new Map()
        for (const o of def.outputs) {
          built.set(o.key, {
            expr: o.key ? `${v}_${o.key}` : v,
            type: 'num',
            price: o.scale === 'price' || (o.scale === 'input' && def.usesSource && src.price),
          })
        }
        return built
      }

      case 'condition': {
        const def = CONDITIONS[data.condition]
        if (!def) return null
        const c = condName(id)

        if (def.kind === 'logic') {
          const parts: string[] = []
          for (const inc of ins) {
            const up = resolve(inc.source, inc.out)
            if (up?.type === 'bool') parts.push(up.expr)
          }
          if (parts.length < 2) { warn('warn.logicNeedsTwo'); return null }
          calc.push(`${c} = ${parts[0]} ${def.pine} ${parts[1]}`)
          return bool(c)
        }

        if (def.kind === 'not') {
          for (const inc of ins) {
            const up = resolve(inc.source, inc.out)
            if (up?.type !== 'bool') continue
            calc.push(`${c} = not ${up.expr}`)
            return bool(c)
          }
          warn('warn.notNeedsOne')
          return null
        }

        if (def.kind === 'session') {
          const from = Math.round(within(data.from, 8, 0, 23))
          const to = Math.round(within(data.to, 17, 1, 24))
          const tz = isTimezone(data.tz) ? data.tz : 'UTC'
          if (from === to % 24) {
            calc.push(`${c} = true`) // from an hour to the same hour: the whole day
          } else {
            calc.push(
              `${c}_h = hour(time, "${tz}")`,
              // "to" earlier than "from" is a session that runs past midnight
              from < to ? `${c} = ${c}_h >= ${from} and ${c}_h < ${to}` : `${c} = ${c}_h >= ${from} or ${c}_h < ${to}`,
            )
          }
          return bool(c)
        }

        if (def.kind === 'weekdays') {
          const days = [...new Set(String(data.days ?? '23456').replace(/[^1-7]/g, ''))].sort()
          const tz = isTimezone(data.tz) ? data.tz : 'UTC'
          if (days.length === 0 || days.length === 7) {
            calc.push(`${c} = ${days.length === 7}`)
          } else {
            calc.push(
              `${c}_d = dayofweek(time, "${tz}")`,
              `${c} = ${days.map((d) => `${c}_d == ${d}`).join(' or ')}`,
            )
          }
          return bool(c)
        }

        let a = sourcePine(data.sourceA)
        let b = sourcePine(data.sourceB)
        let gotA = false
        let gotB = false
        for (const inc of ins) {
          const up = resolve(inc.source, inc.out)
          if (!up) continue
          if (up.type !== 'num') { warn('warn.needsNumber'); continue }
          if (inc.handle === 'b' && !gotB) { b = up.expr; gotB = true }
          else if (inc.handle !== 'b' && !gotA) { a = up.expr; gotA = true }
          else if (!gotB) { b = up.expr; gotB = true }
        }

        if (def.kind === 'trend') {
          const bars = Math.round(within(data.length, 3, 1, 500))
          calc.push(`${c} = ${def.pine}(${a}, ${bars})`)
        } else {
          calc.push(def.kind === 'cross' ? `${c} = ${def.pine}(${a}, ${b})` : `${c} = ${a} ${def.pine} ${b}`)
        }
        return bool(c)
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
      const up = resolve(inc.source, inc.out)
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
      val = resolve(inc.source, inc.out)
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
    return { code: '', error: { key: 'error.loop' }, warnings, isStrategy: false, plotMeta: [], needs: [] }
  }
  if (!isStrategy && plotLines.length === 0) {
    return { code: '', error: { key: 'error.empty' }, warnings, isStrategy: false, plotMeta: [], needs: [] }
  }

  // ---- Assemble the script ----
  const out: string[] = ['//@version=6']
  if (!isStrategy) {
    out.push(`indicator("${escTitle(title)}", overlay=${overlay})`, '', ...calc, ...plotLines)
    return { code: out.join('\n') + '\n', warnings, isStrategy, plotMeta, needs }
  }

  const slug = strategySlug(title)
  const symbol = cleanSymbol(st.symbol)
  const hasLong = actions.some((a) => a.action === 'entry_long')
  const hasShort = actions.some((a) => a.action === 'entry_short')
  const hasEntry = hasLong || hasShort

  // Settings that lean on a stop are dropped, with a warning, when there is none.
  const stopKind = st.stopKind
  let targetKind = st.targetKind
  if (targetKind === 'rr' && stopKind === 'none') { warn('warn.rrNeedsStop'); targetKind = 'none' }
  let beKind = st.beKind
  if (beKind === 'rr' && stopKind === 'none') { warn('warn.beNeedsStop'); beKind = 'none' }
  let sizeKind = st.sizeKind
  if (sizeKind === 'risk' && stopKind === 'none') { warn('warn.riskNeedsStop'); sizeKind = 'equity' }
  const trailKind = st.trailKind

  const useStop = stopKind !== 'none' && hasEntry
  const useTarget = targetKind !== 'none' && hasEntry
  const useTrail = trailKind !== 'none' && hasEntry
  const useBe = beKind !== 'none' && hasEntry
  const moving = useTrail || useBe // the stop changes while the trade is open
  const byRisk = sizeKind === 'risk' && hasEntry
  const maxBars = hasEntry ? Math.round(within(st.maxBars, 0, 0, 10000)) : 0

  const stopVal = fmtNum(positive(st.stopValue, 1.5))
  const targetVal = fmtNum(positive(st.targetValue, 2))
  const trailVal = fmtNum(positive(st.trailValue, 2))
  const beVal = fmtNum(positive(st.beValue, 1))
  const dist = (kind: string, val: string) => (kind === 'percent' ? `close * ${val} / 100` : `sfAtr * ${val}`)
  const stopExpr = dist(stopKind, stopVal)
  const targetExpr = targetKind === 'rr' ? `sfStopDist * ${targetVal}` : dist(targetKind, targetVal)
  const trailExpr = dist(trailKind, trailVal)
  const beExpr = beKind === 'rr' ? `sfStopDist * ${beVal}` : dist(beKind, beVal)
  const useAtr =
    (useStop && stopKind === 'atr') || (useTarget && targetKind === 'atr') ||
    (useTrail && trailKind === 'atr') || (useBe && beKind === 'atr')

  const fee = within(st.feePct, DEFAULT_SETTINGS.feePct, 0, 5)
  const slip = within(st.slipPct, DEFAULT_SETTINGS.slipPct, 0, 5)
  const equityPct = sizeKind === 'equity' && st.sizeKind === 'equity' ? within(positive(st.sizeValue, 100), 100, 1, 500) : 100
  const riskPct = fmtNum(within(positive(st.sizeValue, 1), 1, 0.01, 100))

  out.push(
    `strategy("${escTitle(title)}", overlay=${overlay}, initial_capital=10000, ` +
    `default_qty_type=strategy.percent_of_equity, default_qty_value=${fmtNum(equityPct)}, ` +
    // margin 0 = no simulated margin calls. With Pine v6 defaults (100) a
    // short sized at the whole balance is cut in pieces on any adverse tick.
    `commission_type=strategy.commission.percent, commission_value=${fmtNum(fee + slip)}, margin_long=0, margin_short=0)`,
    `// Cost per side: ${fmtNum(fee)}% commission + ${fmtNum(slip)}% slippage, charged together so it weighs the same on any symbol`,
    '',
    '// Lot size sent to MT5 with every entry (SignalForge reads it from the alert)',
    `lotSize = input.float(${fmtNum(Math.max(0.01, positive(st.lot, 0.1)))}, "Lot size (MT5)", minval=0.01, step=0.01)`,
    '',
    ...calc,
  )

  if (useStop || useTarget || moving) {
    out.push('', '// Distances of the stop, the target and the trailing, fixed on the entry bar')
    if (useAtr) out.push('sfAtr = ta.atr(14)')
    if (useStop) out.push('var float sfStopDist = na')
    if (useTarget) out.push('var float sfTakeDist = na')
    if (useTrail) out.push('var float sfTrailDist = na')
    if (useBe) out.push('var float sfBeDist = na')
    if (moving) out.push('var float sfStop = na')
  }

  out.push('', '// One position at a time: entries only fire when flat, so TradingView and MT5 stay in sync')
  // Sized by risk: what is lost if the stop is hit is a fixed share of the
  // balance. The lot that goes to MT5 is still lotSize.
  const qty = byRisk
    ? `, qty=math.min(strategy.equity * ${riskPct} / 100 / sfStopDist, strategy.equity * ${MAX_LEVERAGE} / close)`
    : ''
  for (const a of actions) {
    if (a.action === 'entry_long' || a.action === 'entry_short') {
      const long = a.action === 'entry_long'
      out.push(`if ${a.cond} and strategy.position_size == 0${byRisk ? ` and ${stopExpr} > 0` : ''}`)
      if (useStop) out.push(`    sfStopDist := ${stopExpr}`)
      if (useTarget) out.push(`    sfTakeDist := ${targetExpr}`)
      if (useTrail) out.push(`    sfTrailDist := ${trailExpr}`)
      if (useBe) out.push(`    sfBeDist := ${beExpr}`)
      out.push(
        long
          ? `    strategy.entry("Long", strategy.long${qty}, alert_message=${alertJson('buy', symbol, slug)})`
          : `    strategy.entry("Short", strategy.short${qty}, alert_message=${alertJson('sell', symbol, slug)})`,
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

  const avg = 'strategy.position_avg_price'
  const exitCall = (long: boolean, stop: string) =>
    `    strategy.exit("${long ? 'XL' : 'XS'}", from_entry="${long ? 'Long' : 'Short'}", ` +
    [stop, useTarget ? `limit=${avg} ${long ? '+' : '-'} sfTakeDist` : ''].filter(Boolean).join(', ') +
    `, alert_message=${alertJson(long ? 'closebuy' : 'closesell', symbol, slug)})`

  if (moving) {
    // The stop lives in sfStop: it starts at the fixed stop (if any), jumps to
    // the entry price at break-even and follows the best price when trailing.
    // It only ever moves in favour of the trade.
    const side = (long: boolean): string[] => {
      const lines: string[] = []
      if (useStop) lines.push('    if na(sfStop)', `        sfStop := ${avg} ${long ? '-' : '+'} sfStopDist`)
      if (useBe) {
        lines.push(
          long ? `    if high >= ${avg} + sfBeDist` : `    if low <= ${avg} - sfBeDist`,
          `        sfStop := math.${long ? 'max' : 'min'}(nz(sfStop, ${avg}), ${avg})`,
        )
      }
      if (useTrail) {
        const level = long ? 'high - sfTrailDist' : 'low + sfTrailDist'
        lines.push(`    sfStop := math.${long ? 'max' : 'min'}(nz(sfStop, ${level}), ${level})`)
      }
      lines.push(exitCall(long, 'stop=sfStop'))
      return lines
    }
    out.push('', '// Protective exits: TradingView sends the close alert when the stop or the target is hit')
    if (hasLong) out.push('if strategy.position_size > 0', ...side(true))
    if (hasShort) out.push(`${hasLong ? 'else if' : 'if'} strategy.position_size < 0`, ...side(false))
    out.push('else', '    sfStop := na')
  } else if (useStop || useTarget) {
    out.push('', '// Protective exits: TradingView sends the close alert when the stop or the target is hit')
    if (hasLong) {
      out.push('if strategy.position_size > 0', exitCall(true, useStop ? `stop=${avg} - sfStopDist` : ''))
    }
    if (hasShort) {
      out.push('if strategy.position_size < 0', exitCall(false, useStop ? `stop=${avg} + sfStopDist` : ''))
    }
  }

  if (maxBars > 0) {
    out.push(
      '',
      `// Time exit: a trade still open after ${maxBars} bars is closed`,
      'var int sfBars = 0',
      'sfBars := strategy.position_size != 0 ? sfBars + 1 : 0',
    )
    if (hasLong) {
      out.push(
        `if strategy.position_size > 0 and sfBars >= ${maxBars}`,
        `    strategy.close("Long", alert_message=${alertJson('closebuy', symbol, slug)})`,
      )
    }
    if (hasShort) {
      out.push(
        `if strategy.position_size < 0 and sfBars >= ${maxBars}`,
        `    strategy.close("Short", alert_message=${alertJson('closesell', symbol, slug)})`,
      )
    }
  }

  if (plotLines.length) out.push('', ...plotLines)
  return { code: out.join('\n') + '\n', warnings, isStrategy, plotMeta, needs }
}
