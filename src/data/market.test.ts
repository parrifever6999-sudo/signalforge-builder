import { describe, it, expect } from 'vitest'
import {
  parseKlines, mergeCandles, fetchCandles, isMarket, isTimeframe, isDepth, marketOf, pineTimeframe,
  MARKETS, MARKET_GROUPS, TIMEFRAMES, DEPTHS, DEFAULT_DEPTH, CUSTOM_MARKET,
} from './market'

const row = (t: number, o: string, h: string, l: string, c: string, closeTime = t + 3599999) =>
  [t, o, h, l, c, '12.5', closeTime, '0', 10, '0', '0', '0']

describe('parseKlines', () => {
  const now = 1_800_000_000_000

  it('reads the exchange rows into candles', () => {
    const out = parseKlines([row(1000, '10', '12', '9', '11')], now)
    expect(out).toEqual([
      { openTime: 1000, open: 10, high: 12, low: 9, close: 11, volume: 12.5, closeTime: 3600999 },
    ])
  })

  it('drops the candle that is still forming', () => {
    const forming = row(now - 10, '11', '12', '10', '11', now + 5000)
    const out = parseKlines([row(1000, '10', '12', '9', '11'), forming], now)
    expect(out).toHaveLength(1)
  })

  it('drops malformed rows instead of failing', () => {
    const out = parseKlines(
      [
        row(1000, '10', '12', '9', '11'),
        ['x'],
        null,
        row(2000, 'abc', '12', '9', '11'),
        row(3000, '10', '8', '9', '11'), // high below low
        row(4000, '10', '10.5', '9', '11'), // close above high
        row(5000, '0', '12', '9', '11'), // zero price
      ],
      now,
    )
    expect(out.map((c) => c.openTime)).toEqual([1000])
  })

  it('sorts by time and keeps one candle per timestamp', () => {
    const out = parseKlines(
      [row(3000, '10', '12', '9', '11'), row(1000, '10', '12', '9', '11'), row(3000, '10', '13', '9', '12')],
      now,
    )
    expect(out.map((c) => c.openTime)).toEqual([1000, 3000])
    expect(out[1].close).toBe(12)
  })

  it('anything that is not a list gives no candles', () => {
    expect(parseKlines({ code: -1121, msg: 'Invalid symbol.' }, now)).toEqual([])
    expect(parseKlines(undefined, now)).toEqual([])
  })
})

describe('market guards', () => {
  it('accept only what the app offers', () => {
    expect(isMarket('BTCUSDT')).toBe(true)
    expect(isMarket('XAUUSDT')).toBe(true)
    expect(isMarket('SAMPLE')).toBe(true)
    expect(isMarket('DOGEUSDT&limit=99999')).toBe(false)
    expect(isTimeframe('1h')).toBe(true)
    expect(isTimeframe('1s')).toBe(false)
    expect(isDepth(5000)).toBe(true)
    expect(isDepth(123456)).toBe(false)
    expect(isDepth('5000')).toBe(false)
  })

  // A file lives in memory only: a saved strategy or a link cannot ask for it.
  it('a loaded file is not a market a saved strategy can name', () => {
    expect(isMarket(CUSTOM_MARKET)).toBe(false)
  })

  it('every market has a group the menu shows and a place to load it from', () => {
    const keys = MARKETS.map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const m of MARKETS) {
      expect(MARKET_GROUPS).toContain(m.group)
      expect(['spot', 'futures']).toContain(m.venue)
      expect(m.key).toMatch(/^[A-Z0-9]{5,12}$/)
    }
    for (const g of MARKET_GROUPS) expect(MARKETS.some((m) => m.group === g)).toBe(true)
    expect(marketOf('XAUUSDT')?.venue).toBe('futures')
    expect(marketOf('nope')).toBeUndefined()
  })

  it('timeframes have their Pine name and the default depth is one on offer', () => {
    expect(TIMEFRAMES.map(pineTimeframe)).toEqual(['5', '15', '30', '60', '240', 'D'])
    expect(DEPTHS).toContain(DEFAULT_DEPTH)
  })
})

describe('mergeCandles', () => {
  it('joins pages into one sorted series without repeats', () => {
    const c = (t: number, close = 1) => ({ openTime: t, open: 1, high: 1, low: 1, close, volume: 0 })
    const out = mergeCandles([[c(3000), c(4000)], [c(1000), c(2000), c(3000, 7)]])
    expect(out.map((x) => x.openTime)).toEqual([1000, 2000, 3000, 4000])
    expect(out[2].close).toBe(7)
  })
})

describe('fetchCandles', () => {
  const HOUR = 3600000
  const T0 = 1_600_000_000_000 // long past: every candle is closed

  // An exchange that has "listed" hourly candles and answers like Binance:
  // at most "limit" rows ending at endTime, oldest first.
  function exchange(listed: number, failAt = -1) {
    const calls: string[] = []
    const fetcher = async (url: string) => {
      calls.push(url)
      if (calls.length - 1 === failAt) return { ok: false, status: 429, json: async () => ({}) }
      const q = new URL(url).searchParams
      const limit = Number(q.get('limit'))
      const end = q.has('endTime') ? Number(q.get('endTime')) : Infinity
      const all = Array.from({ length: listed }, (_, i) => row(T0 + i * HOUR, '10', '12', '9', '11'))
      return { ok: true, status: 200, json: async () => all.filter((r) => (r[0] as number) <= end).slice(-limit) }
    }
    return { calls, fetcher }
  }

  it('one request is enough for 1,000 candles', async () => {
    const { calls, fetcher } = exchange(5000)
    const out = await fetchCandles('BTCUSDT', '1h', 1000, undefined, fetcher)
    expect(out).toHaveLength(1000)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe('https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000')
    expect(out[999].openTime).toBe(T0 + 4999 * HOUR)
  })

  it('longer histories are read page by page, going back in time', async () => {
    const { calls, fetcher } = exchange(5000)
    const out = await fetchCandles('BTCUSDT', '1h', 3000, undefined, fetcher)
    expect(calls).toHaveLength(3)
    expect(calls[1]).toContain(`&endTime=${T0 + 4000 * HOUR - 1}`)
    expect(calls[2]).toContain(`&endTime=${T0 + 3000 * HOUR - 1}`)
    expect(out).toHaveLength(3000)
    // One unbroken series: every candle one hour after the one before.
    for (let i = 1; i < out.length; i++) expect(out[i].openTime - out[i - 1].openTime).toBe(HOUR)
    expect(out[0].openTime).toBe(T0 + 2000 * HOUR)
    expect(out[2999].openTime).toBe(T0 + 4999 * HOUR)
  })

  it('a market listed recently gives what it has and stops asking', async () => {
    const { calls, fetcher } = exchange(1400)
    const out = await fetchCandles('BTCUSDT', '1h', 10000, undefined, fetcher)
    expect(out).toHaveLength(1400)
    expect(calls).toHaveLength(2)
  })

  it('a market with exactly one page stops at the empty answer', async () => {
    const { calls, fetcher } = exchange(1000)
    const out = await fetchCandles('BTCUSDT', '1h', 3000, undefined, fetcher)
    expect(out).toHaveLength(1000)
    expect(calls).toHaveLength(2)
  })

  it('gold and the stock contracts come from the futures endpoint', async () => {
    const { calls, fetcher } = exchange(1200)
    await fetchCandles('XAUUSDT', '4h', 1000, undefined, fetcher)
    expect(calls[0]).toBe('https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval=4h&limit=1000')
  })

  it('a failure on the first request is an error', async () => {
    const { fetcher } = exchange(5000, 0)
    await expect(fetchCandles('BTCUSDT', '1h', 3000, undefined, fetcher)).rejects.toThrow('HTTP 429')
  })

  it('a failure on a later page keeps what was already read', async () => {
    const { calls, fetcher } = exchange(5000, 2)
    const out = await fetchCandles('BTCUSDT', '1h', 5000, undefined, fetcher)
    expect(calls).toHaveLength(3)
    expect(out).toHaveLength(2000)
  })

  it('too few candles to test anything is an error', async () => {
    const { fetcher } = exchange(20)
    await expect(fetchCandles('BTCUSDT', '1h', 1000, undefined, fetcher)).rejects.toThrow('Not enough candles')
  })
})
