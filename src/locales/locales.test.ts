import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import en from './en.json'
import es from './es.json'
import { translate } from '../i18n'
import {
  ACTIONS, CONDITIONS, HTF_TIMEFRAMES, INDICATORS, PALETTE, PALETTE_GROUPS, PLOT_COLORS, PLOT_STYLES, WEEKDAYS,
} from '../blocks/definitions'
import { EXAMPLES } from '../store/examples'
import { MARKET_GROUPS } from '../data/market'
import { navLinks } from '../links'

const SRC = join(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()

describe('locales', () => {
  it('both languages have the same keys', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
  })

  it('every text keeps the same placeholders in both languages', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it('no text is empty', () => {
    for (const dict of [en, es]) {
      for (const [key, text] of Object.entries(dict)) expect(text.trim(), key).not.toBe('')
    }
  })

  it('every key the code asks for exists', () => {
    const used = new Set<string>()
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8')
      // t('some.key') in components, { key: 'some.key' } / warn('some.key') in the generator
      for (const m of text.matchAll(/\bt\('([a-z][\w.]*)'/gi)) used.add(m[1])
      for (const m of text.matchAll(/(?:key: |warn\()'((?:warn|error)\.\w+)'/g)) used.add(m[1])
    }
    // Keys built at run time from the block tables.
    for (const b of PALETTE) used.add(`block.${b.key}.label`).add(`block.${b.key}.desc`)
    for (const g of PALETTE_GROUPS) used.add(`group.${g}`)
    for (const k of Object.keys(CONDITIONS)) used.add(`cond.${k}`)
    for (const k of ACTIONS) used.add(`action.${k}`)
    for (const c of PLOT_COLORS) used.add(c.pine)
    for (const s of PLOT_STYLES) used.add(`style.${s.key}`)
    for (const k of EXAMPLES) used.add(`toolbar.example.${k}`)
    for (const k of ['source', 'value', 'indicator', 'condition', 'logic', 'time', 'action', 'plot']) used.add(`kind.${k}`)
    for (const k of ['none', 'percent', 'atr']) used.add(`stop.${k}`).add(`trail.${k}`)
    for (const k of ['none', 'percent', 'atr', 'rr']) used.add(`target.${k}`).add(`be.${k}`)
    for (const k of ['equity', 'risk']) used.add(`size.${k}`).add(`settings.sizeHint.${k}`).add(`stats.size.${k}`)
    for (const def of Object.values(INDICATORS)) {
      for (const p of def.params) used.add(`param.${p.key}`)
      // A block with one output shows no name for it.
      if (def.outputs.length > 1) for (const o of def.outputs) used.add(`out.${o.key}`)
    }
    for (const tf of HTF_TIMEFRAMES) used.add(`tf.${tf}`)
    for (const d of WEEKDAYS) used.add(`day.${d}`).add(`day.${d}.long`)
    for (const g of MARKET_GROUPS) used.add(`market.group.${g}`)
    for (const v of ['spot', 'futures']) used.add(`chart.source.${v}`)
    for (const v of ['few', 'both', 'faded', 'late', 'neither']) used.add(`rob.verdict.${v}`)
    for (const e of ['csv.empty', 'csv.columns', 'csv.few']) used.add(e)
    for (const l of navLinks('en')) used.add(l.key)

    expect(used.size).toBeGreaterThan(100)
    const missing = [...used].filter((k) => !(k in en))
    expect(missing).toEqual([])
    const unused = Object.keys(en).filter((k) => !used.has(k))
    expect(unused).toEqual([])
  })

  // Both come from a live alert test (TradingView -> SignalForge -> MT5): the
  // lot in the alert is traded only with that account setting, named as the
  // SignalForge dashboard names it, and TradingView's alert window showed no
  // "Order fills only" choice for these scripts, which never call alert().
  it('the MT5 steps say what the live test showed', () => {
    const dicts: Record<string, string>[] = [en, es]
    expect(en['mt5.lotNote']).toContain('From the signal')
    expect(es['mt5.lotNote']).toMatch(/El de la se.al/)
    for (const dict of dicts) expect(dict['mt5.step2']).not.toMatch(/with the option|con la opci/)
  })

  it('fills in the placeholders and falls back to the key', () => {
    expect(translate('en', 'stats.trades', { n: 12 })).toBe('Trades: 12')
    expect(translate('es', 'stats.trades', { n: 12 })).toBe('Operaciones: 12')
    expect(translate('es', 'no.such.key')).toBe('no.such.key')
  })

  it('the repository stays ASCII', () => {
    for (const file of [...sources(SRC), join(SRC, 'locales', 'en.json'), join(SRC, 'locales', 'es.json'), join(SRC, 'index.css')]) {
      const bytes = readFileSync(file)
      const at = bytes.findIndex((b) => b > 127)
      expect(at, `${file} has a non-ASCII byte at ${at}`).toBe(-1)
    }
  })
})
