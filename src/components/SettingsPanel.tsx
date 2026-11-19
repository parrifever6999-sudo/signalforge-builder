import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { cleanSymbol } from '../codegen/generator'
import type { BreakevenKind, SizeKind, StopKind, TargetKind, TrailKind } from '../types'

const STOPS: StopKind[] = ['none', 'atr', 'percent']
const TARGETS: TargetKind[] = ['none', 'rr', 'atr', 'percent']
const TRAILS: TrailKind[] = ['none', 'atr', 'percent']
const BREAKEVENS: BreakevenKind[] = ['none', 'rr', 'atr', 'percent']
const SIZES: SizeKind[] = ['equity', 'risk']

function NumberField({ value, onChange, label, min, step, max }: {
  value: number
  onChange: (n: number) => void
  label: string
  min: number
  step: number
  max?: number
}) {
  return (
    <input
      type="number" aria-label={label} min={min} max={max} step={step} value={value}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (e.target.value !== '' && Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(0, n)))
      }}
    />
  )
}

// A kind (none, ATR, percent...) with the number that goes with it.
function KindRow<K extends string>({ label, hint, kinds, prefix, kind, value, onKind, onValue }: {
  label: string
  hint?: string
  kinds: K[]
  prefix: string
  kind: K
  value: number
  onKind: (k: K) => void
  onValue: (n: number) => void
}) {
  const t = useT()
  return (
    <div className="field wide">
      <span>{label}</span>
      <div className="field-row">
        <select aria-label={label} value={kind} onChange={(e) => onKind(e.target.value as K)}>
          {kinds.map((k) => <option key={k} value={k}>{t(`${prefix}.${k}`)}</option>)}
        </select>
        {kind !== 'none' && <NumberField label={label} value={value} min={0.1} step={0.1} onChange={onValue} />}
      </div>
      {hint && kind !== 'none' && <small className="field-hint">{hint}</small>}
    </div>
  )
}

// How a trade is protected and sized, what it costs, and what goes to MT5.
export function SettingsPanel() {
  const t = useT()
  const s = useBuilder((st) => st.settings)
  const set = useBuilder((st) => st.setSettings)

  return (
    <section className="settings-panel">
      <div className="panel-head"><h3>{t('settings.title')}</h3></div>

      <div className="form-grid">
        <KindRow
          label={t('settings.stop')} kinds={STOPS} prefix="stop" kind={s.stopKind} value={s.stopValue}
          onKind={(k) => set({ stopKind: k })} onValue={(n) => set({ stopValue: n })}
        />
        <KindRow
          label={t('settings.target')} kinds={TARGETS} prefix="target" kind={s.targetKind} value={s.targetValue}
          onKind={(k) => set({ targetKind: k })} onValue={(n) => set({ targetValue: n })}
        />
        <KindRow
          label={t('settings.trail')} hint={t('settings.trailHint')}
          kinds={TRAILS} prefix="trail" kind={s.trailKind} value={s.trailValue}
          onKind={(k) => set({ trailKind: k })} onValue={(n) => set({ trailValue: n })}
        />
        <KindRow
          label={t('settings.be')} hint={t('settings.beHint')}
          kinds={BREAKEVENS} prefix="be" kind={s.beKind} value={s.beValue}
          onKind={(k) => set({ beKind: k })} onValue={(n) => set({ beValue: n })}
        />

        <label className="field wide">
          <span>{t('settings.maxBars')}</span>
          <NumberField
            label={t('settings.maxBars')} value={s.maxBars} min={0} max={10000} step={1}
            onChange={(n) => set({ maxBars: Math.round(n) })}
          />
        </label>

        <div className="field wide">
          <span>{t('settings.size')}</span>
          <div className="field-row">
            <select
              aria-label={t('settings.size')} value={s.sizeKind}
              onChange={(e) => {
                const kind = e.target.value as SizeKind
                // 100% of the balance and 1% of risk are the usual starting points.
                set({ sizeKind: kind, sizeValue: kind === 'risk' ? 1 : 100 })
              }}
            >
              {SIZES.map((k) => <option key={k} value={k}>{t(`size.${k}`)}</option>)}
            </select>
            <NumberField
              label={t('settings.size')} value={s.sizeValue} min={s.sizeKind === 'risk' ? 0.1 : 1}
              max={s.sizeKind === 'risk' ? 100 : 500} step={s.sizeKind === 'risk' ? 0.1 : 5}
              onChange={(n) => set({ sizeValue: n })}
            />
          </div>
          <small className="field-hint">{t(`settings.sizeHint.${s.sizeKind}`)}</small>
        </div>

        <label className="field">
          <span>{t('settings.fee')}</span>
          <NumberField
            label={t('settings.fee')} value={s.feePct} min={0} max={5} step={0.01}
            onChange={(n) => set({ feePct: n })}
          />
        </label>
        <label className="field">
          <span>{t('settings.slip')}</span>
          <NumberField
            label={t('settings.slip')} value={s.slipPct} min={0} max={5} step={0.01}
            onChange={(n) => set({ slipPct: n })}
          />
        </label>

        <label className="field">
          <span>{t('settings.lot')}</span>
          <NumberField
            label={t('settings.lot')} value={s.lot} min={0.01} step={0.01}
            onChange={(n) => set({ lot: n })}
          />
        </label>

        <label className="field">
          <span>{t('settings.symbol')}</span>
          <input
            type="text" maxLength={24} value={s.symbol} placeholder={t('settings.symbolPlaceholder')}
            onChange={(e) => set({ symbol: cleanSymbol(e.target.value) })}
          />
        </label>
      </div>
      <p className="fine">{t('settings.symbolHint')}</p>
    </section>
  )
}
