import type { Candle } from '../types'

// Reads a price history exported as text: MetaTrader 5 (View > Symbols > Bars),
// MetaTrader 4, TradingView (Export chart data) or any CSV with date, open,
// high, low and close columns. Everything happens in the browser; the file is
// never sent anywhere.

export const MAX_CSV_CANDLES = 20000
const MAX_LINES = 600000
const MIN_CANDLES = 50

export type CsvError = 'csv.empty' | 'csv.columns' | 'csv.few'

export type CsvOutcome =
  | { ok: true; candles: Candle[]; timeframe: string; skipped: number }
  | { ok: false; error: CsvError }

interface Columns {
  date: number
  time: number // -1 when the date column already carries the time
  open: number
  high: number
  low: number
  close: number
  volume: number[] // MetaTrader has two: real volume and tick volume
}

const DAY = 86400000

function splitLine(line: string, sep: string): string[] {
  return line.split(sep).map((c) => c.trim().replace(/^["'<]+|["'>]+$/g, ''))
}

function detectSeparator(line: string): string {
  const count = (ch: string) => line.split(ch).length - 1
  if (count('\t') >= 4) return '\t'
  if (count(';') >= 4) return ';'
  return ','
}

// Decimal comma only makes sense when the comma is not the separator.
function toNumber(cell: string, sep: string): number {
  if (cell === '') return NaN
  return Number(sep === ',' ? cell : cell.replace(',', '.'))
}

const isNumeric = (cell: string) => cell !== '' && Number.isFinite(Number(cell.replace(',', '.')))
const looksLikeClock = (cell: string) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(cell)

/**
 * A date (and optionally a clock time) to milliseconds. Times without a zone
 * are read as UTC: the file does not say which zone the broker uses, and UTC
 * keeps the candles in the order and spacing they have in the file.
 */
export function parseTime(date: string, clock = ''): number {
  const d = date.trim()
  if (/^\d+(\.\d+)?$/.test(d) && !clock) {
    const n = Number(d)
    return n > 1e11 ? n : n * 1000 // milliseconds, or seconds as TradingView exports them
  }
  // 2024-01-02T03:04:05Z or with an offset: the zone is in the text.
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/i.test(d)) return Date.parse(d)

  let rest = d
  let time = clock.trim()
  const joined = /^(\S+)[ T](\d{1,2}:\d{2}(?::\d{2})?)/.exec(d)
  if (joined) { rest = joined[1]; time = joined[2] }

  let y: number
  let m: number
  let day: number
  let parts = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/.exec(rest)
  if (parts) {
    y = Number(parts[1]); m = Number(parts[2]); day = Number(parts[3])
  } else {
    parts = /^(\d{1,2})([.\-/])(\d{1,2})[.\-/](\d{4})$/.exec(rest)
    if (!parts) return NaN
    const first = Number(parts[1])
    const second = Number(parts[3])
    y = Number(parts[4])
    // 31.12.2024 is day first; 12/31/2024 is month first. With a slash and
    // both under 13 it is read the American way.
    const dayFirst = parts[2] !== '/' ? second <= 12 : first > 12
    day = dayFirst ? first : second
    m = dayFirst ? second : first
  }
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time)
  if (m < 1 || m > 12 || day < 1 || day > 31) return NaN
  return Date.UTC(y, m - 1, day, t ? Number(t[1]) : 0, t ? Number(t[2]) : 0, t && t[3] ? Number(t[3]) : 0)
}

function fromHeader(cells: string[]): Columns | null {
  const names = cells.map((c) => c.toLowerCase().replace(/[^a-z]/g, ''))
  const find = (...wanted: string[]) => names.findIndex((n) => wanted.includes(n))
  const open = find('open', 'o')
  const high = find('high', 'h')
  const low = find('low', 'l')
  const close = find('close', 'c', 'last')
  const dated = find('date', 'datetime', 'timestamp', 'gmttime', 'localtime')
  const timed = find('time')
  const date = dated >= 0 ? dated : timed
  if (open < 0 || high < 0 || low < 0 || close < 0 || date < 0) return null
  const volume = names
    .map((n, i) => (['volume', 'vol', 'tickvol', 'tickvolume', 'realvolume'].includes(n) ? i : -1))
    .filter((i) => i >= 0)
  return { date, time: dated >= 0 && timed >= 0 ? timed : -1, open, high, low, close, volume }
}

// Without a header: date, [time], open, high, low, close, [volume].
function byPosition(cells: string[]): Columns | null {
  if (cells.length < 5) return null
  const split = cells.length >= 6 && looksLikeClock(cells[1])
  const at = split ? 2 : 1
  return {
    date: 0,
    time: split ? 1 : -1,
    open: at, high: at + 1, low: at + 2, close: at + 3,
    volume: cells.length > at + 4 ? [at + 4] : [],
  }
}

const TF_MINUTES = [1, 2, 3, 5, 10, 15, 30, 45, 60, 120, 180, 240, 360, 480, 720, 1440, 10080, 43200]

// The Pine timeframe closest to the usual gap between two candles.
export function inferTimeframe(candles: Candle[]): string {
  const gaps: number[] = []
  for (let i = 1; i < candles.length; i++) gaps.push(candles[i].openTime - candles[i - 1].openTime)
  if (gaps.length === 0) return 'D'
  gaps.sort((a, b) => a - b)
  const minutes = gaps[Math.floor(gaps.length / 2)] / 60000
  let best = TF_MINUTES[0]
  for (const tf of TF_MINUTES) if (Math.abs(tf - minutes) < Math.abs(best - minutes)) best = tf
  return best >= 43200 ? 'M' : best >= 10080 ? 'W' : best >= 1440 ? 'D' : String(best)
}

// '60' -> '1h', '240' -> '4h', 'D' -> '1d': how the app shows a Pine timeframe.
export function timeframeLabel(tf: string): string {
  if (tf === 'D') return '1d'
  if (tf === 'W') return '1w'
  if (tf === 'M') return '1mo'
  const minutes = Number(tf)
  if (!Number.isFinite(minutes)) return tf
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`
}

// MetaTrader sometimes writes its exports as UTF-16; everything else is UTF-8.
export function decodeText(buffer: ArrayBuffer): string {
  const b = new Uint8Array(buffer.slice(0, 4))
  const utf16le = (b[0] === 0xff && b[1] === 0xfe) || (b.length >= 4 && b[0] !== 0 && b[1] === 0 && b[3] === 0)
  const utf16be = b[0] === 0xfe && b[1] === 0xff
  return new TextDecoder(utf16le ? 'utf-16le' : utf16be ? 'utf-16be' : 'utf-8').decode(buffer)
}

export function parseCsv(text: string): CsvOutcome {
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, MAX_LINES)
  if (lines.length === 0) return { ok: false, error: 'csv.empty' }

  const sep = detectSeparator(lines[0])
  const first = splitLine(lines[0], sep)
  // A header has names where the prices would be.
  const hasHeader = first.slice(1).some((c) => c !== '' && !isNumeric(c) && !looksLikeClock(c))
  const cols = hasHeader ? fromHeader(first) : byPosition(first)
  if (!cols) return { ok: false, error: 'csv.columns' }

  const byTime = new Map<number, Candle>()
  let skipped = 0
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const cells = splitLine(lines[i], sep)
    const openTime = parseTime(cells[cols.date] ?? '', cols.time >= 0 ? cells[cols.time] ?? '' : '')
    const open = toNumber(cells[cols.open] ?? '', sep)
    const high = toNumber(cells[cols.high] ?? '', sep)
    const low = toNumber(cells[cols.low] ?? '', sep)
    const close = toNumber(cells[cols.close] ?? '', sep)
    let volume = 0
    for (const v of cols.volume) {
      const n = toNumber(cells[v] ?? '', sep)
      if (Number.isFinite(n) && n > volume) volume = n
    }
    const valid =
      [openTime, open, high, low, close].every(Number.isFinite) &&
      open > 0 && close > 0 && low > 0 && high >= low &&
      high >= Math.max(open, close) && low <= Math.min(open, close)
    if (!valid) { skipped++; continue }
    byTime.set(openTime, { open, high, low, close, volume, openTime })
  }

  const candles = [...byTime.values()].sort((a, b) => a.openTime - b.openTime).slice(-MAX_CSV_CANDLES)
  if (candles.length < MIN_CANDLES) return { ok: false, error: candles.length === 0 ? 'csv.columns' : 'csv.few' }

  const timeframe = inferTimeframe(candles)
  const step = timeframe === 'M' ? 30 * DAY : timeframe === 'W' ? 7 * DAY : timeframe === 'D' ? DAY : Number(timeframe) * 60000
  for (let i = 0; i < candles.length; i++) {
    const next = candles[i + 1]?.openTime
    candles[i].closeTime = (next !== undefined && next - candles[i].openTime <= step ? next : candles[i].openTime + step) - 1
  }
  return { ok: true, candles, timeframe, skipped }
}
