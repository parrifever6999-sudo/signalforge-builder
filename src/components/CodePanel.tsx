import { useMemo } from 'react'
import { useBuilder } from '../store/builderStore'
import { generatePine } from '../codegen/generator'
import type { BuilderNode } from '../types'

// Panel que muestra el código Pine Script generado en vivo
export function CodePanel() {
  const nodes = useBuilder((s) => s.nodes)
  const edges = useBuilder((s) => s.edges)
  const strategyTitle = useBuilder((s) => s.strategyTitle)
  const runResult = useBuilder((s) => s.runResult)

  const { code, error } = useMemo(
    () => generatePine(nodes as BuilderNode[], edges, strategyTitle),
    [nodes, edges, strategyTitle],
  )

  const onCopy = () => navigator.clipboard?.writeText(code)

  const onExport = () => {
    if (!code) return
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safe = (strategyTitle || 'strategy').replace(/[^a-z0-9_-]+/gi, '_')
    a.download = `${safe}.pine`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="code-panel">
      <div className="panel-head">
        <h3>Pine Script v6</h3>
        <div className="head-actions">
          <button onClick={onCopy} disabled={!code}>Copiar</button>
          <button onClick={onExport} disabled={!code} className="primary">↓ .pine</button>
        </div>
      </div>

      {error && <div className="notice warn">{error}</div>}
      {!error && !code && (
        <div className="notice">Añade bloques y conecta un <b>Plot</b> para ver el código.</div>
      )}

      <pre className="code-block">{code || '// — sin código —'}</pre>

      {runResult && !runResult.ok && (
        <div className="notice error">⚠ {runResult.error}</div>
      )}
      {runResult && runResult.ok && (
        <div className="notice ok">
          ✓ Ejecutado sobre {runResult.barCount} velas · {runResult.plots.length} plot(s)
          {runResult.isStrategy && ` · ${runResult.markers.length} señales`}
        </div>
      )}
    </section>
  )
}