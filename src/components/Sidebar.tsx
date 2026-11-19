import { PALETTE, PALETTE_GROUPS, TYPE_COLORS } from '../blocks/definitions'
import type { BlockMeta } from '../blocks/definitions'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'

export const DRAG_TYPE = 'application/x-sf-block'

// Block palette: drag onto the canvas, or click to drop one in the middle.
export function Sidebar() {
  const addBlock = useBuilder((s) => s.addBlock)
  const t = useT()

  const onDragStart = (e: React.DragEvent, b: BlockMeta) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ key: b.key, type: b.type }))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className="sidebar">
      <p className="tagline">{t('app.tagline')}</p>
      <h2>{t('sidebar.title')}</h2>
      <p className="hint">{t('sidebar.hint')}</p>
      {PALETTE_GROUPS.map((group) => (
        <section key={group} className="palette-group">
          <h3>{t(`group.${group}`)}</h3>
          <div className="palette">
            {PALETTE.filter((b) => b.group === group).map((b) => (
              <button
                key={b.key} type="button" className="palette-item" draggable
                onDragStart={(e) => onDragStart(e, b)}
                onClick={() => addBlock(b.key, b.type)}
                title={t(`block.${b.key}.desc`)}
              >
                <span
                  className="dot"
                  style={{ background: b.key === 'and' || b.key === 'or' ? '#2dd4bf' : TYPE_COLORS[b.type] }}
                />
                <span>
                  <strong>{t(`block.${b.key}.label`)}</strong>
                  <small>{t(`block.${b.key}.desc`)}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </aside>
  )
}
