import { describe, it, expect } from 'vitest'
import { ACCESS_URL, PASS_KEY, checkAccess, readStored, takeFragmentPass } from './access'
import type { AccessEnv, StoredPass } from './access'

const NOW = Date.parse('2026-11-20T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const FUTURE = new Date(NOW + 3 * DAY).toISOString()
const PAST = new Date(NOW - DAY).toISOString()

interface Setup {
  hash?: string
  stored?: StoredPass
  reply?: unknown
  httpStatus?: number
  offline?: boolean
}

// A browser stand-in: an address, a storage, and a SignalForge that answers
// what the test says (or cannot be reached).
function setup(opts: Setup = {}) {
  const map = new Map<string, string>()
  if (opts.stored) map.set(PASS_KEY, JSON.stringify(opts.stored))
  const calls: { url: string; init: RequestInit }[] = []
  const replaced: string[] = []
  const env: AccessEnv = {
    location: { hash: opts.hash ?? '', pathname: '/', search: '?lang=es' },
    replaceUrl: (url) => { replaced.push(url) },
    storage: {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => { map.set(k, String(v)) },
      removeItem: (k) => { map.delete(k) },
    },
    fetch: async (url, init) => {
      calls.push({ url, init })
      if (opts.offline) throw new TypeError('Failed to fetch')
      const status = opts.httpStatus ?? 200
      return { ok: status >= 200 && status < 300, json: async () => opts.reply }
    },
    now: () => NOW,
  }
  return { env, map, calls, replaced, stored: () => readStored(env.storage) }
}

const sentPass = (init: RequestInit) => (JSON.parse(String(init.body)) as { pass: string }).pass

describe('the pass from the dashboard', () => {
  it('is read from the address, kept in the browser and removed from the address', () => {
    const s = setup({ hash: '#sf_access=abc.DEF-123_x' })
    expect(takeFragmentPass(s.env)).toBe('abc.DEF-123_x')
    expect(s.stored()?.pass).toBe('abc.DEF-123_x')
    // At most the 7 days a pass lasts, until SignalForge says when it ends.
    expect(s.stored()?.exp).toBe(new Date(NOW + 7 * DAY).toISOString())
    // Path and query stay, the fragment goes.
    expect(s.replaced).toEqual(['/?lang=es'])
  })

  it('leaves a shared strategy after the # where it was', () => {
    const s = setup({ hash: '#s=AbC123&sf_access=tok' })
    expect(takeFragmentPass(s.env)).toBe('tok')
    expect(s.replaced).toEqual(['/?lang=es#s=AbC123'])
  })

  it('undoes the escaping of the address', () => {
    const s = setup({ hash: '#sf_access=a%2Bb%3D' })
    expect(takeFragmentPass(s.env)).toBe('a+b=')
  })

  it('does nothing when the address carries no pass', () => {
    const s = setup({ hash: '#s=AbC123' })
    expect(takeFragmentPass(s.env)).toBeNull()
    expect(s.replaced).toEqual([])
    expect(s.map.size).toBe(0)
  })

  it('an empty pass is removed from the address and not kept', () => {
    const s = setup({ hash: '#sf_access=' })
    expect(takeFragmentPass(s.env)).toBeNull()
    expect(s.replaced).toEqual(['/?lang=es'])
    expect(s.map.size).toBe(0)
  })

  it('something kept that is not a pass is ignored', () => {
    const s = setup()
    s.map.set(PASS_KEY, 'not json')
    expect(s.stored()).toBeNull()
    s.map.set(PASS_KEY, JSON.stringify({ pass: 42 }))
    expect(s.stored()).toBeNull()
  })
})

describe('asking SignalForge', () => {
  it('unlocks with a valid pass and keeps the end date it gives', async () => {
    const s = setup({
      stored: { pass: 'p1', exp: FUTURE },
      reply: { ok: true, gate: true, unlocked: true, plan: 'trader', exp: '2026-11-27T12:00:00Z' },
    })
    expect(await checkAccess(s.env)).toEqual({ status: 'unlocked', plan: 'trader' })
    expect(s.stored()).toEqual({ pass: 'p1', exp: '2026-11-27T12:00:00Z' })

    // One request, to the access check only, with the pass in the body.
    expect(s.calls).toHaveLength(1)
    const { url, init } = s.calls[0]
    expect(url).toBe(ACCESS_URL)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(sentPass(init)).toBe('p1')
  })

  it('unlocks when the gate is off, pass or no pass', async () => {
    const s = setup({ reply: { ok: true, gate: false, unlocked: true } })
    expect(await checkAccess(s.env)).toEqual({ status: 'unlocked' })
    expect(sentPass(s.calls[0].init)).toBe('')
  })

  it('locks without a pass', async () => {
    const s = setup({ reply: { ok: true, gate: true, unlocked: false, reason: 'no_pass' } })
    expect(await checkAccess(s.env)).toEqual({ status: 'locked', reason: 'no_pass' })
  })

  it('a plan that is no longer active locks and forgets the pass', async () => {
    const s = setup({
      stored: { pass: 'p1', exp: FUTURE },
      reply: { ok: true, gate: true, unlocked: false, reason: 'plan_required' },
    })
    expect(await checkAccess(s.env)).toEqual({ status: 'locked', reason: 'plan_required' })
    expect(s.map.has(PASS_KEY)).toBe(false)
  })

  it('a pass SignalForge does not accept locks and is forgotten', async () => {
    const s = setup({
      stored: { pass: 'forged', exp: FUTURE },
      reply: { ok: true, gate: true, unlocked: false, reason: 'invalid_pass' },
    })
    expect(await checkAccess(s.env)).toEqual({ status: 'locked', reason: 'invalid_pass' })
    expect(s.map.has(PASS_KEY)).toBe(false)
  })
})

describe('when SignalForge cannot be reached', () => {
  it('a pass that has not run out keeps the script open', async () => {
    const s = setup({ stored: { pass: 'p1', exp: FUTURE }, offline: true })
    expect(await checkAccess(s.env)).toEqual({ status: 'unlocked' })
    expect(s.stored()?.pass).toBe('p1')
  })

  it('a server error counts the same as no answer', async () => {
    const s = setup({ stored: { pass: 'p1', exp: FUTURE }, httpStatus: 503, reply: { error: 'down' } })
    expect(await checkAccess(s.env)).toEqual({ status: 'unlocked' })
  })

  it('an answer that is not one counts the same as no answer', async () => {
    const s = setup({ reply: '<html>bad gateway</html>' })
    expect(await checkAccess(s.env)).toEqual({ status: 'locked', reason: 'offline' })
  })

  it('without a pass the script stays locked', async () => {
    const s = setup({ offline: true })
    expect(await checkAccess(s.env)).toEqual({ status: 'locked', reason: 'offline' })
  })

  it('a pass that has run out locks and is forgotten', async () => {
    const s = setup({ stored: { pass: 'p1', exp: PAST }, offline: true })
    expect(await checkAccess(s.env)).toEqual({ status: 'locked', reason: 'offline' })
    expect(s.map.has(PASS_KEY)).toBe(false)
  })

  it('a fresh pass from the address works for its 7 days', async () => {
    const s = setup({ hash: '#sf_access=fresh', offline: true })
    takeFragmentPass(s.env)
    expect(await checkAccess(s.env)).toEqual({ status: 'unlocked' })
    expect(sentPass(s.calls[0].init)).toBe('fresh')
  })
})
