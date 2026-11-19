import { memo, useEffect } from 'react'
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type {
  BuilderNode, IndicatorKind, SourceKind, PlotStyle, ConditionKind, ActionKind,
} from '../types'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import {
  INDICATORS, INDICATOR_GROUPS, SOURCES, PLOT_COLORS, PLOT_STYLES, TYPE_COLORS, CONDITIONS, ACTIONS,
  HTF_TIMEFRAMES, DEFAULT_HTF, TIMEZONES, WEEKDAYS, conditionColor, conditionInputs, paramValues, swappable,
} from '../blocks/definitions'

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

// A number field that keeps what is being typed and only hands on valid values.
function NumberInput({ value, min, max, step, label, onChange }: {
  value: number
  min: number
  max: number
  step: number
  label: string
  onChange: (n: number) => void
}) {
  return (
    <input
      className="nodrag" type="number" aria-label={label} min={min} max={max} step={step} value={value}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (e.target.value !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
      }}
    />
  )
}

const HOURS_FROM = Array.from({ length: 24 }, (_, h) => h)
const HOURS_TO = Array.from({ length: 24 }, (_, h) => h + 1)
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

const BlockNode = memo(({ id, data: d }: NodeProps<BuilderNode>) => {
  const t = useT()
  const update = useBuilder((s) => s.updateNodeData)
  const remove = useBuilder((s) => s.removeNode)
  // "b" is the second input of a condition; anything else lands on the first.
  const wiredA = useBuilder((s) => s.edges.some((e) => e.target === id && e.targetHandle !== 'b'))
  const wiredB = useBuilder((s) => s.edges.some((e) => e.target === id && e.targetHandle === 'b'))

  // The handles of a block depend on what it is set to (Bollinger has three
  // outputs, RSI one): React Flow must measure them again when that changes.
  const refresh = useUpdateNodeInternals()
  const shape = d?.kind === 'indicator' ? d.indicator : d?.kind === 'condition' ? d.condition : ''
  useEffect(() => refresh(id), [id, shape, refresh])

  if (!d) return null

  const family = d.kind === 'condition' ? CONDITIONS[d.condition]?.kind : null
  const logic = family === 'logic' || family === 'not'
  const timeFilter = family === 'session' || family === 'weekdays'
  const accent = d.kind === 'condition' ? conditionColor(d.condition) : TYPE_COLORS[d.kind]
  const kindLabel = t(logic ? 'kind.logic' : timeFilter ? 'kind.time' : `kind.${d.kind}`)
  const indicator = d.kind === 'indicator' ? INDICATORS[d.indicator] : null
  const outputs = indicator && indicator.outputs.length > 1 ? indicator.outputs : null
  const singleInput = d.kind === 'action' || d.kind === 'plot' || (indicator?.usesSource ?? false)
  const hasOutput = d.kind !== 'plot' && d.kind !== 'action' && !outputs
  const inputs = d.kind === 'condition' ? conditionInputs(d.condition) : null
  const params = indicator ? paramValues(indicator, d.kind === 'indicator' ? d.params : undefined) : {}

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
              onChange={(e) => update(id, { indicator: e.target.value as IndicatorKind })}
            >
              {INDICATOR_GROUPS.map((group) => (
                <optgroup key={group} label={t(`group.${group}`)}>
                  {(Object.keys(INDICATORS) as IndicatorKind[])
                    .filter((k) => INDICATORS[k].group === group && (!INDICATORS[k].legacy || k === d.indicator))
                    // The blocks kept for old saves have no translated name.
                    .map((k) => (
                      <option key={k} value={k}>{INDICATORS[k].legacy ? INDICATORS[k].label : t(`block.${k}.label`)}</option>
                    ))}
                </optgroup>
              ))}
            </select>
            {indicator.usesTf && (
              <label className="field">
                <span>{t('node.timeframe')}</span>
                <select
                  className="nodrag" value={d.tf ?? DEFAULT_HTF}
                  onChange={(e) => update(id, { tf: e.target.value })}
                >
                  {HTF_TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{t(`tf.${tf}`)}</option>)}
                </select>
              </label>
            )}
            {indicator.usesLength && (
              <label className="field">
                <span>{t('node.length')}</span>
                <input
                  className="nodrag" type="number" min={1} max={5000} value={d.length}
                  onChange={(e) => update(id, { length: Math.max(1, Math.round(Number(e.target.value)) || 1) })}
                />
              </label>
            )}
            {indicator.params.length > 0 && (
              <div className="param-grid">
                {indicator.params.map((p) => (
                  <label key={p.key} className="field">
                    <span>{t(`param.${p.key}`)}</span>
                    <NumberInput
                      label={t(`param.${p.key}`)} value={params[p.key]} min={p.min} max={p.max} step={p.step}
                      onChange={(n) => update(id, { params: { ...params, [p.key]: n } })}
                    />
                  </label>
                ))}
              </div>
            )}
            {indicator.usesSource && (wiredA
              ? <p className="block-note">{t('node.sourceConnected')}</p>
              : (
                <label className="field">
                  <span>{t('node.source')}</span>
                  <SourceSelect value={d.source} label={t('node.source')} onChange={(v) => update(id, { source: v })} />
                </label>
              ))}
            {outputs && (
              <div className="out-list">
                {outputs.map((o) => (
                  <div key={o.key} className="out-row">
                    <span className="port-name">{t(`out.${o.key}`)}</span>
                    <Handle type="source" position={Position.Right} id={o.key} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {d.kind === 'condition' && (
          <>
            {swappable(d.condition).length > 1 && (
              <select
                className="nodrag" aria-label={kindLabel} value={d.condition}
                onChange={(e) => update(id, { condition: e.target.value as ConditionKind })}
              >
                {swappable(d.condition).map((k) => <option key={k} value={k}>{t(`cond.${k}`)}</option>)}
              </select>
            )}
            {swappable(d.condition).length === 1 && <p className="block-title">{t(`cond.${d.condition}`)}</p>}

            {inputs?.handles.map((h) => {
              const wired = h === 'a' ? wiredA : wiredB
              return (
                <div key={h} className="port-row">
                  <Handle type="target" position={Position.Left} id={h} />
                  {inputs.handles.length > 1 && <span className="port-name">{h.toUpperCase()}</span>}
                  {inputs.type === 'num' && !wired && (
                    <SourceSelect
                      value={h === 'a' ? d.sourceA : d.sourceB} label={t('node.unconnected', { side: h.toUpperCase() })}
                      onChange={(v) => update(id, h === 'a' ? { sourceA: v } : { sourceB: v })}
                    />
                  )}
                  {inputs.type === 'num' && wired && inputs.handles.length === 1 && (
                    <span className="block-note">{t('node.sourceConnected')}</span>
                  )}
                </div>
              )
            })}

            {family === 'trend' && (
              <label className="field">
                <span>{t('node.bars')}</span>
                <NumberInput
                  label={t('node.bars')} value={d.length ?? 3} min={1} max={500} step={1}
                  onChange={(n) => update(id, { length: Math.round(n) })}
                />
              </label>
            )}

            {family === 'session' && (
              <div className="field-row">
                <label className="field">
                  <span>{t('node.from')}</span>
                  <select
                    className="nodrag" value={d.from ?? 8}
                    onChange={(e) => update(id, { from: Number(e.target.value) })}
                  >
                    {HOURS_FROM.map((h) => <option key={h} value={h}>{hh(h)}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>{t('node.to')}</span>
                  <select
                    className="nodrag" value={d.to ?? 17}
                    onChange={(e) => update(id, { to: Number(e.target.value) })}
                  >
                    {HOURS_TO.map((h) => <option key={h} value={h}>{hh(h)}</option>)}
                  </select>
                </label>
              </div>
            )}

            {family === 'weekdays' && (
              <div className="day-row" role="group" aria-label={t('cond.weekdays')}>
                {WEEKDAYS.map((day) => {
                  const days = d.days ?? '23456'
                  const on = days.includes(day)
                  return (
                    <button
                      key={day} type="button" className={`day nodrag${on ? ' on' : ''}`} aria-pressed={on}
                      title={t(`day.${day}.long`)}
                      onClick={() => update(id, {
                        days: on ? days.replace(day, '') : [...(days + day)].sort().join(''),
                      })}
                    >
                      {t(`day.${day}`)}
                    </button>
                  )
                })}
              </div>
            )}

            {timeFilter && (
              <label className="field">
                <span>{t('node.timezone')}</span>
                <select
                  className="nodrag" value={d.tz ?? 'UTC'}
                  onChange={(e) => update(id, { tz: e.target.value })}
                >
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
                </select>
              </label>
            )}

            {family === 'logic' && !(wiredA && wiredB) && <p className="block-note warn">{t('node.needsTwo')}</p>}
            {family === 'not' && !wiredA && <p className="block-note warn">{t('node.needsCondition')}</p>}
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
