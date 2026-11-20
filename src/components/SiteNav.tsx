import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { loginUrl, navLinks, signupUrl, siteUrl } from '../links'
import brandIcon from '../assets/signalforge-brand-icon-72.png'

// The header of the SignalForge AI site: logo, menu, log in and start free.
// Everything opens in a new tab so the strategy on the canvas stays put.
export function SiteNav() {
  const t = useT()
  const lang = useBuilder((s) => s.lang)

  return (
    <nav className="site-nav" aria-label="SignalForge AI">
      <a className="brand" href={siteUrl(lang)} target="_blank" rel="noopener">
        <img className="brand-icon" src={brandIcon} width={36} height={36} alt="" decoding="async" />
        <span>SignalForge<span className="ai-mark">AI</span></span>
      </a>
      <span className="tag">{t('app.name')}</span>

      <div className="site-links">
        {navLinks(lang).map((l) => (
          <a key={l.key} href={l.href} target="_blank" rel="noopener">{t(l.key)}</a>
        ))}
      </div>

      <div className="site-cta">
        <a className="nav-pill" href={loginUrl(lang)} target="_blank" rel="noopener">{t('nav.login')}</a>
        <a className="nav-pill primary" href={signupUrl(lang)} target="_blank" rel="noopener">{t('nav.start')}</a>
      </div>
    </nav>
  )
}
