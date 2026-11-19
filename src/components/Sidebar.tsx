import { PALETTE } from '../blocks/definitions'
import { useBuilder } from '../store/builderStore'

// Paleta lateral: arrastra bloques al lienzo
export function Sidebar() {
  const addBlock = useBuilder((s) => s.addBlock)

  const onDragStart = (e: React.DragEvent, blockKey: string, type: string) => {
    e.dataTransfer.setData('application/pineblock', JSON.stringify({ blockKey, type }))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className="sidebar">
      <h2>Bloques</h2>
      <p className="hint">Arrastra al lienzo o haz clic para añadir</p>
      <div className="palette">
        {PALETTE.map((b) => (
          <button
            key={b.key}
            className="palette-item"
            draggable
            onDragStart={(e) => onDragStart(e, b.key, b.type)}
            onClick={() => addBlock(b.key, b.type)}
            title={b.description}
          >
            <span className="dot" style={{ background: b.color }} />
            <span>
              <strong>{b.label}</strong>
              <small>{b.description}</small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  )
}