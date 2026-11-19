import type { Candle } from '../types'

/**
 * A made-up but plausible OHLCV series (random walk with a slow drift). It
 * lets the engine run with no network, and it is always the same for a given
 * seed, so tests can rely on it.
 */
export function generateCandles(count = 300, seed = 42): Candle[] {
  // Deterministic PRNG (mulberry32)
  let s = seed
  const rand = () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const candles: Candle[] = []
  let price = 100
  const start = 1704067200000 // 2024-01-01 UTC
  const stepMs = 24 * 60 * 60 * 1000 // one day

  for (let i = 0; i < count; i++) {
    const drift = Math.sin(i / 40) * 0.15
    const change = (rand() - 0.5) * 4 + drift
    const open = price
    const close = Math.max(1, open + change)
    const wick = rand() * 2 + 0.2
    const high = Math.max(open, close) + wick
    const low = Math.min(open, close) - rand() * 2 - 0.2

    candles.push({
      open: round(open),
      high: round(high),
      low: round(Math.max(0.5, low)),
      close: round(close),
      volume: round(500 + rand() * 1500),
      openTime: start + i * stepMs,
      closeTime: start + (i + 1) * stepMs - 1,
    })
    price = close
  }

  return candles
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
