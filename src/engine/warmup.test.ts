import { describe, it, expect } from 'vitest'
import { htfCloses, htfNotices } from './warmup'
import { hourlyCandles } from '../codegen/testkit'
import type { Candle } from '../types'

const DAY = 86400000
const daily = (count: number, start = Date.UTC(2024, 0, 1)): Candle[] =>
  Array.from({ length: count }, (_, i) => ({ open: 1, high: 1, low: 1, close: 1, volume: 1, openTime: start + i * DAY }))

describe('candles of a higher timeframe that close inside the data', () => {
  it('counts the 4-hour and the daily candles of an hourly series', () => {
    // 1,000 hours from 00:00: a 4-hour candle closes every 4 bars, a day every 24.
    const candles = hourlyCandles(1000)
    expect(htfCloses(candles, '240')).toBe(249)
    expect(htfCloses(candles, 'D')).toBe(41)
    expect(htfCloses(candles, '60')).toBe(999)
  })

  it('a timeframe under the one of the chart moves once per candle', () => {
    expect(htfCloses(hourlyCandles(300), '15')).toBe(299)
    expect(htfCloses(daily(600), '240')).toBe(599)
  })

  it('weeks start on Monday', () => {
    // 1 January 2024 is a Monday: 28 days hold three closed weeks after the first bar.
    expect(htfCloses(daily(28), 'W')).toBe(3)
    // Starting on a Thursday the first week closes after four days.
    expect(htfCloses(daily(5, Date.UTC(2024, 0, 4)), 'W')).toBe(1)
    expect(htfCloses(daily(4, Date.UTC(2024, 0, 4)), 'W')).toBe(0)
  })

  it('no candles, no count', () => {
    expect(htfCloses([], 'D')).toBe(0)
    expect(htfCloses(daily(1), 'D')).toBe(0)
  })
})

describe('blocks that do not have enough history', () => {
  const ema = (tf: string, length = 50) => ({ indicator: 'htf_ema' as const, tf, length, first: length, settle: length * 3 })
  const rsi = (tf: string, length = 14) => ({ indicator: 'htf_rsi' as const, tf, length, first: length + 1, settle: length * 5 })

  it('says nothing when the data covers it', () => {
    // 3,000 hours are 749 four-hour candles: five times what an EMA 50 asks for.
    expect(htfNotices([ema('240')], hourlyCandles(3000))).toEqual([])
    expect(htfNotices([], hourlyCandles(100))).toEqual([])
  })

  it('a daily EMA 50 on 1,000 hourly candles never gets a value', () => {
    expect(htfNotices([ema('D')], hourlyCandles(1000))).toEqual([
      { indicator: 'htf_ema', tf: 'D', length: 50, first: 50, need: 150, have: 41, empty: true },
    ])
  })

  it('with a value but not settled it is short, not empty', () => {
    // 10,000 hours are 59 weeks: over the 50 it needs to start, far from the 150 to settle.
    const [notice] = htfNotices([ema('W')], hourlyCandles(10000, Date.UTC(2024, 0, 1)))
    expect(notice).toEqual({ indicator: 'htf_ema', tf: 'W', length: 50, first: 50, need: 150, have: 59, empty: false })
    expect(htfNotices([rsi('D')], hourlyCandles(1000))).toEqual([
      { indicator: 'htf_rsi', tf: 'D', length: 14, first: 15, need: 70, have: 41, empty: false },
    ])
  })

  it('the RSI needs one candle more than its length to give its first value', () => {
    // 15 days of hourly candles close 14 daily candles: one short of the first RSI 14.
    expect(htfNotices([rsi('D')], hourlyCandles(15 * 24))[0]).toMatchObject({ have: 14, empty: true })
    expect(htfNotices([rsi('D')], hourlyCandles(16 * 24))[0]).toMatchObject({ have: 15, empty: false })
  })

  it('two blocks alike give one notice', () => {
    expect(htfNotices([ema('D'), ema('D'), ema('D', 20)], hourlyCandles(1000))).toHaveLength(2)
  })
})
