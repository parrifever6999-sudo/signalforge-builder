import { useBuilder } from '../store/builderStore'

export function Toolbar() {
  const strategyTitle = useBuilder((s) => s.strategyTitle)
  const setStrategyTitle = useBuilder((s) => s.setStrategyTitle)
  const run = useBuilder((s) => s.run)
  const isRunning = useBuilder((s) => s.isRunning)
  const loadDemo = useBuilder((s) => s.loadDemo)
  const clear = useBuilder((s) => s.clear)
  const instance = useBuilder((s) => s.instance)

  const onSave = () => {
    const graph = useBuilder.getState().saveGraph()
    if (!graph) return
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${strategyTitle || 'strategy'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onFit = () => instance?.fitView({ padding: 0.2 })

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo">◆</span>
        <strong>Pine Builder</strong>
        <span className="tag">PineTS engine</span>
      </div>

      <input
        className="title-input"
        value={strategyTitle}
        onChange={(e) => setStrategyTitle(e.target.value)}
        placeholder="Nombre de la estrategia"
      />

      <div className="actions">
        <button onClick={loadDemo}>Cargar ejemplo</button>
        <button onClick={onFit}>Centrar vista</button>
        <button onClick={onSave}>Guardar JSON</button>
        <button onClick={clear}>Limpiar</button>
        <button className="primary" onClick={() => run()} disabled={isRunning}>
          {isRunning ? 'Ejecutando…' : '▶ Ejecutar'}
        </button>
      </div>
    </header>
  )
}