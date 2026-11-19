import { useBuilder } from './builderStore'
import { decodeShare, encodeShare, sanitizeState } from './graphIO'
import type { SavedState } from './graphIO'
import { detectLang, isLang } from '../lang'

const STORAGE_KEY = 'sfb.v1'

function readStored(): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return typeof raw === 'object' && raw !== null ? raw : null
  } catch {
    return null
  }
}

// Reads the strategy packed in the link, if any, and removes it from the
// address bar so later edits are not mistaken for the shared version.
function takeSharedState(): SavedState | null {
  const packed = /[#&]s=([A-Za-z0-9_-]+)/.exec(window.location.hash)
  if (!packed) return null
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return decodeShare(packed[1])
}

/**
 * Decides what the canvas opens with: a strategy packed in the link wins, then
 * whatever this browser was last working on, then the first example.
 */
export function boot(): void {
  const store = useBuilder.getState()
  const stored = readStored()

  const query = new URLSearchParams(window.location.search).get('lang')
  store.setLang(isLang(query) ? query : isLang(stored?.lang) ? stored.lang : detectLang())

  let state = takeSharedState()
  if (!state && stored) state = sanitizeState(stored)

  if (state && state.nodes.length > 0) store.applyState(state)
  else store.loadExample('ema')

  void useBuilder.getState().loadCandles()

  // A share link opened in a tab that already has the builder only changes
  // the part after #, which does not reload the page.
  window.addEventListener('hashchange', () => {
    const shared = takeSharedState()
    if (shared && shared.nodes.length > 0) useBuilder.getState().applyState(shared)
  })

  // Keep the work in this browser, so a reload or a return visit finds it.
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = ''
  useBuilder.subscribe((s) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const text = JSON.stringify({ ...s.snapshot(), lang: s.lang })
      if (text === last) return
      last = text
      try {
        localStorage.setItem(STORAGE_KEY, text)
      } catch {
        // Storage full or blocked: the session still works, it just is not kept.
      }
    }, 500)
  })
}

export function shareUrl(): string {
  const packed = encodeShare(useBuilder.getState().snapshot())
  return `${window.location.origin}${window.location.pathname}#s=${packed}`
}
