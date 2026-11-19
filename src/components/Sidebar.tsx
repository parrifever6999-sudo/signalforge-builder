import { useState } from 'react'
import { PALETTE, PALETTE_GROUPS, TYPE_COLORS, CONDITIONS, conditionColor } from '../blocks/definitions'
import type { BlockMeta } from '../blocks/definitions'
import type { ConditionKind } from '../types'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'

export const DRAG_TYPE = 'application/x-sf-block'

const dotColor = (b: BlockMeta) =>
  b.type === 'condition' && b.key in CONDITIONS ? conditionColor(b.key as ConditionKind) : TYPE_COLORS[b.type]

// Block palette: drag onto the canvas, or click to drop one in the middle.
export function Sidebar() {
  const addBlock = useBuilder((s) => s.addBlock)
  const t = useT()
  const [query, setQuery] = useState('')

  const onDragStart = (e: React.DragEvent, b: BlockMeta) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ key: b.key, type: b.type }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const q = query.trim().toLowerCase()
  const matches = (b: BlockMeta) =>
    !q || `${t(`block.${b.key}.label`)} ${t(`block.${b.key}.desc`)} ${b.key}`.toLowerCase().includes(q)
  const found = PALETTE.filter(matches)

  return (
    <aside className="sidebar">
      <p className="tagline">{t('app.tagline')}</p>
      <h2>{t('sidebar.title')}</h2>
      <p className="hint">{t('sidebar.hint')}</p>
      <input
        className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={t('sidebar.search', { n: PALETTE.length })} aria-label={t('sidebar.search', { n: PALETTE.length })}
      />
      {found.length === 0 && <p className="hint">{t('sidebar.none')}</p>}
      {PALETTE_GROUPS.map((group) => {
        const items = found.filter((b) => b.group === group)
        if (items.length === 0) return null
        return (
          // Every group starts open; while searching they all stay open.
          <details key={group} className="palette-group" open>
            <summary>{t(`group.${group}`)} <span className="count">{items.length}</span></summary>
            <div className="palette">
              {items.map((b) => (
                <button
                  key={b.key} type="button" className="palette-item" draggable
                  onDragStart={(e) => onDragStart(e, b)}
                  onClick={() => addBlock(b.key, b.type)}
                  title={t(`block.${b.key}.desc`)}
                >
                  <span className="dot" style={{ background: dotColor(b) }} />
                  <span>
                    <strong>{t(`block.${b.key}.label`)}</strong>
                    <small>{t(`block.${b.key}.desc`)}</small>
                  </span>
                </button>
              ))}
            </div>
          </details>
        )
      })}
    </aside>
  )
}
