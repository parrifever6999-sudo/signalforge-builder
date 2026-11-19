import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type {
  BuilderNode, IndicatorKind, SourceKind, PlotStyle, ConditionKind, ActionKind, BlockData,
} from '../types'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import {
  INDICATORS, SOURCES, PLOT_COLORS, PLOT_STYLES, TYPE_COLORS, CONDITIONS, ACTIONS,
} from '../blocks/definitions'

const isLogic = (d: BlockData) => d.kind === 'condition' && CONDITIONS[d.condition]?.kind === 'logic'

function SourceSelect({ value, onChange, label }: {
  value: SourceKind
  onChange: (v: SourceKind) => void
  label: string
}) {
  return (
    <select className="nodrag" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as SourceKind)}>
      {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  )
}

const BlockNode = memo(({ id, data: d }: NodeProps<BuilderNode>) => {
  const t = useT()
  const update = useBuilder((s) => s.updateNodeData)
  const remove = useBuilder((s) => s.removeNode)
  // "b" is the second input of a condition; anything else lands on the first.
  const wiredA = useBuilder((s) => s.edges.some((e) => e.target === id && e.targetHandle !== 'b'))
  const wiredB = useBuilder((s) => s.edges.some((e) => e.target === id && e.targetHandle === 'b'))

  if (!d) return null

  const logic = isLogic(d)
  const accent = logic ? '#2dd4bf' : TYPE_COLORS[d.kind]
  const kindLabel = t(logic ? 'kind.logic' : `kind.${d.kind}`)
  const indicator = d.kind === 'indicator' ? INDICATORS[d.indicator] : null
  const singleInput = d.kind === 'action' || d.kind === 'plot' || (indicator?.usesSource ?? false)
  const hasOutput = d.kind !== 'plot' && d.kind !== 'action'

  return (
    <div className="block-node" style={{ borderTopColor: accent }}>
      {singleInput && <Handle type="target" position={Position.Left} />}

      <div className="block-head">
        <span className="block-kind" style={{ color: accent }}>{kindLabel}</span>
        <button
          type="button" className="block-delete nodrag"
          onClick={() => remove(id)} aria-label={t('node.delete')} title={t('node.delete')}
        >
          &times;
        </button>
      </div>

      <div className="block-body">
        {d.kind === 'source' && (
          <SourceSelect value={d.source} label={t('kind.source')} onChange={(v) => update(id, { source: v })} />
        )}

        {d.kind === 'value' && (
          <input
            className="nodrag" type="number" step="any" aria-label={t('node.value')} value={d.value}
            onChange={(e) => update(id, { value: e.target.value === '' ? 0 : Number(e.target.value) })}
          />
        )}

        {d.kind === 'indicator' && indicator && (
          <>
            <select
              className="nodrag" aria-label={t('kind.indicator')} value={d.indicator}
              onChange={(e) => {
                const key = e.target.value as IndicatorKind
                update(id, { indicator: key, length: INDICATORS[key].defaultLength, source: INDICATORS[key].defaultSource })
              }}
            >
              {(Object.keys(INDICATORS) as IndicatorKind[]).map((k) => (
                <option key={k} value={k}>{INDICATORS[k].label}</option>
              ))}
            </select>
            {indicator.usesLength && (
              <label className="field">
                <span>{t('node.length')}</span>
                <input
                  className="nodrag" type="number" min={1} max={5000} value={d.length}
                  onChange={(e) => update(id, { length: Math.max(1, Math.round(Number(e.target.value)) || 1) })}
                />
              </label>
            )}
            {indicator.usesSource && (wiredA
              ? <p className="block-note">{t('node.sourceConnected')}</p>
              : (
                <label className="field">
                  <span>{t('node.source')}</span>
                  <SourceSelect value={d.source} label={t('node.source')} onChange={(v) => update(id, { source: v })} />
                </label>
              ))}
          </>
        )}

        {d.kind === 'condition' && (
          <>
            <select
              className="nodrag" aria-label={kindLabel} value={d.condition}
              onChange={(e) => update(id, { condition: e.target.value as ConditionKind })}
            >
              {(Object.keys(CONDITIONS) as ConditionKind[])
                .filter((k) => (CONDITIONS[k].kind === 'logic') === logic)
                .map((k) => <option key={k} value={k}>{t(`cond.${k}`)}</option>)}
            </select>

            <div className="port-row">
              <Handle type="target" position={Position.Left} id="a" />
              <span className="port-name">A</span>
              {!logic && !wiredA && (
                <SourceSelect
                  value={d.sourceA} label={t('node.unconnected', { side: 'A' })}
                  onChange={(v) => update(id, { sourceA: v })}
                />
              )}
            </div>
            <div className="port-row">
              <Handle type="target" position={Position.Left} id="b" />
              <span className="port-name">B</span>
              {!logic && !wiredB && (
                <SourceSelect
                  value={d.sourceB} label={t('node.unconnected', { side: 'B' })}
                  onChange={(v) => update(id, { sourceB: v })}
                />
              )}
            </div>
            {logic && !(wiredA && wiredB) && <p className="block-note warn">{t('node.needsTwo')}</p>}
          </>
        )}

        {d.kind === 'action' && (
          <>
            <select
              className="nodrag" aria-label={kindLabel} value={d.action}
              onChange={(e) => update(id, { action: e.target.value as ActionKind })}
            >
              {ACTIONS.map((k) => <option key={k} value={k}>{t(`action.${k}`)}</option>)}
            </select>
            {!wiredA && <p className="block-note warn">{t('node.needsCondition')}</p>}
          </>
        )}

        {d.kind === 'plot' && (
          <>
            <input
              className="nodrag" type="text" maxLength={40} aria-label={t('node.plotTitle')}
              placeholder={t('node.plotTitle')} value={d.title}
              onChange={(e) => update(id, { title: e.target.value })}
            />
            <div className="field-row">
              <select
                className="nodrag" aria-label="color" value={d.color}
                onChange={(e) => update(id, { color: e.target.value })}
                style={{ borderLeft: `4px solid ${d.color}` }}
              >
                {PLOT_COLORS.map((c) => <option key={c.key} value={c.key}>{t(c.pine)}</option>)}
              </select>
              <select
                className="nodrag" aria-label="style" value={d.style}
                onChange={(e) => update(id, { style: e.target.value as PlotStyle })}
              >
                {PLOT_STYLES.map((s) => <option key={s.key} value={s.key}>{t(`style.${s.key}`)}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {hasOutput && <Handle type="source" position={Position.Right} />}
    </div>
  )
})

BlockNode.displayName = 'BlockNode'

export const nodeTypes = { block: BlockNode }
