import { describe, it, expect } from 'vitest'
import {
  segmentStats, splitTrades, splitVerdict, holdoutCut, equityCurve, buyHoldCurve, buyHoldPct, downsample,
  streaks, payoff, monteCarlo, HOLDOUT_RATIO, MIN_TRADES_MC,
} from './robustness'
import type { Candle, Trade } from '../types'

// A trade that returns "pct" percent of the balance, opened on bar "at".
const trade = (pct: number, at = 0, profit = pct * 100): Trade => ({
  entryIndex: at, exitIndex: at + 1, side: 'long', profit, returnPct: pct,
})
const candle = (close: number, i: number): Candle => ({
  open: close, high: close, low: close, close, volume: 1, openTime: i * 1000,
})

describe('segmentStats', () => {
  it('compounds the trades and counts wins and losses', () => {
    const s = segmentStats([trade(10), trade(-5), trade(0), trade(20)])
    expect(s.trades).toBe(4)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(1)
    expect(s.netPct).toBeCloseTo((1.1 * 0.95 * 1.2 - 1) * 100, 10)
    expect(s.profitFactor).toBeCloseTo(30 / 5, 10)
    expect(s.winRate).toBe(50)
    expect(s.avgPct).toBeCloseTo(6.25, 10)
  })

  it('measures the deepest fall from a high', () => {
    // 100 -> 110 -> 99 -> 89.1 -> 98.01: the low is 19% under the 110 high
    const s = segmentStats([trade(10), trade(-10), trade(-10), trade(10)])
    expect(s.maxDrawdownPct).toBeCloseTo(19, 10)
  })

  it('no trades, only wins and only losses do not divide by zero', () => {
    expect(segmentStats([])).toEqual({
      trades: 0, wins: 0, losses: 0, netPct: 0, profitFactor: 0, winRate: 0, maxDrawdownPct: 0, avgPct: 0,
    })
    expect(segmentStats([trade(3), trade(2)]).profitFactor).toBe(Infinity)
    expect(segmentStats([trade(-3)]).profitFactor).toBe(0)
  })

  it('a trade that loses more than the balance stops at zero', () => {
    const s = segmentStats([trade(-150), trade(50)])
    expect(s.netPct).toBe(-100)
    expect(s.maxDrawdownPct).toBe(100)
  })
})

describe('first part against last part', () => {
  it('the cut is at 70% of the candles', () => {
    expect(HOLDOUT_RATIO).toBe(0.7)
    expect(holdoutCut(1000)).toBe(700)
    expect(holdoutCut(3)).toBe(2)
    expect(holdoutCut(0)).toBe(0)
  })

  it('a trade belongs to the part it was closed in', () => {
    // trade(pct, at) opens on bar "at" and closes on the next one
    const trades = [trade(1, 0), trade(1, 698), trade(1, 699), trade(1, 998)]
    const { cut, first, last } = splitTrades(trades, 1000)
    expect(cut).toBe(700)
    expect(first.map((t) => t.exitIndex)).toEqual([1, 699])
    // Opened on the last bar in sight, closed on the first one held back: its
    // result comes from a candle that is hidden.
    expect(last.map((t) => t.exitIndex)).toEqual([700, 999])
    expect(first.length + last.length).toBe(trades.length)
  })

  it('the verdict describes the two parts', () => {
    const good = segmentStats(Array.from({ length: 6 }, () => trade(2)))
    const bad = segmentStats(Array.from({ length: 6 }, () => trade(-2)))
    const thin = segmentStats([trade(50), trade(50)])
    expect(splitVerdict(good, good)).toBe('both')
    expect(splitVerdict(good, bad)).toBe('faded')
    expect(splitVerdict(bad, good)).toBe('late')
    expect(splitVerdict(bad, bad)).toBe('neither')
    // Two trades prove nothing, however good they look.
    expect(splitVerdict(good, thin)).toBe('few')
    expect(splitVerdict(thin, good)).toBe('few')
  })
})

describe('curves', () => {
  it('the balance moves on the bar a trade closes', () => {
    const trades: Trade[] = [
      { entryIndex: 1, exitIndex: 3, side: 'long', profit: 100, returnPct: 1 },
      { entryIndex: 4, exitIndex: 5, side: 'short', profit: -40, returnPct: -0.4 },
    ]
    expect(equityCurve(trades, 7, 10000)).toEqual([10000, 10000, 10000, 10100, 10100, 10060, 10060])
    expect(equityCurve([], 3, 500)).toEqual([500, 500, 500])
    expect(equityCurve(trades, 0, 500)).toEqual([])
  })

  it('buy and hold follows the close', () => {
    const candles = [100, 110, 90, 150].map(candle)
    expect(buyHoldCurve(candles, 10000)).toEqual([10000, 11000, 9000, 15000])
    expect(buyHoldPct(candles)).toBeCloseTo(50, 10)
    expect(buyHoldPct(candles, 1, 3)).toBeCloseTo((90 / 110 - 1) * 100, 10)
    expect(buyHoldPct([])).toBe(0)
    expect(buyHoldCurve([], 10000)).toEqual([])
  })

  it('thinning a series keeps both ends', () => {
    const series = Array.from({ length: 1000 }, (_, i) => i)
    const thin = downsample(series, 50)
    expect(thin).toHaveLength(50)
    expect(thin[0]).toBe(0)
    expect(thin[49]).toBe(999)
    expect(downsample([1, 2, 3], 50)).toEqual([1, 2, 3])
  })
})

describe('streaks and payoff', () => {
  it('finds the longest run of wins and of losses', () => {
    const s = streaks([1, 1, -1, -1, -1, 1, 0, -1, -1].map((p) => trade(p)))
    expect(s).toEqual({ wins: 2, losses: 3 })
    expect(streaks([])).toEqual({ wins: 0, losses: 0 })
  })

  it('compares the average win with the average loss', () => {
    expect(payoff([trade(4), trade(2), trade(-1), trade(-2)])).toBeCloseTo(3 / 1.5, 10)
    expect(payoff([trade(4)])).toBe(0)
    expect(payoff([])).toBe(0)
  })
})

describe('monteCarlo', () => {
  const mixed = [3, -1, 2, -2, 4, -1, -1.5, 2.5, 1, -3, 5, -1].map((p) => trade(p))

  it('needs enough trades to say anything', () => {
    expect(monteCarlo(mixed.slice(0, MIN_TRADES_MC - 1))).toBeNull()
    expect(monteCarlo(mixed.slice(0, MIN_TRADES_MC))).not.toBeNull()
  })

  it('gives the same answer for the same trades', () => {
    expect(monteCarlo(mixed)).toEqual(monteCarlo(mixed))
    expect(monteCarlo(mixed, 500, 1)).not.toEqual(monteCarlo(mixed, 500, 2))
  })

  it('orders its percentiles and stays inside what the trades allow', () => {
    const mc = monteCarlo(mixed)!
    expect(mc.runs).toBe(1000)
    expect(mc.p5).toBeLessThan(mc.p50)
    expect(mc.p50).toBeLessThan(mc.p95)
    expect(mc.ddP50).toBeLessThanOrEqual(mc.ddP95)
    expect(mc.probLoss).toBeGreaterThan(0)
    expect(mc.probLoss).toBeLessThan(100)
    // No run can beat drawing the best trade every time, or lose more than the worst every time.
    expect(mc.p95).toBeLessThan((1.05 ** mixed.length - 1) * 100)
    expect(mc.p5).toBeGreaterThan((0.97 ** mixed.length - 1) * 100)
  })

  it('the middle run is close to what the average trade compounds to', () => {
    const mc = monteCarlo(mixed, 4000)!
    const mean = mixed.reduce((sum, t) => sum + Math.log(1 + t.returnPct / 100), 0) / mixed.length
    const expected = (Math.exp(mean * mixed.length) - 1) * 100
    expect(Math.abs(mc.p50 - expected)).toBeLessThan(2)
  })

  it('trades that all win never end in loss; trades that all lose always do', () => {
    const up = monteCarlo(Array.from({ length: 12 }, () => trade(1)))!
    expect(up.probLoss).toBe(0)
    expect(up.ddP95).toBe(0)
    expect(up.p5).toBeCloseTo((1.01 ** 12 - 1) * 100, 8)
    expect(up.p95).toBeCloseTo(up.p5, 8)
    const down = monteCarlo(Array.from({ length: 12 }, () => trade(-1)))!
    expect(down.probLoss).toBe(100)
    expect(down.ddP50).toBeCloseTo((1 - 0.99 ** 12) * 100, 8)
  })
})
