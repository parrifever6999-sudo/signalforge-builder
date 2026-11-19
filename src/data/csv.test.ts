import { describe, it, expect } from 'vitest'
import { parseCsv, parseTime, inferTimeframe, timeframeLabel, decodeText, MAX_CSV_CANDLES } from './csv'
import type { Candle } from '../types'

const HOUR = 3600000
const pad = (n: number) => String(n).padStart(2, '0')

// "count" hourly rows from 2024-01-02 00:00, written by "row".
function rows(count: number, row: (d: Date, i: number, price: number) => string): string[] {
  return Array.from({ length: count }, (_, i) => row(new Date(Date.UTC(2024, 0, 2) + i * HOUR), i, 2000 + i))
}

const mt5Date = (d: Date) => `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`
const clock = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`

describe('parseTime', () => {
  it('reads the formats the platforms export', () => {
    const want = Date.UTC(2024, 0, 2, 3, 4, 5)
    expect(parseTime('2024.01.02', '03:04:05')).toBe(want)
    expect(parseTime('2024.01.02 03:04:05')).toBe(want)
    expect(parseTime('2024-01-02 03:04:05')).toBe(want)
    expect(parseTime('2024-01-02T03:04:05Z')).toBe(want)
    expect(parseTime('2024-01-02T05:04:05+02:00')).toBe(want)
    expect(parseTime(String(want / 1000))).toBe(want) // seconds, as TradingView writes them
    expect(parseTime(String(want))).toBe(want) // milliseconds
    expect(parseTime('2024.01.02', '03:04')).toBe(Date.UTC(2024, 0, 2, 3, 4))
    expect(parseTime('2024-01-02')).toBe(Date.UTC(2024, 0, 2))
  })

  it('tells day-first from month-first', () => {
    const want = Date.UTC(2024, 11, 31)
    expect(parseTime('31.12.2024')).toBe(want)
    expect(parseTime('31/12/2024')).toBe(want)
    expect(parseTime('12/31/2024')).toBe(want)
    // With dots it is the European order; with a slash and both under 13, the American one.
    expect(parseTime('05.06.2024')).toBe(Date.UTC(2024, 5, 5))
    expect(parseTime('05/06/2024')).toBe(Date.UTC(2024, 4, 6))
  })

  it('refuses what is not a date', () => {
    expect(parseTime('hello')).toBeNaN()
    expect(parseTime('2024.13.40')).toBeNaN()
    expect(parseTime('')).toBeNaN()
  })
})

describe('parseCsv', () => {
  it('reads a MetaTrader 5 export (tabs, <DATE> <TIME>, two volume columns)', () => {
    const text = [
      '<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>',
      ...rows(60, (d, _i, p) => `${mt5Date(d)}\t${clock(d)}\t${p}\t${p + 5}\t${p - 5}\t${p + 1}\t321\t0\t12`),
    ].join('\r\n')
    const out = parseCsv(text)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.candles).toHaveLength(60)
    expect(out.timeframe).toBe('60')
    expect(out.skipped).toBe(0)
    expect(out.candles[0]).toEqual({
      open: 2000, high: 2005, low: 1995, close: 2001, volume: 321,
      openTime: Date.UTC(2024, 0, 2), closeTime: Date.UTC(2024, 0, 2, 1) - 1,
    })
  })

  it('reads a TradingView export (time in seconds, extra columns)', () => {
    const text = [
      'time,open,high,low,close,EMA,Volume',
      ...rows(80, (d, _i, p) => `${d.getTime() / 1000},${p},${p + 2},${p - 2},${p + 1},${p},1500`),
    ].join('\n')
    const out = parseCsv(text)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.candles).toHaveLength(80)
    expect(out.candles[79].openTime).toBe(Date.UTC(2024, 0, 2) + 79 * HOUR)
    expect(out.candles[0].volume).toBe(1500)
  })

  it('reads a TradingView export with ISO times', () => {
    const text = [
      'time,open,high,low,close',
      ...rows(60, (d, _i, p) => `${d.toISOString().replace('.000Z', 'Z')},${p},${p + 2},${p - 2},${p + 1}`),
    ].join('\n')
    const out = parseCsv(text)
    expect(out.ok && out.candles[1].openTime).toBe(Date.UTC(2024, 0, 2, 1))
  })

  it('reads a MetaTrader 4 export (no header, date and time apart)', () => {
    const text = rows(60, (d, _i, p) => `${mt5Date(d)},${pad(d.getUTCHours())}:00,${p},${p + 3},${p - 3},${p + 1},88`).join('\n')
    const out = parseCsv(text)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.candles[5]).toMatchObject({ open: 2005, high: 2008, low: 2002, close: 2006, volume: 88 })
    expect(out.candles[5].openTime).toBe(Date.UTC(2024, 0, 2, 5))
  })

  it('reads semicolons with decimal commas', () => {
    const text = [
      'Date;Open;High;Low;Close;Volume',
      ...rows(60, (d, i) => `${mt5Date(d)} ${clock(d)};1,${1000 + i};1,${1100 + i};1,0${900 + i};1,${1050 + i};10`),
    ].join('\n')
    const out = parseCsv(text)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.candles[0]).toMatchObject({ open: 1.1, high: 1.11, low: 1.09, close: 1.105 })
  })

  it('sorts the rows, keeps one per time and skips the broken ones', () => {
    const good = rows(60, (d, _i, p) => `${d.getTime() / 1000},${p},${p + 2},${p - 2},${p + 1}`)
    const text = [
      'time,open,high,low,close',
      ...good.slice().reverse(),
      good[10].replace(/,\d+,/, ',9999,'), // the same time again: the later row wins
      '1704200000,abc,1,1,1',
      '1704300000,10,5,20,12', // high below low
      '1704400000,10,11,9,15', // close above high
      'not a date,10,11,9,10',
      '',
    ].join('\n')
    const out = parseCsv(text)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.candles).toHaveLength(60)
    expect(out.skipped).toBe(5) // the duplicate was built to be invalid as well
    const times = out.candles.map((c) => c.openTime)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('keeps the newest candles of a very long file', () => {
    const text = [
      'time,open,high,low,close',
      ...rows(MAX_CSV_CANDLES + 500, (d, _i, p) => `${d.getTime() / 1000},${p},${p + 2},${p - 2},${p + 1}`),
    ].join('\n')
    const out = parseCsv(text)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.candles).toHaveLength(MAX_CSV_CANDLES)
    expect(out.candles[0].open).toBe(2500)
  })

  it('weekend gaps do not stretch a candle', () => {
    // Daily candles, Monday to Friday.
    const days: string[] = []
    for (let i = 0; days.length < 60; i++) {
      const d = new Date(Date.UTC(2024, 0, 1) + i * 24 * HOUR)
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(`${mt5Date(d)},100,101,99,100,5`)
    }
    const out = parseCsv(['Date,Open,High,Low,Close,Volume', ...days].join('\n'))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.timeframe).toBe('D')
    const friday = out.candles[4]
    expect(new Date(friday.openTime).getUTCDay()).toBe(5)
    expect(friday.closeTime).toBe(friday.openTime + 24 * HOUR - 1)
  })

  it('says what is wrong with a file it cannot use', () => {
    expect(parseCsv('')).toEqual({ ok: false, error: 'csv.empty' })
    expect(parseCsv('\n\n  \n')).toEqual({ ok: false, error: 'csv.empty' })
    expect(parseCsv('name,city\nAna,Madrid\nLuis,Vigo')).toEqual({ ok: false, error: 'csv.columns' })
    expect(parseCsv('just some text')).toEqual({ ok: false, error: 'csv.columns' })
    const few = ['time,open,high,low,close', ...rows(10, (d, _i, p) => `${d.getTime() / 1000},${p},${p + 2},${p - 2},${p + 1}`)]
    expect(parseCsv(few.join('\n'))).toEqual({ ok: false, error: 'csv.few' })
  })

  it('a byte-order mark at the start does not hide the header', () => {
    const text = String.fromCharCode(0xfeff) + [
      'time,open,high,low,close',
      ...rows(60, (d, _i, p) => `${d.getTime() / 1000},${p},${p + 2},${p - 2},${p + 1}`),
    ].join('\n')
    expect(parseCsv(text).ok).toBe(true)
  })
})

describe('inferTimeframe', () => {
  const series = (stepMs: number, count = 30): Candle[] =>
    Array.from({ length: count }, (_, i) => ({ open: 1, high: 1, low: 1, close: 1, volume: 0, openTime: i * stepMs }))

  it('names the usual gap between candles the way Pine does', () => {
    expect(inferTimeframe(series(60000))).toBe('1')
    expect(inferTimeframe(series(5 * 60000))).toBe('5')
    expect(inferTimeframe(series(HOUR))).toBe('60')
    expect(inferTimeframe(series(4 * HOUR))).toBe('240')
    expect(inferTimeframe(series(24 * HOUR))).toBe('D')
    expect(inferTimeframe(series(7 * 24 * HOUR))).toBe('W')
    expect(inferTimeframe(series(30 * 24 * HOUR))).toBe('M')
    expect(inferTimeframe([])).toBe('D')
  })

  it('a few gaps (weekends, holidays) do not change the answer', () => {
    const candles = series(HOUR, 100)
    for (let i = 50; i < 100; i++) candles[i].openTime += 48 * HOUR
    expect(inferTimeframe(candles)).toBe('60')
  })

  it('is shown the way the rest of the app shows timeframes', () => {
    expect(timeframeLabel('60')).toBe('1h')
    expect(timeframeLabel('240')).toBe('4h')
    expect(timeframeLabel('15')).toBe('15m')
    expect(timeframeLabel('D')).toBe('1d')
    expect(timeframeLabel('W')).toBe('1w')
  })
})

describe('decodeText', () => {
  const text = '<DATE>\t<OPEN>\n2024.01.02\t1.1'
  const utf16 = (littleEndian: boolean, bom: boolean) => {
    const buf = new ArrayBuffer((text.length + (bom ? 1 : 0)) * 2)
    const view = new DataView(buf)
    let at = 0
    if (bom) { view.setUint16(0, 0xfeff, littleEndian); at = 2 }
    for (let i = 0; i < text.length; i++) view.setUint16(at + i * 2, text.charCodeAt(i), littleEndian)
    return buf
  }
  const clean = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)

  it('reads UTF-8', () => {
    expect(decodeText(new TextEncoder().encode(text).buffer as ArrayBuffer)).toBe(text)
  })

  it('reads the UTF-16 files MetaTrader writes, with or without a mark', () => {
    expect(clean(decodeText(utf16(true, true)))).toBe(text)
    expect(clean(decodeText(utf16(false, true)))).toBe(text)
    expect(clean(decodeText(utf16(true, false)))).toBe(text)
  })
})
