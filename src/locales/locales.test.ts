import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import en from './en.json'
import es from './es.json'
import { translate } from '../i18n'
import { ACTIONS, CONDITIONS, PALETTE, PALETTE_GROUPS, PLOT_COLORS, PLOT_STYLES } from '../blocks/definitions'
import { EXAMPLES } from '../store/examples'

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
    for (const k of ['source', 'value', 'indicator', 'condition', 'logic', 'action', 'plot']) used.add(`kind.${k}`)
    for (const k of ['none', 'percent', 'atr']) used.add(`stop.${k}`)
    for (const k of ['none', 'percent', 'atr', 'rr']) used.add(`target.${k}`)

    expect(used.size).toBeGreaterThan(100)
    const missing = [...used].filter((k) => !(k in en))
    expect(missing).toEqual([])
    const unused = Object.keys(en).filter((k) => !used.has(k))
    expect(unused).toEqual([])
  })

  it('fills in the placeholders and falls back to the key', () => {
    expect(translate('en', 'stats.trades', { n: 12 })).toBe('12 trades')
    expect(translate('es', 'stats.trades', { n: 12 })).toBe('12 operaciones')
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
