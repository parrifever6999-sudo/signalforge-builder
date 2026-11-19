import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { BuilderNode } from '../types'
import { useBuilder } from '../store/builderStore'
import {
  INDICATORS, SOURCES, PLOT_COLORS, PLOT_STYLES, TYPE_COLORS, CONDITIONS, ACTIONS,
} from '../blocks/definitions'
import type { IndicatorKind, SourceKind, PlotStyle, ConditionKind, ActionKind } from '../types'

const BlockNode = memo(({ id, data, selected }: NodeProps<BuilderNode>) => {
  const updateNodeData = useBuilder((s) => s.updateNodeData)
  const removeNode = useBuilder((s) => s.removeNode)
  const d = data

  if (!d) return null

  const accent =
    d.kind === 'source' ? TYPE_COLORS.source
    : d.kind === 'indicator' ? TYPE_COLORS.indicator
    : d.kind === 'condition' ? TYPE_COLORS.condition
    : d.kind === 'action' ? TYPE_COLORS.action
    : TYPE_COLORS.plot

  const hasInput = d.kind !== 'source'
  const hasOutput = d.kind !== 'plot' && d.kind !== 'action'

  return (
    <div
      className="block-node"
      style={{ borderTopColor: accent }}
      onDoubleClick={() => removeNode(id)}
      title="Doble clic para eliminar"
    >
      {hasInput && d.kind !== 'condition' && (
        <Handle type="target" position={Position.Top} />
      )}

      {d.kind === 'condition' && (
        <>
          <Handle type="target" position={Position.Top} id="a" style={{ left: '35%' }} />
          <Handle type="target" position={Position.Top} id="b" style={{ left: '65%' }} />
          <div className="handle-labels">
            <span style={{ left: '35%' }}>A</span>
            <span style={{ left: '65%' }}>B</span>
          </div>
        </>
      )}

      <div className="block-head" style={{ background: accent }}>
        <span className="block-kind">{d.kind.toUpperCase()}</span>
      </div>

      <div className="block-body">
        {d.kind === 'source' && (
          <select
            value={d.source}
            onChange={(e) => updateNodeData(id, { source: e.target.value as SourceKind })}
          >
            {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        )}

        {d.kind === 'indicator' && (
          <>
            <select
              value={d.indicator}
              onChange={(e) => {
                const key = e.target.value as IndicatorKind
                updateNodeData(id, { indicator: key, length: INDICATORS[key].defaultLength })
              }}
            >
              {(Object.keys(INDICATORS) as IndicatorKind[]).map((k) => (
                <option key={k} value={k}>{INDICATORS[k].label}</option>
              ))}
            </select>
            <label className="field">
              <span>Periodo</span>
              <input
                type="number" min={1} max={500} value={d.length}
                onChange={(e) => updateNodeData(id, { length: Math.max(1, +e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Fuente (si no se conecta)</span>
              <select
                value={d.source}
                onChange={(e) => updateNodeData(id, { source: e.target.value as SourceKind })}
              >
                {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </>
        )}

        {d.kind === 'condition' && (
          <>
            <select
              value={d.condition}
              onChange={(e) => updateNodeData(id, { condition: e.target.value as ConditionKind })}
            >
              {(Object.keys(CONDITIONS) as ConditionKind[]).map((k) => (
                <option key={k} value={k}>{CONDITIONS[k].label}</option>
              ))}
            </select>
            <div className="field-row">
              <label className="field">
                <span>Entrada A</span>
                <select
                  value={d.sourceA}
                  onChange={(e) => updateNodeData(id, { sourceA: e.target.value as SourceKind })}
                >
                  {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Entrada B</span>
                <select
                  value={d.sourceB}
                  onChange={(e) => updateNodeData(id, { sourceB: e.target.value as SourceKind })}
                >
                  {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            </div>
          </>
        )}

        {d.kind === 'action' && (
          <select
            value={d.action}
            onChange={(e) => updateNodeData(id, { action: e.target.value as ActionKind })}
          >
            {(Object.keys(ACTIONS) as ActionKind[]).map((k) => (
              <option key={k} value={k}>{ACTIONS[k].label}</option>
            ))}
          </select>
        )}

        {d.kind === 'plot' && (
          <>
            <input
              type="text" value={d.title}
              onChange={(e) => updateNodeData(id, { title: e.target.value })}
              placeholder="Título del plot"
            />
            <div className="field-row">
              <select
                value={d.color}
                onChange={(e) => updateNodeData(id, { color: e.target.value })}
              >
                {PLOT_COLORS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <select
                value={d.style}
                onChange={(e) => updateNodeData(id, { style: e.target.value as PlotStyle })}
              >
                {PLOT_STYLES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {selected && <span className="block-badge">seleccionado</span>}

      {hasOutput && <Handle type="source" position={Position.Bottom} />}
    </div>
  )
})

BlockNode.displayName = 'BlockNode'

export const nodeTypes = { block: BlockNode }