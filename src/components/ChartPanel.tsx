import { useEffect, useRef, useState } from 'react'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { localeOf } from '../lang'
import { MARKETS } from '../data/market'
import type { Candle, PlotResult, SignalMarker } from '../types'

const STEP = 6 // pixels per candle
const PAD_RIGHT = 62 // room for the price labels
const PAD_BOTTOM = 18 // room for the dates
const UP = '#3fb68b'
const DOWN = '#e5484d'
const NO_PLOTS: PlotResult[] = []
const NO_MARKERS: SignalMarker[] = []

// Candles, the lines of each plot and the buy/sell markers, drawn on a canvas.
// Drag to move back in time; double click returns to the latest candle.
export function ChartPanel() {
  const t = useT()
  const lang = useBuilder((s) => s.lang)
  const candles = useBuilder((s) => s.candles)
  const runResult = useBuilder((s) => s.runResult)
  const runFor = useBuilder((s) => s.runFor)
  const dataState = useBuilder((s) => s.dataState)
  const dataError = useBuilder((s) => s.dataError)
  const market = useBuilder((s) => s.market)
  const timeframe = useBuilder((s) => s.timeframe)
  const loadCandles = useBuilder((s) => s.loadCandles)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; offset: number } | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [offset, setOffset] = useState(0) // candles hidden to the right of the view

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => setOffset(0), [candles])

  // Results of an older set of candles must not be drawn over a newer one.
  const fits = runResult?.ok && runFor === candles
  const plots = fits ? runResult.plots : NO_PLOTS
  const markers = fits ? runResult.markers : NO_MARKERS

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || size.w === 0 || size.h === 0) return
    draw(ctx, canvas, size.w, size.h, candles, plots, markers, offset, localeOf(lang), timeframe)
  }, [candles, plots, markers, offset, size, lang, timeframe])

  const visible = Math.max(1, Math.floor((size.w - PAD_RIGHT) / STEP))
  const maxOffset = Math.max(0, candles.length - visible)

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, offset }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const moved = Math.round((e.clientX - drag.current.x) / STEP)
    setOffset(Math.min(maxOffset, Math.max(0, drag.current.offset + moved)))
  }
  const onPointerUp = () => { drag.current = null }

  const marketLabel = MARKETS.find((m) => m.key === market)?.label ?? market
  const heading =
    dataState === 'loading' ? t('chart.loading')
    : dataState === 'live' ? t('chart.title', { market: marketLabel, tf: timeframe, bars: candles.length })
    : t('chart.sample', { bars: candles.length })

  const buys = markers.filter((m) => m.side === 'buy').length
  const sells = markers.length - buys

  return (
    <section className="chart-panel">
      <div className="panel-head">
        <h3>{heading}</h3>
        <div className="legend">
          {plots.map((p) => (
            <span key={p.title} className="legend-item">
              <i className="swatch" style={{ background: p.color }} /> {p.title}
            </span>
          ))}
          {markers.length > 0 && (
            <>
              <span className="legend-item"><i className="tri buy" /> {t('chart.buys', { n: buys })}</span>
              <span className="legend-item"><i className="tri sell" /> {t('chart.sells', { n: sells })}</span>
            </>
          )}
        </div>
      </div>

      {dataState === 'fallback' && (
        <div className="notice warn">
          {t('chart.fallback', { reason: dataError ?? '?' })}{' '}
          <button type="button" className="link" onClick={() => void loadCandles()}>{t('chart.retry')}</button>
        </div>
      )}

      <div
        className="canvas-wrap" ref={wrapRef} title={t('chart.pan')}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onDoubleClick={() => setOffset(0)}
      >
        <canvas ref={canvasRef} />
      </div>

      {dataState === 'live' && <p className="fine">{t('chart.source')}</p>}
    </section>
  )
}

function decimals(v: number): number {
  const a = Math.abs(v)
  return a >= 1000 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 5
}

function range(values: number[], padding = 0.06): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  const span = max - min || Math.abs(max) || 1
  return [min - span * padding, max + span * padding]
}

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  W: number,
  H: number,
  candles: Candle[],
  plots: PlotResult[],
  markers: SignalMarker[],
  offset: number,
  locale: string,
  timeframe: string,
) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  if (candles.length === 0) return

  const plotW = W - PAD_RIGHT
  const visible = Math.max(1, Math.floor(plotW / STEP))
  const end = Math.max(1, candles.length - offset)
  const start = Math.max(0, end - visible)
  const x = (i: number) => (i - start) * STEP + STEP / 2

  const pricePlots = plots.filter((p) => p.pane === 'price')
  const subPlots = plots.filter((p) => p.pane === 'sub')
  const fullH = H - PAD_BOTTOM
  const priceH = subPlots.length ? Math.round(fullH * 0.68) : fullH
  const subTop = priceH + 10
  const subH = fullH - subTop

  ctx.font = '10px ui-monospace, Menlo, Consolas, monospace'
  ctx.lineWidth = 1

  // ---- Price pane ----
  const priceValues: number[] = []
  for (let i = start; i < end; i++) priceValues.push(candles[i].low, candles[i].high)
  for (const p of pricePlots) for (let i = start; i < end; i++) priceValues.push(p.data[i])
  const [pMin, pMax] = range(priceValues)
  const y = (v: number) => priceH - ((v - pMin) / (pMax - pMin)) * priceH

  grid(ctx, W, plotW, pMin, pMax, y, 4)

  const body = Math.max(1, STEP - 2)
  for (let i = start; i < end; i++) {
    const c = candles[i]
    const color = c.close >= c.open ? UP : DOWN
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(Math.round(x(i)) + 0.5, y(c.high))
    ctx.lineTo(Math.round(x(i)) + 0.5, y(c.low))
    ctx.stroke()
    const yo = y(c.open)
    const yc = y(c.close)
    ctx.fillRect(x(i) - body / 2, Math.min(yo, yc), body, Math.max(1, Math.abs(yc - yo)))
  }

  for (const p of pricePlots) series(ctx, p, start, end, x, y, y(pMin))

  const tri = 4
  for (const m of markers) {
    if (m.index < start || m.index >= end) continue
    const c = candles[m.index]
    const cx = x(m.index)
    ctx.beginPath()
    if (m.side === 'buy') {
      const top = Math.min(priceH - 2 * tri - 1, y(c.low) + 4)
      ctx.fillStyle = UP
      ctx.moveTo(cx, top)
      ctx.lineTo(cx - tri, top + 2 * tri)
      ctx.lineTo(cx + tri, top + 2 * tri)
    } else {
      const bottom = Math.max(2 * tri + 1, y(c.high) - 4)
      ctx.fillStyle = DOWN
      ctx.moveTo(cx, bottom)
      ctx.lineTo(cx - tri, bottom - 2 * tri)
      ctx.lineTo(cx + tri, bottom - 2 * tri)
    }
    ctx.closePath()
    ctx.fill()
  }

  // ---- Pane for what does not share the price scale ----
  if (subPlots.length) {
    const subValues: number[] = []
    for (const p of subPlots) {
      for (let i = start; i < end; i++) subValues.push(p.data[i])
      if (p.style === 'histogram' || p.style === 'columns') subValues.push(0)
    }
    const [sMin, sMax] = range(subValues, 0.1)
    const ys = (v: number) => subTop + subH - ((v - sMin) / (sMax - sMin)) * subH

    ctx.strokeStyle = '#2a2f2b'
    ctx.beginPath()
    ctx.moveTo(0, subTop - 5.5)
    ctx.lineTo(W, subTop - 5.5)
    ctx.stroke()
    grid(ctx, W, plotW, sMin, sMax, ys, 2)
    const zero = sMin <= 0 && sMax >= 0 ? ys(0) : ys(sMin)
    for (const p of subPlots) series(ctx, p, start, end, x, ys, zero)
  }

  // ---- Dates ----
  const intraday = timeframe !== '1d'
  const fmt = new Intl.DateTimeFormat(locale, intraday
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { year: '2-digit', month: 'short', day: 'numeric' })
  ctx.fillStyle = '#8a8f87'
  ctx.textAlign = 'center'
  const ticks = Math.max(2, Math.min(5, Math.floor(plotW / 150)))
  for (let k = 0; k < ticks; k++) {
    const i = Math.min(end - 1, start + Math.round(((k + 0.5) / ticks) * (end - start)))
    ctx.fillText(fmt.format(new Date(candles[i].openTime)), x(i), H - 5)
  }
}

function grid(
  ctx: CanvasRenderingContext2D,
  W: number,
  plotW: number,
  min: number,
  max: number,
  y: (v: number) => number,
  rows: number,
) {
  ctx.strokeStyle = '#1c201d'
  ctx.fillStyle = '#8a8f87'
  ctx.textAlign = 'right'
  const d = decimals(max)
  for (let r = 0; r <= rows; r++) {
    const value = min + ((max - min) * r) / rows
    const yy = Math.round(y(value)) + 0.5
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(plotW, yy)
    ctx.stroke()
    const labelY = r === 0 ? yy - 3 : r === rows ? yy + 10 : yy + 3
    ctx.fillText(value.toFixed(d), W - 4, labelY)
  }
}

function series(
  ctx: CanvasRenderingContext2D,
  p: PlotResult,
  start: number,
  end: number,
  x: (i: number) => number,
  y: (v: number) => number,
  baseline: number,
) {
  ctx.strokeStyle = p.color
  ctx.fillStyle = p.color

  if (p.style === 'histogram' || p.style === 'columns') {
    const w = p.style === 'columns' ? Math.max(1, STEP - 2) : 1
    for (let i = start; i < end; i++) {
      const v = p.data[i]
      if (!Number.isFinite(v)) continue
      const top = y(v)
      ctx.fillRect(x(i) - w / 2, Math.min(top, baseline), w, Math.max(1, Math.abs(baseline - top)))
    }
    return
  }

  if (p.style === 'circles') {
    for (let i = start; i < end; i++) {
      const v = p.data[i]
      if (!Number.isFinite(v)) continue
      ctx.beginPath()
      ctx.arc(x(i), y(v), 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    return
  }

  ctx.lineWidth = 1.5
  ctx.beginPath()
  let drawing = false
  for (let i = start; i < end; i++) {
    const v = p.data[i]
    if (!Number.isFinite(v)) { drawing = false; continue }
    if (drawing) ctx.lineTo(x(i), y(v))
    else { ctx.moveTo(x(i), y(v)); drawing = true }
  }
  ctx.stroke()
  ctx.lineWidth = 1
}
