import type { Candle } from '../types'

// Candles come from Binance's public market-data endpoint (no key, CORS open).
// They are spot crypto prices, not the user's broker feed: good enough to see
// how an idea behaves, not a substitute for testing on the real symbol.
const ENDPOINT = 'https://data-api.binance.vision/api/v3/klines'

export const SAMPLE_MARKET = 'SAMPLE'

export const MARKETS: { key: string; label: string }[] = [
  { key: 'BTCUSDT',  label: 'Bitcoin (BTCUSDT)' },
  { key: 'ETHUSDT',  label: 'Ethereum (ETHUSDT)' },
  { key: 'PAXGUSDT', label: 'Gold (PAXGUSDT)' },
  { key: 'EURUSDT',  label: 'Euro (EURUSDT)' },
]

export const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

export const isMarket = (v: unknown): v is string =>
  v === SAMPLE_MARKET || MARKETS.some((m) => m.key === v)
export const isTimeframe = (v: unknown): v is Timeframe =>
  (TIMEFRAMES as readonly unknown[]).includes(v)

/**
 * Turns the raw kline rows into candles. Rows that are malformed are dropped,
 * and so is the candle still forming (its close time is in the future): a
 * backtest on a half-built candle shows signals that can vanish.
 */
export function parseKlines(raw: unknown, now = Date.now()): Candle[] {
  if (!Array.isArray(raw)) return []
  const byTime = new Map<number, Candle>()
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 7) continue
    const openTime = Number(row[0])
    const open = Number(row[1])
    const high = Number(row[2])
    const low = Number(row[3])
    const close = Number(row[4])
    const volume = Number(row[5])
    const closeTime = Number(row[6])
    const all = [openTime, open, high, low, close, volume, closeTime]
    if (!all.every(Number.isFinite)) continue
    if (open <= 0 || close <= 0 || low <= 0 || high < low) continue
    if (high < Math.max(open, close) || low > Math.min(open, close)) continue
    if (closeTime > now) continue
    byTime.set(openTime, { open, high, low, close, volume, openTime, closeTime })
  }
  return [...byTime.values()].sort((a, b) => a.openTime - b.openTime)
}

export async function fetchCandles(
  symbol: string,
  interval: Timeframe,
  limit = 1000,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const url = `${ENDPOINT}?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const candles = parseKlines(await res.json())
  if (candles.length < 50) throw new Error('Not enough candles')
  return candles
}
