import type { Lang } from './lang'

// The AGPL asks that whoever uses the app over a network can get its source:
// this link is shown in the footer of every build.
export const SOURCE_URL = 'https://github.com/parrifever6999-sudo/signalforge-builder'

export const SITE_URL = 'https://www.signalforge-ai.com/'
export const DASHBOARD_URL = 'https://dashboard.signalforge-ai.com/'
export const PINETS_URL = 'https://github.com/LuxAlgo/PineTS'
export const REACT_FLOW_URL = 'https://reactflow.dev'

// A page of the SignalForge AI site in the language of the app.
export function siteUrl(lang: Lang, path = ''): string {
  return `${SITE_URL}${lang === 'es' ? 'es/' : ''}${path}`
}

export function signupUrl(lang: Lang): string {
  return `${siteUrl(lang, 'signup')}?utm_source=builder&utm_medium=app`
}

export function loginUrl(lang: Lang): string {
  return `${DASHBOARD_URL}login?lang=${lang}`
}

// The dashboard page that checks the plan and sends the browser back here
// with a pass in the part of the address after #.
export const UNLOCK_URL = `${DASHBOARD_URL}builder?open=1`

// The plans of the site, in the language of the app.
export function pricingUrl(lang: Lang): string {
  return siteUrl(lang, lang === 'es' ? 'precios/' : 'pricing/')
}

// The same menu as the header of the site.
export function navLinks(lang: Lang): { key: string; href: string }[] {
  return [
    { key: 'nav.docs', href: siteUrl(lang, 'docs') },
    { key: 'nav.pricing', href: siteUrl(lang, '#pricing') },
    { key: 'nav.blog', href: siteUrl(lang, 'blog/') },
  ]
}

// The profiles in the footer of the site, with their 24x24 icons.
export const SOCIALS: { label: string; href: string; path: string }[] = [
  {
    label: 'X (Twitter)',
    href: 'https://x.com/SignalForge_AI',
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    label: 'Telegram',
    href: 'https://t.me/+GaJzFKIdXM1hN2Vk',
    path: 'M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.642c.498-.303.953-.14.579.192l-8.533 7.701 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z',
  },
  {
    label: 'YouTube',
    href: 'https://youtube.com/@BenjaminSF_AI',
    path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
  {
    label: 'Forex Factory',
    href: 'https://www.forexfactory.com/thread/1386803-signalforge-ai-tradingview-to-mt5-bridge',
    path: 'M2 21H22V8H20V4H18V8H15V11H8V14H2Z',
  },
  {
    label: 'Trustpilot',
    href: 'https://www.trustpilot.com/review/signalforge-ai.com',
    path: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  },
]
