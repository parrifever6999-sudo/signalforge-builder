import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { PINETS_URL, REACT_FLOW_URL, SOCIALS, SOURCE_URL, siteUrl } from '../links'

// Source link (the AGPL asks for it), the profiles of the site, credits and
// the usual warnings.
export function Footer() {
  const t = useT()
  const lang = useBuilder((s) => s.lang)
  return (
    <footer className="app-footer">
      <div className="foot-socials">
        {SOCIALS.map((s) => (
          <a key={s.label} href={s.href} target="_blank" rel="noopener" aria-label={s.label} title={s.label}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={s.path} /></svg>
          </a>
        ))}
      </div>
      <p>
        <a href={SOURCE_URL} target="_blank" rel="noopener">{t('footer.source')}</a>
        {' | '}
        <a href={siteUrl(lang)} target="_blank" rel="noopener">{t('footer.by')}</a>
      </p>
      <p>
        {t('footer.engine')}{' '}
        <a href={PINETS_URL} target="_blank" rel="noopener">PineTS</a>
        {' | '}
        <a href={REACT_FLOW_URL} target="_blank" rel="noopener">React Flow</a>
      </p>
      <p>{t('footer.disclaimer')}</p>
      <p>{t('footer.trademark')}</p>
    </footer>
  )
}
