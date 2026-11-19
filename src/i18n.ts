import { useCallback } from 'react'
import en from './locales/en.json'
import es from './locales/es.json'
import type { Lang } from './lang'
import { useBuilder } from './store/builderStore'

const DICTS: Record<Lang, Record<string, string>> = { en, es }

export type Params = Record<string, string | number>
export type Translate = (key: string, params?: Params) => string

export function translate(lang: Lang, key: string, params?: Params): string {
  let text = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value))
  }
  return text
}

export function useT(): Translate {
  const lang = useBuilder((s) => s.lang)
  return useCallback((key: string, params?: Params) => translate(lang, key, params), [lang])
}
