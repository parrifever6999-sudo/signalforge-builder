import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { cleanSymbol } from '../codegen/generator'
import type { StopKind, TargetKind } from '../types'

const STOPS: StopKind[] = ['none', 'atr', 'percent']
const TARGETS: TargetKind[] = ['none', 'rr', 'atr', 'percent']

function NumberField({ value, onChange, label, min, step }: {
  value: number
  onChange: (n: number) => void
  label: string
  min: number
  step: number
}) {
  return (
    <input
      type="number" aria-label={label} min={min} step={step} value={value}
      onChange={(e) => {
        const n = Number(e.target.value)
        if (e.target.value !== '' && Number.isFinite(n)) onChange(Math.max(0, n))
      }}
    />
  )
}

// Lot, symbol, stop and target: what every order of the strategy carries.
export function SettingsPanel() {
  const t = useT()
  const settings = useBuilder((s) => s.settings)
  const set = useBuilder((s) => s.setSettings)

  return (
    <section className="settings-panel">
      <div className="panel-head"><h3>{t('settings.title')}</h3></div>

      <div className="form-grid">
        <div className="field wide">
          <span>{t('settings.stop')}</span>
          <div className="field-row">
            <select
              aria-label={t('settings.stop')} value={settings.stopKind}
              onChange={(e) => set({ stopKind: e.target.value as StopKind })}
            >
              {STOPS.map((k) => <option key={k} value={k}>{t(`stop.${k}`)}</option>)}
            </select>
            {settings.stopKind !== 'none' && (
              <NumberField
                label={t('settings.stop')} value={settings.stopValue} min={0.1} step={0.1}
                onChange={(n) => set({ stopValue: n })}
              />
            )}
          </div>
        </div>

        <div className="field wide">
          <span>{t('settings.target')}</span>
          <div className="field-row">
            <select
              aria-label={t('settings.target')} value={settings.targetKind}
              onChange={(e) => set({ targetKind: e.target.value as TargetKind })}
            >
              {TARGETS.map((k) => <option key={k} value={k}>{t(`target.${k}`)}</option>)}
            </select>
            {settings.targetKind !== 'none' && (
              <NumberField
                label={t('settings.target')} value={settings.targetValue} min={0.1} step={0.1}
                onChange={(n) => set({ targetValue: n })}
              />
            )}
          </div>
        </div>

        <label className="field">
          <span>{t('settings.lot')}</span>
          <NumberField
            label={t('settings.lot')} value={settings.lot} min={0.01} step={0.01}
            onChange={(n) => set({ lot: n })}
          />
        </label>

        <label className="field">
          <span>{t('settings.symbol')}</span>
          <input
            type="text" maxLength={24} value={settings.symbol} placeholder={t('settings.symbolPlaceholder')}
            onChange={(e) => set({ symbol: cleanSymbol(e.target.value) })}
          />
        </label>
      </div>
      <p className="fine">{t('settings.symbolHint')}</p>
    </section>
  )
}
