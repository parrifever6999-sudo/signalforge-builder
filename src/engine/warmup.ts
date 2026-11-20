import type { Candle, HtfNeed, IndicatorKind } from '../types'

const MINUTE = 60000
const DAY = 86400000

// Length of each timeframe the blocks offer and the instant its candles are
// counted from: weeks open on Monday, and 1 January 1970 was a Thursday.
const SPANS: Record<string, { ms: number; from: number }> = {
  '15': { ms: 15 * MINUTE, from: 0 },
  '60': { ms: 60 * MINUTE, from: 0 },
  '240': { ms: 240 * MINUTE, from: 0 },
  D: { ms: DAY, from: 0 },
  W: { ms: 7 * DAY, from: 4 * DAY },
}

/**
 * How many candles of a timeframe finish inside the data: what a block of that
 * timeframe gets to see. A timeframe under the one of the chart moves once per
 * candle.
 */
export function htfCloses(candles: Candle[], tf: string): number {
  const span = SPANS[tf]
  if (!span) return 0
  const bucket = (c: Candle) => Math.floor((c.openTime - span.from) / span.ms)
  let closes = 0
  for (let i = 1; i < candles.length; i++) {
    if (bucket(candles[i]) !== bucket(candles[i - 1])) closes++
  }
  return closes
}

export interface HtfNotice {
  indicator: IndicatorKind
  tf: string
  length: number
  first: number  // finished candles of that timeframe before the first value
  need: number   // and before the start of the data stops weighing on it
  have: number   // those the data loaded holds
  empty: boolean // true = it never gets a value on this data
}

/**
 * Higher-timeframe blocks the data loaded is too short for. An average over 50
 * weeks worked out on 60 weeks of candles depends on the week the data happens
 * to start, and TradingView, which loads another amount of history, shows a
 * different number for it.
 */
export function htfNotices(needs: HtfNeed[], candles: Candle[]): HtfNotice[] {
  const seen = new Set<string>()
  const notices: HtfNotice[] = []
  for (const n of needs) {
    const id = `${n.indicator}|${n.tf}|${n.length}`
    if (seen.has(id)) continue
    seen.add(id)
    const have = htfCloses(candles, n.tf)
    if (have >= n.settle) continue
    notices.push({
      indicator: n.indicator, tf: n.tf, length: n.length, first: n.first, need: n.settle, have, empty: have < n.first,
    })
  }
  return notices
}
