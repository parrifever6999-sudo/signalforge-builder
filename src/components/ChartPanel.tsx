import { useEffect, useRef } from 'react'
import { useBuilder } from '../store/builderStore'
import { generateCandles } from '../data/sampleData'
import type { SignalMarker } from '../types'

// Dibuja velas OHLCV + las series de los plots sobre un <canvas>
export function ChartPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runResult = useBuilder((s) => s.runResult)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const candles = generateCandles(300, 42)
    drawChart(ctx, canvas, candles, runResult?.plots ?? [], runResult?.markers ?? [])
  }, [runResult])

  return (
    <section className="chart-panel">
      <div className="panel-head">
        <h3>Gráfico (datos de muestra · 300 velas)</h3>
      </div>
      <div className="canvas-wrap">
        <canvas ref={canvasRef} />
      </div>
      {(runResult?.markers.length ?? 0) > 0 && (
        <div className="legend">
          <span className="legend-item"><i className="tri buy" /> Compra ({runResult!.markers.filter(m => m.side === 'buy').length})</span>
          <span className="legend-item"><i className="tri sell" /> Venta ({runResult!.markers.filter(m => m.side === 'sell').length})</span>
        </div>
      )}
    </section>
  )
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  candles: { open: number; high: number; low: number; close: number }[],
  plots: { title: string; color: string; data: number[] }[],
  markers: SignalMarker[],
) {
  const dpr = window.devicePixelRatio || 1
  const W = canvas.clientWidth
  const H = canvas.clientHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  const padR = 60 // espacio para etiquetas de precio
  const plotW = W - padR
  const n = candles.length

  // Rango de precios (incluye velas + plots)
  let min = Infinity
  let max = -Infinity
  for (const c of candles) {
    if (c.low < min) min = c.low
    if (c.high > max) max = c.high
  }
  for (const p of plots) {
    for (const v of p.data) {
      if (Number.isFinite(v)) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1 }
  const range = max - min || 1
  const pad = range * 0.08
  min -= pad
  max += pad

  const x = (i: number) => (i / n) * plotW
  const y = (v: number) => H - ((v - min) / (max - min)) * H

  // Rejilla + etiquetas de precio
  ctx.strokeStyle = '#e5e7eb'
  ctx.fillStyle = '#94a3b8'
  ctx.font = '10px monospace'
  ctx.textAlign = 'right'
  const rows = 5
  for (let r = 0; r <= rows; r++) {
    const val = min + ((max - min) * r) / rows
    const yy = y(val)
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(plotW, yy)
    ctx.stroke()
    ctx.fillText(val.toFixed(1), W - 4, yy + 3)
  }

  // Velas
  const cw = Math.max(1, plotW / n - 1)
  for (let i = 0; i < n; i++) {
    const c = candles[i]
    const cx = x(i) + cw / 2
    const up = c.close >= c.open
    ctx.strokeStyle = up ? '#16a34a' : '#dc2626'
    ctx.fillStyle = up ? '#16a34a' : '#dc2626'
    // mecha
    ctx.beginPath()
    ctx.moveTo(cx, y(c.high))
    ctx.lineTo(cx, y(c.low))
    ctx.stroke()
    // cuerpo
    const yo = y(c.open)
    const yc = y(c.close)
    ctx.fillRect(x(i), Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)))
  }

  // Plots (líneas)
  for (const p of plots) {
    ctx.strokeStyle = p.color
    ctx.lineWidth = 1.6
    ctx.beginPath()
    let started = false
    for (let i = 0; i < p.data.length; i++) {
      const v = p.data[i]
      if (!Number.isFinite(v)) { started = false; continue }
      const px = x(i) + cw / 2
      const py = y(v)
      if (!started) { ctx.moveTo(px, py); started = true }
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }

  // Marcadores de compra/venta (triángulos sobre las velas)
  const tri = 5
  for (const m of markers) {
    if (m.index < 0 || m.index >= n) continue
    const c = candles[m.index]
    const cx = x(m.index) + cw / 2
    if (m.side === 'buy') {
      // Triángulo verde apuntando arriba, debajo de la vela
      const baseY = y(c.low) + 8
      ctx.fillStyle = '#16a34a'
      ctx.beginPath()
      ctx.moveTo(cx, baseY - tri)
      ctx.lineTo(cx - tri, baseY + tri)
      ctx.lineTo(cx + tri, baseY + tri)
      ctx.closePath()
      ctx.fill()
    } else {
      // Triángulo rojo apuntando abajo, encima de la vela
      const baseY = y(c.high) - 8
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.moveTo(cx, baseY + tri)
      ctx.lineTo(cx - tri, baseY - tri)
      ctx.lineTo(cx + tri, baseY - tri)
      ctx.closePath()
      ctx.fill()
    }
  }
}