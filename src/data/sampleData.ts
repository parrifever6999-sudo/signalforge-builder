import type { Candle } from '../types'

/**
 * Genera una serie OHLCV sintética pero realista (random walk con tendencia).
 * Permite ejecutar PineTS sin necesidad de conexión a APIs de mercado.
 *
 * @param count  número de velas
 * @param seed   semilla para reproducibilidad
 */
export function generateCandles(count = 300, seed = 42): Candle[] {
  // PRNG determinista (mulberry32)
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
  const stepMs = 24 * 60 * 60 * 1000 // 1 día

  for (let i = 0; i < count; i++) {
    // Componente de tendencia suave + ruido
    const drift = Math.sin(i / 40) * 0.15
    const change = (rand() - 0.5) * 4 + drift
    const open = price
    const close = Math.max(1, open + change)
    const wick = rand() * 2 + 0.2
    const high = Math.max(open, close) + wick
    const low = Math.min(open, close) - rand() * 2 - 0.2
    const volume = 500 + rand() * 1500

    candles.push({
      open: round(open),
      high: round(high),
      low: round(Math.max(0.5, low)),
      close: round(close),
      volume: round(volume),
      openTime: start + i * stepMs,
    })
    price = close
  }

  return candles
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}