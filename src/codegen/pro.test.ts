import { describe, it, expect } from 'vitest'
import { generatePine, MAX_LEVERAGE } from './generator'
import { runPine } from '../engine/pineRunner'
import {
  act, cond, edge, emaCrossGraph, entriesOnly, hourlyCandles, ind, node, plot, redeclared, runWith, runs, settings,
  undeclared,
} from './testkit'
import { INDICATORS } from '../blocks/definitions'
import type { IndicatorKind } from '../types'

const HOUR = 3600000
const noExits = { stopKind: 'none', targetKind: 'none' } as const

// Hour of the day and day of the week of a candle in a time zone, worked out
// by the platform and not by the engine under test. Sunday = 1, like Pine.
function clock(ms: number, timeZone: string): { hour: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(ms))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { hour: Number(get('hour')) % 24, day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')) + 1 }
}

describe('blocks with several outputs', () => {
  it('each output is its own variable and the block is written once', () => {
    const nodes = [
      ind('b', 'bb'),
      cond('up', 'crossover'), cond('dn', 'crossunder'),
      act('buy', 'entry_long'), act('out', 'exit_long'),
      plot('p', 'Mid'),
    ]
    const edges = [
      edge('b', 'dn', 'b', 'lower'), edge('b', 'up', 'b', 'upper'),
      edge('dn', 'buy'), edge('up', 'out'), edge('b', 'p', null, 'basis'),
    ]
    const { code, warnings } = generatePine(nodes, edges, 'Bands')
    expect(warnings).toEqual([])
    expect(code.match(/ta\.bb\(/g)).toHaveLength(1)
    expect(code).toContain('[v_b_basis, v_b_upper, v_b_lower] = ta.bb(close, 20, 2)')
    expect(code).toContain('c_up = ta.crossover(close, v_b_upper)')
    expect(code).toContain('c_dn = ta.crossunder(close, v_b_lower)')
    expect(code).toContain('plot(v_b_basis, "Mid"')
    expect(undeclared(code)).toEqual([])
  })

  it('a wire that names no output, or one that is gone, takes the first', () => {
    const nodes = [ind('m', 'macd_full'), plot('p1', 'A'), plot('p2', 'B')]
    const { code } = generatePine(nodes, [edge('m', 'p1'), edge('m', 'p2', null, 'nope')], 'X')
    expect(code).toContain('[v_m_macd, v_m_signal, v_m_hist] = ta.macd(close, 12, 26, 9)')
    expect(code).toContain('plot(v_m_macd, "A"')
    expect(code).toContain('plot(v_m_macd, "B"')
  })

  it('a block with one output keeps its plain name', () => {
    const { code } = generatePine([ind('e', 'ema'), plot('p')], [edge('e', 'p')], 'X')
    expect(code).toContain('v_e = ta.ema(close, 20)')
  })

  it('the output of one block can feed another', () => {
    const nodes = [ind('k', 'keltner'), ind('s', 'sma', { length: 5 }), plot('p')]
    const { code, plotMeta } = generatePine(nodes, [edge('k', 's', null, 'upper'), edge('s', 'p')], 'X')
    expect(code).toContain('v_s = ta.sma(v_k_upper, 5)')
    expect(plotMeta[0].pane).toBe('price')
  })
})

describe('block settings', () => {
  it('are written with their defaults', () => {
    const nodes = [ind('a', 'alma'), ind('st', 'supertrend'), ind('i', 'ichimoku'), plot('p1', 'A'), plot('p2', 'B'), plot('p3', 'C')]
    const edges = [edge('a', 'p1'), edge('st', 'p2', null, 'line'), edge('i', 'p3', null, 'spanB')]
    const { code } = generatePine(nodes, edges, 'X')
    expect(code).toContain('v_a = ta.alma(close, 9, 0.85, 6)')
    expect(code).toContain('[v_st_line, v_st_dir] = ta.supertrend(3, 10)')
    expect(code).toContain('v_st_trend = v_st_dir < 0 ? 1 : -1')
    expect(code).toContain('v_i_spanB = v_i_leadB[25]')
    expect(undeclared(code)).toEqual([])
  })

  it('stay inside their limits and whole where Pine wants a whole number', () => {
    const nodes = [
      node('b', { kind: 'indicator', indicator: 'bb', length: 20, source: 'close', params: { mult: 99 } }),
      node('m', { kind: 'indicator', indicator: 'macd_full', length: 14, source: 'close', params: { fast: 12.7, slow: -3, signal: Number.NaN } }),
      node('st', { kind: 'indicator', indicator: 'supertrend', length: 10, source: 'close' }), // saved without params
      plot('p1', 'A'), plot('p2', 'B'), plot('p3', 'C'),
    ]
    const edges = [edge('b', 'p1', null, 'upper'), edge('m', 'p2', null, 'hist'), edge('st', 'p3', null, 'trend')]
    const { code } = generatePine(nodes, edges, 'X')
    expect(code).toContain('ta.bb(close, 20, 10)')
    expect(code).toContain('ta.macd(close, 13, 2, 9)')
    expect(code).toContain('ta.supertrend(3, 10)')
  })

  it('every output knows whether it belongs on the price scale', () => {
    const pane = (indicator: string, out: string | null, feed?: string) => {
      const nodes = [ind('i', indicator), plot('p')]
      const edges = [edge('i', 'p', null, out)]
      if (feed) { nodes.push(ind('r', feed)); edges.push(edge('r', 'i')) }
      return generatePine(nodes, edges, 'X').plotMeta[0].pane
    }
    expect(pane('bb', 'upper')).toBe('price')
    expect(pane('bb', 'upper', 'rsi')).toBe('sub') // bands of an oscillator
    expect(pane('donchian', 'lower')).toBe('price')
    expect(pane('supertrend', 'line')).toBe('price')
    expect(pane('supertrend', 'trend')).toBe('sub')
    expect(pane('ichimoku', 'kijun')).toBe('price')
    expect(pane('sar', null)).toBe('price')
    expect(pane('vwap', null)).toBe('price')
    expect(pane('adx', 'plus')).toBe('sub')
    expect(pane('stochastic', 'd')).toBe('sub')
    expect(pane('obv', null)).toBe('sub')
    expect(pane('htf_ema', null)).toBe('price')
    expect(pane('htf_rsi', null)).toBe('sub')
  })
})

describe('channels built on the bars before the current one', () => {
  const candles = hourlyCandles(300)
  const output = async (indicator: string, out: string | null, more: Record<string, unknown> = {}) => {
    const { code, plotMeta } = generatePine([ind('i', indicator, more), plot('p')], [edge('i', 'p', null, out)], 'X')
    const result = await runPine(code, candles, plotMeta, { timeframe: '60' })
    expect(result.error).toBeUndefined()
    return result.plots[0].data
  }

  it('the Donchian channel never includes the candle that could break it', async () => {
    const upper = await output('donchian', 'upper', { length: 20 })
    const lower = await output('donchian', 'lower', { length: 20 })
    const basis = await output('donchian', 'basis', { length: 20 })
    let breaks = 0
    for (let i = 20; i < candles.length; i++) {
      const before = candles.slice(i - 20, i)
      expect(upper[i]).toBe(Math.max(...before.map((c) => c.high)))
      expect(lower[i]).toBe(Math.min(...before.map((c) => c.low)))
      expect(basis[i]).toBeCloseTo((upper[i] + lower[i]) / 2, 10)
      if (candles[i].close > upper[i] || candles[i].close < lower[i]) breaks++
    }
    // With the current candle inside the channel a close could never get out of it.
    expect(breaks).toBeGreaterThan(0)
  })

  it('previous high, previous low and earlier value look back, not at the current candle', async () => {
    const high = await output('highest', null, { length: 10 })
    const low = await output('lowest', null, { length: 10 })
    const prev = await output('prev', null, { length: 3 })
    for (let i = 10; i < candles.length; i++) {
      expect(high[i]).toBe(Math.max(...candles.slice(i - 10, i).map((c) => c.high)))
      expect(low[i]).toBe(Math.min(...candles.slice(i - 10, i).map((c) => c.low)))
      expect(prev[i]).toBe(candles[i - 3].close)
    }
  })
})

describe('conditions', () => {
  const wired = (c: ReturnType<typeof cond>, extraNodes = [ind('e', 'ema')], extraEdges = [edge('e', 'c', 'b')]) =>
    generatePine([...extraNodes, c, act('go', 'entry_long')], [...extraEdges, edge('c', 'go')], 'X', settings(noExits))

  it('crosses either way', () => {
    expect(wired(cond('c', 'cross')).code).toContain('c_c = ta.cross(close, v_e)')
  })

  it('greater or equal, less or equal', () => {
    expect(wired(cond('c', 'gte')).code).toContain('c_c = close >= v_e')
    expect(wired(cond('c', 'lte')).code).toContain('c_c = close <= v_e')
  })

  it('rising and falling look at one value over a number of bars', () => {
    const edges = [edge('e', 'c', 'a')]
    expect(wired(cond('c', 'rising'), undefined, edges).code).toContain('c_c = ta.rising(v_e, 3)')
    expect(wired(cond('c', 'falling', { length: 8 }), undefined, edges).code).toContain('c_c = ta.falling(v_e, 8)')
    expect(wired(cond('c', 'rising', { length: 99999 }), undefined, edges).code).toContain('c_c = ta.rising(v_e, 500)')
    expect(wired(cond('c', 'rising'), [], []).code).toContain('c_c = ta.rising(close, 3)')
  })

  it('NOT turns a condition around', () => {
    const nodes = [ind('e', 'ema'), cond('x', 'gt'), cond('c', 'not'), act('go', 'entry_long')]
    const { code, warnings } = generatePine(nodes, [edge('e', 'x', 'b'), edge('x', 'c', 'a'), edge('c', 'go')], 'X')
    expect(code).toContain('c_c = not c_x')
    expect(code).toContain('if c_c and strategy.position_size == 0')
    expect(warnings).toEqual([])
  })

  it('NOT with nothing wired is left out with a warning', () => {
    const { code, warnings } = generatePine([cond('c', 'not'), act('go', 'entry_long'), plot('p')], [edge('c', 'go')], 'X')
    expect(code).not.toContain('c_c')
    expect(warnings.map((w) => w.key)).toEqual(expect.arrayContaining(['warn.notNeedsOne', 'warn.actionNeedsCondition']))
  })

  it('trading hours, in the time zone chosen', () => {
    const { code } = wired(cond('c', 'session', { from: 9, to: 16, tz: 'America/New_York' }), [], [])
    expect(code).toContain('c_c_h = hour(time, "America/New_York")')
    expect(code).toContain('c_c = c_c_h >= 9 and c_c_h < 16')
    expect(undeclared(code)).toEqual([])
  })

  it('trading hours that run past midnight', () => {
    const { code } = wired(cond('c', 'session', { from: 22, to: 6 }), [], [])
    expect(code).toContain('c_c_h = hour(time, "UTC")')
    expect(code).toContain('c_c = c_c_h >= 22 or c_c_h < 6')
  })

  it('from an hour to the same hour is the whole day', () => {
    expect(wired(cond('c', 'session', { from: 0, to: 24 }), [], []).code).toContain('c_c = true')
    expect(wired(cond('c', 'session', { from: 7, to: 7 }), [], []).code).toContain('c_c = true')
  })

  // Built by hand, not through the sanitiser: the generator must hold on its own.
  it('an unknown time zone falls back to UTC, never into the script', () => {
    const evil = 'Mars/Phobos") + runtime.error("x'
    const base = { kind: 'condition', sourceA: 'close', sourceB: 'close', tz: evil } as const
    const hours = wired(node('c', { ...base, condition: 'session', from: 8, to: 17 }), [], []).code
    expect(hours).toContain('hour(time, "UTC")')
    expect(hours).not.toContain('Phobos')
    const days = wired(node('c', { ...base, condition: 'weekdays', days: '23' }), [], []).code
    expect(days).toContain('dayofweek(time, "UTC")')
    expect(days).not.toContain('Phobos')
  })

  it('hours and days out of range are brought back inside the day and the week', () => {
    const base = { kind: 'condition', sourceA: 'close', sourceB: 'close' } as const
    const hours = wired(node('c', { ...base, condition: 'session', from: -3, to: 99 }), [], []).code
    expect(hours).toContain('c_c = true') // 0 to 24
    const days = wired(node('c', { ...base, condition: 'weekdays', days: '9, 2; 2) or true' }), [], []).code
    expect(days).toContain('c_c = c_c_d == 2\n')
  })

  it('days of the week', () => {
    const { code } = wired(cond('c', 'weekdays', { days: '642', tz: 'Europe/Madrid' }), [], [])
    expect(code).toContain('c_c_d = dayofweek(time, "Europe/Madrid")')
    expect(code).toContain('c_c = c_c_d == 2 or c_c_d == 4 or c_c_d == 6')
  })

  it('no day and every day need no clock', () => {
    expect(wired(cond('c', 'weekdays', { days: '' }), [], []).code).toContain('c_c = false')
    const all = wired(cond('c', 'weekdays', { days: '1234567' }), [], []).code
    expect(all).toContain('c_c = true')
    expect(all).not.toContain('dayofweek')
  })
})

describe('time filters in the engine', () => {
  const candles = hourlyCandles(600)
  const filter = async (c: ReturnType<typeof cond>) => {
    const { code, plotMeta, error } = generatePine([c, plot('p', 'F')], [edge('c', 'p')], 'X')
    expect(error).toBeUndefined()
    const result = await runPine(code, candles, plotMeta, { timeframe: '60' })
    expect(result.error).toBeUndefined()
    return result.plots[0].data
  }

  it.each([
    ['UTC', 8, 17], ['America/New_York', 9, 16], ['Europe/Madrid', 22, 6], ['Asia/Tokyo', 0, 9],
  ])('trading hours in %s from %i to %i match the real clock', async (tz, from, to) => {
    const data = await filter(cond('c', 'session', { from, to, tz }))
    const want = candles.map((c) => {
      const h = clock(c.openTime, tz).hour
      return (from < to ? h >= from && h < to : h >= from || h < to) ? 1 : 0
    })
    expect(data).toEqual(want)
    expect(want.includes(1) && want.includes(0)).toBe(true)
  })

  it.each([['UTC'], ['America/New_York'], ['Asia/Tokyo']])('days of the week in %s match the calendar', async (tz) => {
    const data = await filter(cond('c', 'weekdays', { days: '23456', tz }))
    const want = candles.map((c) => {
      const d = clock(c.openTime, tz).day
      return d >= 2 && d <= 6 ? 1 : 0
    })
    expect(data).toEqual(want)
    expect(want.includes(1) && want.includes(0)).toBe(true)
  })
})

describe('higher-timeframe blocks', () => {
  const candles = hourlyCandles(600)
  const series = async (indicator: string, more: Record<string, unknown> = {}) => {
    const { code, plotMeta, error } = generatePine([ind('h', indicator, more), plot('p', 'H')], [edge('h', 'p')], 'X')
    expect(error).toBeUndefined()
    expect(code).not.toContain('request.security')
    expect(undeclared(code)).toEqual([])
    const result = await runPine(code, candles, plotMeta, { timeframe: '60' })
    expect(result.error).toBeUndefined()
    return result.plots[0].data
  }
  // First hourly bar of each 4-hour candle (they start at 00, 04, 08... UTC).
  const opens4h = candles.map((c, i) => (i > 0 && c.openTime % (4 * HOUR) === 0 ? i : -1)).filter((i) => i > 0)

  it('the close only changes when a candle of that timeframe has finished', async () => {
    const data = await series('htf_close', { tf: '240' })
    for (const i of opens4h) expect(data[i]).toBe(candles[i - 1].close)
    for (let i = opens4h[0] + 1; i < candles.length; i++) {
      if (!opens4h.includes(i)) expect(data[i]).toBe(data[i - 1])
    }
  })

  it('high and low are those of the candle that just finished', async () => {
    const highs = await series('htf_high', { tf: '240' })
    const lows = await series('htf_low', { tf: '240' })
    for (const i of opens4h.slice(1)) {
      const done = candles.slice(i - 4, i)
      expect(highs[i]).toBe(Math.max(...done.map((c) => c.high)))
      expect(lows[i]).toBe(Math.min(...done.map((c) => c.low)))
    }
  })

  it('the EMA is the EMA of the closes of that timeframe, with no value before it has its length', async () => {
    const data = await series('htf_ema', { tf: '240', length: 10 })
    const closes: number[] = []
    let ema = Number.NaN
    for (const i of opens4h) {
      const close = candles[i - 1].close
      closes.push(close)
      // TradingView's own EMA: nothing for the first candles, then their plain average, then the EMA.
      if (closes.length < 10) { expect(Number.isFinite(data[i]), `bar ${i}`).toBe(false); continue }
      ema = closes.length === 10 ? closes.reduce((a, b) => a + b, 0) / 10 : ema + (close - ema) * (2 / 11)
      expect(data[i]).toBeCloseTo(ema, 8)
    }
    expect(closes.length).toBeGreaterThan(30)
  })

  it('on the timeframe of the chart they are the plain EMA and RSI, one candle late', async () => {
    const { code, error } = generatePine(
      [ind('e', 'htf_ema', { tf: '60', length: 10 }), ind('r', 'htf_rsi', { tf: '60', length: 14 }), plot('p1', 'E'), plot('p2', 'R')],
      [edge('e', 'p1'), edge('r', 'p2')], 'X',
    )
    expect(error).toBeUndefined()
    const { result, get } = await runWith(code, candles, {
      ema: 'v_e', rsi: 'v_r', emaRef: 'ta.ema(close, 10)[1]', rsiRef: 'ta.rsi(close, 14)[1]',
    })
    expect(result.error).toBeUndefined()
    for (const [mine, ref] of [['ema', 'emaRef'], ['rsi', 'rsiRef']] as const) {
      const a = get(mine)
      const b = get(ref)
      let compared = 0
      for (let i = 0; i < candles.length; i++) {
        expect(Number.isFinite(a[i]), `${mine} at bar ${i}`).toBe(Number.isFinite(b[i]))
        if (Number.isFinite(b[i])) { expect(a[i]).toBeCloseTo(b[i], 6); compared++ }
      }
      expect(compared).toBeGreaterThan(500)
    }
  })

  it('a candle of that timeframe cut short by the start of the data is not given', async () => {
    // The data starts at 02:00, in the middle of a 4-hour candle.
    const late = hourlyCandles(120, Date.UTC(2024, 2, 1, 2))
    const run = async (indicator: string) => {
      const { code, plotMeta } = generatePine([ind('h', indicator, { tf: '240' }), plot('p', 'H')], [edge('h', 'p')], 'X')
      const result = await runPine(code, late, plotMeta, { timeframe: '60' })
      expect(result.error).toBeUndefined()
      return result.plots[0].data
    }
    const highs = await run('htf_high')
    const lows = await run('htf_low')
    // Bars 0-1 are what is left of the first candle; the first whole one is bars 2-5.
    for (let i = 0; i < 6; i++) {
      expect(Number.isFinite(highs[i]), `high at bar ${i}`).toBe(false)
      expect(Number.isFinite(lows[i]), `low at bar ${i}`).toBe(false)
    }
    for (let i = 6; i < 10; i++) {
      expect(highs[i]).toBe(Math.max(...late.slice(2, 6).map((c) => c.high)))
      expect(lows[i]).toBe(Math.min(...late.slice(2, 6).map((c) => c.low)))
    }
    expect(highs[10]).toBe(Math.max(...late.slice(6, 10).map((c) => c.high)))
  })

  it('the script says which blocks need history before their value can be trusted', () => {
    const { needs } = generatePine(
      [
        ind('e', 'htf_ema', { tf: 'D', length: 50 }), ind('r', 'htf_rsi', { tf: 'W', length: 14 }),
        ind('c', 'htf_close', { tf: 'D' }), ind('loose', 'htf_ema', { tf: 'W', length: 200 }),
        plot('p1', 'E'), plot('p2', 'R'), plot('p3', 'C'),
      ],
      [edge('e', 'p1'), edge('r', 'p2'), edge('c', 'p3')], 'X',
    )
    // The close needs nothing, and the block wired to nothing is not in the script.
    expect(needs).toEqual([
      { indicator: 'htf_ema', tf: 'D', length: 50, first: 50, settle: 150 },
      { indicator: 'htf_rsi', tf: 'W', length: 14, first: 15, settle: 70 },
    ])
    expect(generatePine([ind('e', 'ema'), plot('p')], [edge('e', 'p')], 'X').needs).toEqual([])
  })

  it('the RSI stays between 0 and 100 and moves once per candle of that timeframe', async () => {
    const data = await series('htf_rsi', { tf: '240', length: 14 })
    const values = data.filter((v) => Number.isFinite(v))
    expect(values.length).toBeGreaterThan(400)
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...values)).toBeLessThanOrEqual(100)
    const changes = data.filter((v, i) => i > 0 && Number.isFinite(v) && v !== data[i - 1]).length
    expect(changes).toBeLessThanOrEqual(opens4h.length)
    expect(changes).toBeGreaterThan(opens4h.length / 2)
  })

  it('daily blocks work on an hourly chart', async () => {
    const data = await series('htf_close', { tf: 'D' })
    const day = candles.findIndex((c, i) => i > 30 && c.openTime % (24 * HOUR) === 0)
    expect(data[day]).toBe(candles[day - 1].close)
    expect(data[day + 23]).toBe(candles[day - 1].close)
  })

  it('an unknown timeframe falls back to 4 hours, never into the script', () => {
    const { code } = generatePine(
      [node('h', { kind: 'indicator', indicator: 'htf_close', length: 14, source: 'close', tf: '1") + x' }), plot('p')],
      [edge('h', 'p')], 'X',
    )
    expect(code).toContain('timeframe.change("240")')
  })
})

describe('trade management: what the script says', () => {
  it('a trailing stop keeps its level in a variable that only moves in favour', () => {
    const { nodes, edges } = entriesOnly('long')
    const { code, warnings } = generatePine(nodes, edges, 'X', settings({
      stopKind: 'atr', stopValue: 2, targetKind: 'none', trailKind: 'atr', trailValue: 3,
    }))
    expect(warnings).toEqual([])
    expect(code).toContain('var float sfStop = na')
    expect(code).toContain('    sfStopDist := sfAtr * 2\n    sfTrailDist := sfAtr * 3\n')
    expect(code).toContain([
      'if strategy.position_size > 0',
      '    if na(sfStop)',
      '        sfStop := strategy.position_avg_price - sfStopDist',
      '    sfStop := math.max(nz(sfStop, high - sfTrailDist), high - sfTrailDist)',
      `    strategy.exit("XL", from_entry="Long", stop=sfStop, alert_message='{"action":"closebuy","symbol":"' + syminfo.ticker + '","strategy":"x"}')`,
      'else',
      '    sfStop := na',
    ].join('\n'))
    expect(code).not.toContain('"XS"')
  })

  it('shorts are mirrored', () => {
    const { nodes, edges } = entriesOnly('both')
    const { code } = generatePine(nodes, edges, 'X', settings({
      stopKind: 'percent', stopValue: 1, targetKind: 'rr', targetValue: 2, trailKind: 'percent', trailValue: 1.5,
    }))
    expect(code).toContain('    sfTrailDist := close * 1.5 / 100')
    expect(code).toContain([
      'else if strategy.position_size < 0',
      '    if na(sfStop)',
      '        sfStop := strategy.position_avg_price + sfStopDist',
      '    sfStop := math.min(nz(sfStop, low + sfTrailDist), low + sfTrailDist)',
      '    strategy.exit("XS", from_entry="Short", stop=sfStop, limit=strategy.position_avg_price - sfTakeDist, alert_message=',
    ].join('\n'))
    expect(code).not.toContain('sfAtr')
  })

  it('a trailing stop alone needs no fixed stop', () => {
    const { nodes, edges } = entriesOnly('short')
    const { code, warnings } = generatePine(nodes, edges, 'X', settings({ ...noExits, trailKind: 'atr', trailValue: 2 }))
    expect(warnings).toEqual([])
    expect(code).not.toContain('sfStopDist')
    expect(code).toContain('if strategy.position_size < 0\n    sfStop := math.min(nz(sfStop, low + sfTrailDist), low + sfTrailDist)')
  })

  it('break-even moves the stop to the entry price once the trade is far enough ahead', () => {
    const { nodes, edges } = entriesOnly('long')
    const { code } = generatePine(nodes, edges, 'X', settings({ beKind: 'rr', beValue: 1 }))
    expect(code).toContain('    sfBeDist := sfStopDist * 1\n')
    expect(code).toContain([
      '    if high >= strategy.position_avg_price + sfBeDist',
      '        sfStop := math.max(nz(sfStop, strategy.position_avg_price), strategy.position_avg_price)',
      '    strategy.exit("XL", from_entry="Long", stop=sfStop, limit=strategy.position_avg_price + sfTakeDist, alert_message=',
    ].join('\n'))
  })

  it('a break-even measured in stops needs a stop', () => {
    const { nodes, edges } = entriesOnly('long')
    const { code, warnings } = generatePine(nodes, edges, 'X', settings({ ...noExits, beKind: 'rr' }))
    expect(warnings.map((w) => w.key)).toEqual(['warn.beNeedsStop'])
    expect(code).not.toContain('sfBeDist')
    expect(code).not.toContain('strategy.exit')
  })

  it('a time exit closes what is still open after N bars', () => {
    const { nodes, edges } = entriesOnly('both')
    const { code } = generatePine(nodes, edges, 'X', settings({ ...noExits, maxBars: 12 }))
    expect(code).toContain('var int sfBars = 0\nsfBars := strategy.position_size != 0 ? sfBars + 1 : 0')
    expect(code).toContain(`if strategy.position_size > 0 and sfBars >= 12\n    strategy.close("Long", alert_message='{"action":"closebuy"`)
    expect(code).toContain(`if strategy.position_size < 0 and sfBars >= 12\n    strategy.close("Short", alert_message='{"action":"closesell"`)
    expect(generatePine(nodes, edges, 'X', settings(noExits)).code).not.toContain('sfBars')
    expect(code).toContain('// Time exit: a trade still open after 12 bars is closed')
    expect(generatePine(nodes, edges, 'X', settings({ ...noExits, maxBars: 1 })).code)
      .toContain('// Time exit: a trade still open after 1 bar is closed')
  })

  it('sizing by risk: what the stop can take is a share of the balance', () => {
    const { nodes, edges } = entriesOnly('long')
    const { code, warnings } = generatePine(nodes, edges, 'X', settings({ sizeKind: 'risk', sizeValue: 1 }))
    expect(warnings).toEqual([])
    expect(code).toContain('if c_up and strategy.position_size == 0 and sfAtr * 1.5 > 0')
    expect(code).toContain(
      `strategy.entry("Long", strategy.long, qty=math.min(strategy.equity * 1 / 100 / sfStopDist, strategy.equity * ${MAX_LEVERAGE} / close), alert_message=`,
    )
    // The lot that travels to MT5 is still the fixed one.
    expect(code).toContain(`"lot":"' + str.tostring(lotSize) + '"`)
  })

  it('sizing by risk without a stop falls back to the whole balance, with a warning', () => {
    const { nodes, edges } = entriesOnly('long')
    const { code, warnings } = generatePine(nodes, edges, 'X', settings({ ...noExits, sizeKind: 'risk', sizeValue: 2 }))
    expect(warnings.map((w) => w.key)).toEqual(['warn.riskNeedsStop'])
    expect(code).not.toContain('qty=')
    expect(code).toContain('default_qty_value=100,')
  })

  it('sizing by share of the balance', () => {
    const { nodes, edges } = entriesOnly('long')
    expect(generatePine(nodes, edges, 'X', settings({ sizeKind: 'equity', sizeValue: 25 })).code).toContain('default_qty_value=25,')
    expect(generatePine(nodes, edges, 'X', settings()).code).toContain('default_qty_value=100,')
  })

  it('commission and slippage are charged together, per side', () => {
    const { nodes, edges } = entriesOnly('long')
    const std = generatePine(nodes, edges, 'X', settings()).code
    expect(std).toContain('commission_type=strategy.commission.percent, commission_value=0.07,')
    expect(std).toContain('// Cost per side: 0.05% commission + 0.02% slippage')
    const own = generatePine(nodes, edges, 'X', settings({ feePct: 0.1, slipPct: 0 })).code
    expect(own).toContain('commission_value=0.1,')
    const wild = generatePine(nodes, edges, 'X', settings({ feePct: 999, slipPct: Number.NaN })).code
    expect(wild).toContain('commission_value=5.02,')
  })

  it('a script with no orders carries none of it', () => {
    const { code } = generatePine([ind('e', 'ema'), plot('p')], [edge('e', 'p')], 'X', settings({
      trailKind: 'atr', beKind: 'atr', maxBars: 5, sizeKind: 'risk',
    }))
    expect(code).not.toMatch(/sf[A-Z]|strategy\./)
  })

  it('exits without entries carry none of it either', () => {
    const { nodes, edges } = emaCrossGraph()
    const only = nodes.filter((n) => n.id !== 'n6')
    const { code, warnings } = generatePine(only, edges.filter((e) => e.target !== 'n6'), 'X', settings({
      trailKind: 'atr', beKind: 'rr', maxBars: 5, sizeKind: 'risk',
    }))
    expect(warnings).toEqual([])
    expect(code).toContain('strategy.close("Long"')
    expect(code).not.toMatch(/sf[A-Z]/)
  })
})

describe('trade management: what the engine does with it', () => {
  const candles = hourlyCandles(600)

  it('a trailing stop on longs never moves down, and closes the trades', async () => {
    const { nodes, edges } = entriesOnly('long')
    const { code } = generatePine(nodes, edges, 'X', settings({ ...noExits, trailKind: 'atr', trailValue: 2 }))
    const { result, get } = await runWith(code, candles, { S: 'sfStop' })
    expect(result.error).toBeUndefined()
    expect(result.trades.length).toBeGreaterThan(3)
    const trades = runs(get('S'))
    expect(trades.length).toBeGreaterThan(3)
    for (const stops of trades) {
      for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThanOrEqual(stops[i - 1])
    }
    expect(trades.some((stops) => stops[stops.length - 1] > stops[0])).toBe(true)
  })

  it('a trailing stop on shorts never moves up', async () => {
    const { nodes, edges } = entriesOnly('short')
    const { code } = generatePine(nodes, edges, 'X', settings({ ...noExits, trailKind: 'percent', trailValue: 6 }))
    const { result, get } = await runWith(code, candles, { S: 'sfStop' })
    expect(result.error).toBeUndefined()
    expect(result.trades.length).toBeGreaterThan(3)
    const trades = runs(get('S'))
    for (const stops of trades) {
      for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeLessThanOrEqual(stops[i - 1])
    }
    expect(trades.some((stops) => stops[stops.length - 1] < stops[0])).toBe(true)
  })

  it('a trailing stop starts no further away than the fixed stop', async () => {
    const { nodes, edges } = entriesOnly('long')
    const { code } = generatePine(nodes, edges, 'X', settings({
      stopKind: 'atr', stopValue: 1, targetKind: 'none', trailKind: 'atr', trailValue: 4,
    }))
    const { result, get } = await runWith(code, candles, { S: 'sfStop', A: 'strategy.position_avg_price', D: 'sfStopDist' })
    expect(result.error).toBeUndefined()
    const s = get('S'); const a = get('A'); const d = get('D')
    let seen = 0
    for (let i = 1; i < s.length; i++) {
      if (!Number.isFinite(s[i]) || Number.isFinite(s[i - 1])) continue
      // First bar of a trade: the stop is the fixed one or better.
      expect(s[i]).toBeGreaterThanOrEqual(a[i] - d[i] - 1e-9)
      seen++
    }
    expect(seen).toBeGreaterThan(3)
  })

  it('break-even: once the price has gone far enough, the stop is at the entry or better', async () => {
    const { nodes, edges } = entriesOnly('long')
    const { code } = generatePine(nodes, edges, 'X', settings({
      stopKind: 'atr', stopValue: 2, targetKind: 'none', beKind: 'rr', beValue: 0.5,
    }))
    const { result, get } = await runWith(code, candles, {
      S: 'sfStop', A: 'strategy.position_avg_price', B: 'sfBeDist', H: 'high',
    })
    expect(result.error).toBeUndefined()
    const s = get('S'); const a = get('A'); const b = get('B'); const h = get('H')
    let armed = 0
    let before = 0
    let reached = false
    for (let i = 0; i < s.length; i++) {
      if (!Number.isFinite(s[i])) { reached = false; continue }
      if (h[i] >= a[i] + b[i]) reached = true
      if (reached) { expect(s[i]).toBeGreaterThanOrEqual(a[i] - 1e-9); armed++ }
      else { expect(s[i]).toBeLessThan(a[i]); before++ }
    }
    expect(armed).toBeGreaterThan(0)
    expect(before).toBeGreaterThan(0)
    expect(result.trades.length).toBeGreaterThan(3)
  })

  it('a time exit holds no trade longer than asked', async () => {
    const { nodes, edges } = entriesOnly('both')
    const { code } = generatePine(nodes, edges, 'X', settings({ ...noExits, maxBars: 6 }))
    const result = await runPine(code, candles, [], { timeframe: '60' })
    expect(result.error).toBeUndefined()
    expect(result.trades.length).toBeGreaterThan(5)
    const held = result.trades.map((t) => t.exitIndex - t.entryIndex)
    expect(Math.max(...held)).toBe(6)
    expect(Math.min(...held)).toBe(6) // nothing else closes a trade in this graph
  })

  it('sizing by risk: a stopped trade costs about the share asked for', async () => {
    const { nodes, edges } = entriesOnly('long')
    const over = { stopKind: 'atr', stopValue: 2, targetKind: 'rr', targetValue: 2, feePct: 0, slipPct: 0 } as const
    const risk = generatePine(nodes, edges, 'X', settings({ ...over, sizeKind: 'risk', sizeValue: 1 }))
    const full = generatePine(nodes, edges, 'X', settings({ ...over, sizeKind: 'equity', sizeValue: 100 }))
    const a = await runPine(risk.code, candles, [], { timeframe: '60' })
    const b = await runPine(full.code, candles, [], { timeframe: '60' })
    expect(a.error).toBeUndefined()
    expect(a.trades.length).toBeGreaterThan(3)
    expect(a.trades.length).toBe(b.trades.length) // same trades, another size
    const losses = a.trades.filter((t) => t.returnPct < 0).map((t) => t.returnPct)
    const wins = a.trades.filter((t) => t.returnPct > 0).map((t) => t.returnPct)
    expect(losses.length).toBeGreaterThan(0)
    expect(wins.length).toBeGreaterThan(0)
    // A stop at 1% of the balance and a target at twice that. A gap through
    // the stop could make a loss bigger, never smaller.
    for (const l of losses) { expect(l).toBeLessThan(-0.99); expect(l).toBeGreaterThan(-1.3) }
    for (const w of wins) { expect(w).toBeGreaterThan(1.99); expect(w).toBeLessThan(2.3) }
    // With the whole balance in each trade the same stops cost several times more.
    expect(Math.min(...b.trades.map((t) => t.returnPct))).toBeLessThan(-3)
    expect(a.stats?.netProfitPct).not.toBeCloseTo(b.stats?.netProfitPct ?? 0, 3)
  })

  it('costs make the same trades worth less', async () => {
    const { nodes, edges } = emaCrossGraph()
    const free = generatePine(nodes, edges, 'X', settings({ feePct: 0, slipPct: 0 }))
    const paid = generatePine(nodes, edges, 'X', settings({ feePct: 0.05, slipPct: 0.2 }))
    const a = await runPine(free.code, candles, [], { timeframe: '60' })
    const b = await runPine(paid.code, candles, [], { timeframe: '60' })
    expect(a.trades.length).toBeGreaterThan(3)
    expect(b.trades.length).toBe(a.trades.length)
    expect(b.stats!.netProfit).toBeLessThan(a.stats!.netProfit)
    // Two sides at 0.25% each on the whole balance: about half a percent per trade.
    const perTrade = (a.stats!.netProfit - b.stats!.netProfit) / a.trades.length / 10000 * 100
    expect(perTrade).toBeGreaterThan(0.4)
    expect(perTrade).toBeLessThan(0.6)
  })

  it('everything at once still runs and trades', async () => {
    const { nodes, edges } = entriesOnly('both')
    const { code, warnings } = generatePine(nodes, edges, 'All of it', settings({
      stopKind: 'atr', stopValue: 2, targetKind: 'rr', targetValue: 3,
      trailKind: 'atr', trailValue: 3, beKind: 'rr', beValue: 1, maxBars: 40, sizeKind: 'risk', sizeValue: 1,
    }))
    expect(warnings).toEqual([])
    expect(undeclared(code)).toEqual([])
    const result = await runPine(code, candles, [], { timeframe: '60' })
    expect(result.error).toBeUndefined()
    expect(result.trades.length).toBeGreaterThan(5)
    expect(result.trades.some((t) => t.side === 'short')).toBe(true)
    expect(Math.max(...result.trades.map((t) => t.exitIndex - t.entryIndex))).toBeLessThanOrEqual(40)
  })
})

// TradingView refuses a script that declares a name twice. The names come from
// the ids of the blocks, and a file or a link can carry any id.
describe('every name in the script is declared once', () => {
  const plotted = (ids: string[]) => ids.map((id) => plot(`p_${id}`, `Line ${id}`))

  it('the helper tells a second declaration from an assignment', () => {
    expect(redeclared('a = 1\nb = 2\nvar float c = na\nc := 3\nif a == b\n    d = 1')).toEqual([])
    expect(redeclared('a = 1\na = 2')).toEqual(['a'])
    expect(redeclared('[a, b] = f()\nb = 2')).toEqual(['b'])
    expect(redeclared('var float a = na\nvar float a = na')).toEqual(['a'])
  })

  it('a block named like the output of another one', () => {
    // "a" is a Bollinger block: its upper band would be v_a_upper, the same
    // name a block called "a_upper" used to get.
    const { code, error } = generatePine(
      [
        node('p', { kind: 'source', source: 'close' }),
        ind('a', 'bb'), ind('a_upper', 'ema'), ind('a_basis', 'sma'),
        ...plotted(['1', '2', '3']),
      ],
      [
        edge('p', 'a'), edge('p', 'a_upper'), edge('p', 'a_basis'),
        edge('a', 'p_1', null, 'upper'), edge('a_upper', 'p_2'), edge('a_basis', 'p_3'),
      ],
      'Names',
    )
    expect(error).toBeUndefined()
    expect(redeclared(code)).toEqual([])
    expect(undeclared(code)).toEqual([])
  })

  it('two blocks whose ids differ only by a hyphen or an underscore', () => {
    const { code, error } = generatePine(
      [
        node('p', { kind: 'source', source: 'close' }),
        ind('a-b', 'ema'), ind('a_b', 'sma'), ind('a__b', 'wma'), ind('a-_b', 'rsi'),
        ...plotted(['1', '2', '3', '4']),
      ],
      [
        edge('p', 'a-b'), edge('p', 'a_b'), edge('p', 'a__b'), edge('p', 'a-_b'),
        edge('a-b', 'p_1'), edge('a_b', 'p_2'), edge('a__b', 'p_3'), edge('a-_b', 'p_4'),
      ],
      'Names',
    )
    expect(error).toBeUndefined()
    expect(redeclared(code)).toEqual([])
    expect(undeclared(code)).toEqual([])
  })

  it('a condition named like the helper line of another one', () => {
    // The hours filter keeps the hour in c_<id>_h.
    const { code, error } = generatePine(
      [
        node('p', { kind: 'source', source: 'close' }), ind('e', 'ema'),
        cond('s', 'session', { from: 8, to: 17, tz: 'UTC' }), cond('s_h', 'gt'), cond('both', 'and'),
        act('buy', 'entry_long'),
      ],
      [
        edge('p', 'e'), edge('p', 's_h', 'a'), edge('e', 's_h', 'b'),
        edge('s', 'both', 'a'), edge('s_h', 'both', 'b'), edge('both', 'buy'),
      ],
      'Names', settings(noExits),
    )
    expect(error).toBeUndefined()
    expect(redeclared(code)).toEqual([])
    expect(undeclared(code)).toEqual([])
  })

  it('every block at once, old ones included', async () => {
    const kinds = Object.keys(INDICATORS) as IndicatorKind[]
    const outs = kinds.flatMap((k) => INDICATORS[k].outputs.map((o) => ({ k, key: o.key })))
    const { code, error } = generatePine(
      [
        node('p', { kind: 'source', source: 'close' }),
        ...kinds.map((k) => ind(`i_${k}`, k)),
        ...outs.map((o) => plot(`pl_${o.k}_${o.key || 'x'}`, `L ${o.k} ${o.key}`.trim())),
      ],
      [
        ...kinds.filter((k) => INDICATORS[k].usesSource).map((k) => edge('p', `i_${k}`)),
        ...outs.map((o) => edge(`i_${o.k}`, `pl_${o.k}_${o.key || 'x'}`, null, o.key || null)),
      ],
      'Every block',
    )
    expect(error).toBeUndefined()
    expect(redeclared(code)).toEqual([])
    expect(undeclared(code)).toEqual([])
    // and it still runs
    const result = await runPine(code, hourlyCandles(600), [], { timeframe: '60' })
    expect(result.error).toBeUndefined()
  })

  it('the ids the app gives keep the names they had', () => {
    const { code } = generatePine(
      [node('n1', { kind: 'source', source: 'close' }), ind('n2', 'bb'), plot('n3', 'Upper')],
      [edge('n1', 'n2'), edge('n2', 'n3', null, 'upper')],
      'Names',
    )
    expect(code).toContain('[v_n2_basis, v_n2_upper, v_n2_lower] = ta.bb(close, 20, 2)')
    expect(code).toContain('plot(v_n2_upper, "Upper"')
  })
})
