import type { Candle } from '../types'

// Candles come from Binance's public market-data endpoints (no key, CORS open):
// spot for crypto, and its perpetual futures for gold, silver, oil and the
// index and stock contracts. They are not the user's broker feed: good enough
// to see how an idea behaves, not a substitute for testing on the real symbol.
// A broker's own history can be loaded from a CSV file (see csv.ts).
export type Venue = 'spot' | 'futures'

const ENDPOINTS: Record<Venue, string> = {
  spot: 'https://data-api.binance.vision/api/v3/klines',
  futures: 'https://fapi.binance.com/fapi/v1/klines',
}

export const SAMPLE_MARKET = 'SAMPLE'
export const CUSTOM_MARKET = 'CUSTOM' // candles from a file the user loaded

export type MarketGroup = 'crypto' | 'commodities' | 'stocks' | 'fx'

export interface Market {
  key: string
  label: string
  venue: Venue
  group: MarketGroup
}

export const MARKETS: Market[] = [
  { key: 'BTCUSDT',  label: 'Bitcoin (BTCUSDT)',  venue: 'spot', group: 'crypto' },
  { key: 'ETHUSDT',  label: 'Ethereum (ETHUSDT)', venue: 'spot', group: 'crypto' },
  { key: 'SOLUSDT',  label: 'Solana (SOLUSDT)',   venue: 'spot', group: 'crypto' },
  { key: 'XRPUSDT',  label: 'XRP (XRPUSDT)',      venue: 'spot', group: 'crypto' },
  { key: 'BNBUSDT',  label: 'BNB (BNBUSDT)',      venue: 'spot', group: 'crypto' },

  { key: 'XAUUSDT',  label: 'Gold (XAUUSDT)',          venue: 'futures', group: 'commodities' },
  { key: 'XAGUSDT',  label: 'Silver (XAGUSDT)',        venue: 'futures', group: 'commodities' },
  { key: 'CLUSDT',   label: 'Crude oil WTI (CLUSDT)',  venue: 'futures', group: 'commodities' },
  { key: 'PAXGUSDT', label: 'Gold token (PAXGUSDT)',   venue: 'spot',    group: 'commodities' },

  { key: 'SPYUSDT',  label: 'S&P 500 (SPYUSDT)',    venue: 'futures', group: 'stocks' },
  { key: 'QQQUSDT',  label: 'Nasdaq 100 (QQQUSDT)', venue: 'futures', group: 'stocks' },
  { key: 'NVDAUSDT', label: 'Nvidia (NVDAUSDT)',    venue: 'futures', group: 'stocks' },
  { key: 'TSLAUSDT', label: 'Tesla (TSLAUSDT)',     venue: 'futures', group: 'stocks' },

  { key: 'EURUSDT',  label: 'Euro (EURUSDT)', venue: 'spot', group: 'fx' },
]

export const MARKET_GROUPS: MarketGroup[] = ['crypto', 'commodities', 'stocks', 'fx']

export const TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1d'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

// The same timeframes as Pine names them.
const PINE_TF: Record<Timeframe, string> = { '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D' }
export const pineTimeframe = (tf: Timeframe): string => PINE_TF[tf]

// How many candles to load. More candles, more trades, and a result that says more.
export const DEPTHS = [1000, 3000, 5000, 10000] as const
export const DEFAULT_DEPTH = 3000
const PAGE = 1000 // most rows the exchange gives per request

export const marketOf = (key: string): Market | undefined => MARKETS.find((m) => m.key === key)
export const isMarket = (v: unknown): v is string =>
  v === SAMPLE_MARKET || MARKETS.some((m) => m.key === v)
export const isTimeframe = (v: unknown): v is Timeframe =>
  (TIMEFRAMES as readonly unknown[]).includes(v)
export const isDepth = (v: unknown): v is number => (DEPTHS as readonly unknown[]).includes(v)

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

// Joins pages of candles into one series: sorted, one candle per timestamp.
export function mergeCandles(pages: Candle[][]): Candle[] {
  const byTime = new Map<number, Candle>()
  for (const page of pages) for (const c of page) byTime.set(c.openTime, c)
  return [...byTime.values()].sort((a, b) => a.openTime - b.openTime)
}

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

/**
 * Loads up to "limit" closed candles, newest last. The exchange gives 1,000
 * per request, so longer histories are read page by page, going back in time.
 * A market listed recently simply returns what it has.
 */
export async function fetchCandles(
  symbol: string,
  interval: Timeframe,
  limit: number = DEFAULT_DEPTH,
  signal?: AbortSignal,
  fetcher: Fetcher = (url, init) => fetch(url, init),
): Promise<Candle[]> {
  const endpoint = ENDPOINTS[marketOf(symbol)?.venue ?? 'spot']
  const pages: Candle[][] = []
  let endTime: number | null = null
  let have = 0

  while (have < limit) {
    const url: string =
      `${endpoint}?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${PAGE}` +
      (endTime === null ? '' : `&endTime=${endTime}`)
    const res = await fetcher(url, { signal })
    if (!res.ok) {
      if (pages.length) break // keep what was already read
      throw new Error(`HTTP ${res.status}`)
    }
    const raw = await res.json()
    const page = parseKlines(raw)
    if (page.length === 0) break
    pages.push(page)
    have += page.length
    endTime = page[0].openTime - 1
    if (!Array.isArray(raw) || raw.length < PAGE) break // the start of the listing
  }

  const candles = mergeCandles(pages).slice(-limit)
  if (candles.length < 50) throw new Error('Not enough candles')
  return candles
}
