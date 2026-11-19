export type Lang = 'en' | 'es'
export const LANGS: Lang[] = ['en', 'es']

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'es'

export function detectLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en'
  return nav?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export const localeOf = (lang: Lang) => (lang === 'es' ? 'es-ES' : 'en-US')
