import { create } from 'zustand'

// Building and backtesting are open to everyone. Copying or downloading the
// Pine Script, and copying the alert message, come with a SignalForge plan.
// The dashboard checks the plan and sends the browser back here with a pass
// after the # of the address; this module keeps that pass in the browser and
// asks SignalForge whether it still opens the script.

export const ACCESS_URL = 'https://api.signalforge-ai.com/api/builder/access'
export const PASS_KEY = 'sf_builder_pass'
const FRAGMENT_KEY = 'sf_access'

// A pass lasts 7 days. Until SignalForge says when it ends, that is the most
// it can be trusted for when SignalForge cannot be reached.
const PASS_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_PASS_LENGTH = 2048
const CHECK_TIMEOUT_MS = 10000

export type AccessStatus = 'checking' | 'unlocked' | 'locked'
// 'offline' = SignalForge could not be reached and there is no pass to fall back on.
export type LockReason = 'no_pass' | 'invalid_pass' | 'plan_required' | 'offline'

export interface AccessState {
  status: AccessStatus
  reason?: LockReason
  plan?: string
}

export interface StoredPass {
  pass: string
  exp?: string // ISO date
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

interface ResponseLike {
  ok: boolean
  json: () => Promise<unknown>
}

// What the module needs from the browser, passed in so the tests can stand in for it.
export interface AccessEnv {
  location: { hash: string; pathname: string; search: string }
  replaceUrl: (url: string) => void
  storage: StorageLike | null
  fetch: (url: string, init: RequestInit) => Promise<ResponseLike>
  now: () => number
}

export const useAccess = create<AccessState>(() => ({ status: 'checking' }))

export function readStored(storage: StorageLike | null): StoredPass | null {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(PASS_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return null
    const { pass, exp } = raw as Record<string, unknown>
    if (typeof pass !== 'string' || !isPass(pass)) return null
    return typeof exp === 'string' ? { pass, exp } : { pass }
  } catch {
    return null
  }
}

function writeStored(storage: StorageLike | null, value: StoredPass): void {
  try {
    storage?.setItem(PASS_KEY, JSON.stringify(value))
  } catch {
    // Storage blocked: the pass works for this visit only.
  }
}

function clearStored(storage: StorageLike | null): void {
  try {
    storage?.removeItem(PASS_KEY)
  } catch {
    // Nothing kept, nothing to remove.
  }
}

const isPass = (s: string) => s.length > 0 && s.length <= MAX_PASS_LENGTH && /^[\x21-\x7e]+$/.test(s)

// An end date that is not a date is treated as unknown, not as past.
function expired(stored: StoredPass, now: number): boolean {
  const end = stored.exp ? Date.parse(stored.exp) : NaN
  return Number.isFinite(end) && end <= now
}

/**
 * Takes the pass the dashboard put after the # (#sf_access=...), keeps it in
 * this browser and removes it from the address bar, so it is not left in the
 * history, a bookmark or a shared link. Anything else after the # (a shared
 * strategy) stays where it was. Returns the pass, or null if there was none.
 */
export function takeFragmentPass(env: AccessEnv): string | null {
  const parts = env.location.hash.replace(/^#/, '').split('&').filter(Boolean)
  let found: string | null = null
  const rest = parts.filter((part) => {
    if (!part.startsWith(`${FRAGMENT_KEY}=`)) return true
    found = decode(part.slice(FRAGMENT_KEY.length + 1)).trim()
    return false
  })
  if (found === null) return null

  const { pathname, search } = env.location
  env.replaceUrl(pathname + search + (rest.length > 0 ? `#${rest.join('&')}` : ''))

  const pass: string = found
  if (!isPass(pass)) return null
  writeStored(env.storage, { pass, exp: new Date(env.now() + PASS_DAYS * DAY_MS).toISOString() })
  return pass
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

interface AccessReply {
  unlocked: boolean
  reason?: string
  plan?: string
  exp?: string
}

function readReply(body: unknown): AccessReply | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (b.ok !== true || typeof b.unlocked !== 'boolean') return null
  return {
    unlocked: b.unlocked,
    reason: typeof b.reason === 'string' ? b.reason : undefined,
    plan: typeof b.plan === 'string' ? b.plan : undefined,
    exp: typeof b.exp === 'string' ? b.exp : undefined,
  }
}

const LOCK_REASONS: LockReason[] = ['no_pass', 'invalid_pass', 'plan_required']

/**
 * Asks SignalForge whether the pass kept in this browser (or none) opens the
 * script. The pass goes to SignalForge's access check and nowhere else.
 */
export async function checkAccess(env: AccessEnv): Promise<AccessState> {
  const stored = readStored(env.storage)
  let reply: AccessReply | null = null
  const abort = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = setTimeout(() => abort?.abort(), CHECK_TIMEOUT_MS)
  try {
    const res = await env.fetch(ACCESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: stored?.pass ?? '' }),
      credentials: 'omit',
      cache: 'no-store',
      signal: abort?.signal,
    })
    if (res.ok) reply = readReply(await res.json())
  } catch {
    reply = null
  } finally {
    clearTimeout(timer)
  }

  // SignalForge could not be reached or gave an answer that is not one: a
  // pass that has not run out keeps working, so a hiccup does not lock a
  // paying user out.
  if (!reply) {
    if (stored && !expired(stored, env.now())) return { status: 'unlocked' }
    if (stored) clearStored(env.storage)
    return { status: 'locked', reason: 'offline' }
  }

  if (reply.unlocked) {
    if (stored && reply.exp && Number.isFinite(Date.parse(reply.exp))) {
      writeStored(env.storage, { pass: stored.pass, exp: reply.exp })
    }
    return reply.plan ? { status: 'unlocked', plan: reply.plan } : { status: 'unlocked' }
  }

  if (reply.reason === 'invalid_pass' || reply.reason === 'plan_required') clearStored(env.storage)
  const reason = LOCK_REASONS.find((r) => r === reply?.reason) ?? 'no_pass'
  return { status: 'locked', reason }
}

function browserEnv(): AccessEnv {
  let storage: StorageLike | null = null
  try {
    storage = window.localStorage
  } catch {
    storage = null
  }
  return {
    location: window.location,
    replaceUrl: (url) => window.history.replaceState(window.history.state, '', url),
    storage,
    fetch: (url, init) => window.fetch(url, init),
    now: () => Date.now(),
  }
}

/**
 * Runs once, before the canvas reads the address: takes the pass out of it and
 * asks SignalForge. A pass arriving later in an open tab is checked too.
 */
export function startAccess(): void {
  const env = browserEnv()
  const check = async () => useAccess.setState(await checkAccess(env), true)
  takeFragmentPass(env)
  void check()
  window.addEventListener('hashchange', () => {
    if (takeFragmentPass(env)) void check()
  })
}
