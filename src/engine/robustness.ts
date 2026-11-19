import type { Candle, Trade } from '../types'

// Checks that tell an idea with an edge from one that got lucky on the
// candles it was built on. All of it is plain arithmetic on the closed trades
// of a backtest: nothing here can make a strategy look better than it is.

export const HOLDOUT_RATIO = 0.7 // the first 70% of the candles vs the last 30%
export const MIN_TRADES_MC = 10  // under this, reshuffling says nothing
export const MIN_TRADES_SPLIT = 5

export interface SegmentStats {
  trades: number
  wins: number
  losses: number
  netPct: number          // compounded, relative to the balance at the start of the segment
  profitFactor: number    // on per-trade returns; Infinity when nothing was lost
  winRate: number         // 0-100
  maxDrawdownPct: number  // on closed trades
  avgPct: number          // average trade, in percent of the balance
}

// Balance multiplier of a trade; a loss of the whole balance stops at zero.
const factor = (t: { returnPct: number }) => Math.max(0, 1 + t.returnPct / 100)

export function segmentStats(trades: Trade[]): SegmentStats {
  let equity = 1
  let peak = 1
  let maxDd = 0
  let wins = 0
  let losses = 0
  let gain = 0
  let loss = 0
  let sum = 0
  for (const t of trades) {
    equity *= factor(t)
    if (equity > peak) peak = equity
    if (peak > 0) maxDd = Math.max(maxDd, (peak - equity) / peak)
    if (t.returnPct > 0) { wins++; gain += t.returnPct }
    else if (t.returnPct < 0) { losses++; loss -= t.returnPct }
    sum += t.returnPct
  }
  const n = trades.length
  return {
    trades: n,
    wins,
    losses,
    netPct: (equity - 1) * 100,
    profitFactor: loss > 0 ? gain / loss : gain > 0 ? Infinity : 0,
    winRate: n > 0 ? (wins / n) * 100 : 0,
    maxDrawdownPct: maxDd * 100,
    avgPct: n > 0 ? sum / n : 0,
  }
}

// The bar where the held-back part starts.
export const holdoutCut = (bars: number, ratio = HOLDOUT_RATIO) => Math.floor(bars * ratio)

// Trades are sorted by the part of the history they were closed in: a trade
// opened in the first part and closed in the last owes its result to candles
// of the last part, so it cannot count as seen while that part is held back.
export function splitTrades(trades: Trade[], bars: number, ratio = HOLDOUT_RATIO): { cut: number; first: Trade[]; last: Trade[] } {
  const cut = holdoutCut(bars, ratio)
  return {
    cut,
    first: trades.filter((t) => t.exitIndex < cut),
    last: trades.filter((t) => t.exitIndex >= cut),
  }
}

export type SplitVerdict = 'few' | 'both' | 'faded' | 'late' | 'neither'

// What the two halves say together. No verdict is a guarantee: it is a
// description of what happened.
export function splitVerdict(first: SegmentStats, last: SegmentStats): SplitVerdict {
  if (first.trades < MIN_TRADES_SPLIT || last.trades < MIN_TRADES_SPLIT) return 'few'
  const a = first.netPct > 0
  const b = last.netPct > 0
  return a && b ? 'both' : a ? 'faded' : b ? 'late' : 'neither'
}

// Balance after each bar, counting a trade when it closes.
export function equityCurve(trades: Trade[], bars: number, initial: number): number[] {
  const curve = new Array<number>(Math.max(0, bars)).fill(initial)
  const sorted = [...trades].sort((x, y) => x.exitIndex - y.exitIndex)
  let equity = initial
  let k = 0
  for (let i = 0; i < bars; i++) {
    while (k < sorted.length && sorted[k].exitIndex <= i) equity += sorted[k++].profit
    curve[i] = equity
  }
  return curve
}

// What the same balance would be worth just holding the asset.
export function buyHoldCurve(candles: Candle[], initial: number): number[] {
  const base = candles[0]?.close
  return candles.map((c) => (base ? (initial * c.close) / base : initial))
}

export function buyHoldPct(candles: Candle[], from = 0, to = candles.length): number {
  const a = candles[from]?.close
  const b = candles[to - 1]?.close
  return a && b ? (b / a - 1) * 100 : 0
}

// Thins a series out to at most "points" values, keeping the first and the last.
export function downsample(series: number[], points: number): number[] {
  if (series.length <= points || points < 2) return series.slice()
  const out: number[] = []
  for (let k = 0; k < points; k++) out.push(series[Math.round((k * (series.length - 1)) / (points - 1))])
  return out
}

export function streaks(trades: Trade[]): { wins: number; losses: number } {
  let wins = 0
  let losses = 0
  let w = 0
  let l = 0
  for (const t of trades) {
    if (t.returnPct > 0) { w++; l = 0 } else if (t.returnPct < 0) { l++; w = 0 } else { w = 0; l = 0 }
    if (w > wins) wins = w
    if (l > losses) losses = l
  }
  return { wins, losses }
}

// Average win against average loss. 0 when there is nothing to compare.
export function payoff(trades: Trade[]): number {
  let gain = 0
  let wins = 0
  let loss = 0
  let losses = 0
  for (const t of trades) {
    if (t.returnPct > 0) { gain += t.returnPct; wins++ } else if (t.returnPct < 0) { loss -= t.returnPct; losses++ }
  }
  return wins > 0 && losses > 0 ? gain / wins / (loss / losses) : 0
}

export interface MonteCarlo {
  runs: number
  p5: number        // net result with bad luck (5 in 100 runs ended worse)
  p50: number       // the middle run
  p95: number       // with good luck
  ddP50: number     // max drawdown of the middle run
  ddP95: number     // 5 in 100 runs had a deeper one
  probLoss: number  // share of runs that ended under the starting balance, 0-100
}

// Deterministic PRNG (mulberry32): the same trades always give the same answer.
function prng(seed: number): () => number {
  let s = seed
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]

/**
 * Monte Carlo by resampling: each run draws as many trades as the backtest
 * had, at random and with repetition, and compounds them. The backtest is one
 * path through those trades; this shows how wide the range of paths is.
 */
export function monteCarlo(trades: Trade[], runs = 1000, seed = 7): MonteCarlo | null {
  const n = trades.length
  if (n < MIN_TRADES_MC || runs < 1) return null
  const factors = trades.map(factor)
  const rand = prng(seed)
  const finals: number[] = []
  const dds: number[] = []
  let lost = 0
  for (let r = 0; r < runs; r++) {
    let equity = 1
    let peak = 1
    let maxDd = 0
    for (let i = 0; i < n; i++) {
      equity *= factors[Math.floor(rand() * n)]
      if (equity > peak) peak = equity
      else if (peak > 0) maxDd = Math.max(maxDd, (peak - equity) / peak)
    }
    finals.push((equity - 1) * 100)
    dds.push(maxDd * 100)
    if (equity < 1) lost++
  }
  finals.sort((a, b) => a - b)
  dds.sort((a, b) => a - b)
  return {
    runs,
    p5: percentile(finals, 0.05),
    p50: percentile(finals, 0.5),
    p95: percentile(finals, 0.95),
    ddP50: percentile(dds, 0.5),
    ddP95: percentile(dds, 0.95),
    probLoss: (lost / runs) * 100,
  }
}
