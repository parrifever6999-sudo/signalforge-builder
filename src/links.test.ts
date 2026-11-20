import { describe, it, expect } from 'vitest'
import { SOCIALS, loginUrl, navLinks, signupUrl, siteUrl } from './links'

// The header and the footer carry the same links as the SignalForge AI site.
describe('links to the SignalForge AI site', () => {
  it('the logo goes to the home page in the language of the app', () => {
    expect(siteUrl('en')).toBe('https://www.signalforge-ai.com/')
    expect(siteUrl('es')).toBe('https://www.signalforge-ai.com/es/')
  })

  it('log in and start free go where the site sends them', () => {
    expect(loginUrl('en')).toBe('https://dashboard.signalforge-ai.com/login?lang=en')
    expect(loginUrl('es')).toBe('https://dashboard.signalforge-ai.com/login?lang=es')
    expect(signupUrl('en')).toBe('https://www.signalforge-ai.com/signup?utm_source=builder&utm_medium=app')
    expect(signupUrl('es')).toBe('https://www.signalforge-ai.com/es/signup?utm_source=builder&utm_medium=app')
  })

  it('the menu has the docs, pricing and blog of the site', () => {
    expect(navLinks('en')).toEqual([
      { key: 'nav.docs', href: 'https://www.signalforge-ai.com/docs' },
      { key: 'nav.pricing', href: 'https://www.signalforge-ai.com/#pricing' },
      { key: 'nav.blog', href: 'https://www.signalforge-ai.com/blog/' },
    ])
    expect(navLinks('es').map((l) => l.href)).toEqual([
      'https://www.signalforge-ai.com/es/docs',
      'https://www.signalforge-ai.com/es/#pricing',
      'https://www.signalforge-ai.com/es/blog/',
    ])
  })

  it('the footer has the five profiles of the site footer', () => {
    expect(SOCIALS.map((s) => s.label)).toEqual(['X (Twitter)', 'Telegram', 'YouTube', 'Forex Factory', 'Trustpilot'])
    for (const s of SOCIALS) {
      expect(s.href).toMatch(/^https:\/\//)
      expect(s.path.length).toBeGreaterThan(10)
    }
  })
})
