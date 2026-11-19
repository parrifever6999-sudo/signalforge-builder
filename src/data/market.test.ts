import { describe, it, expect } from 'vitest'
import { parseKlines, isMarket, isTimeframe } from './market'

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
    expect(isMarket('SAMPLE')).toBe(true)
    expect(isMarket('DOGEUSDT&limit=99999')).toBe(false)
    expect(isTimeframe('1h')).toBe(true)
    expect(isTimeframe('1s')).toBe(false)
  })
})
