import { useT } from '../i18n'
import { PINETS_URL, REACT_FLOW_URL, SITE_URL, SOURCE_URL } from '../links'

// Source link (the AGPL asks for it), credits and the usual warnings.
export function Footer() {
  const t = useT()
  return (
    <footer className="app-footer">
      <p>
        <a href={SOURCE_URL} target="_blank" rel="noopener">{t('footer.source')}</a>
        {' | '}
        <a href={SITE_URL} target="_blank" rel="noopener">{t('footer.by')}</a>
      </p>
      <p>
        {t('footer.engine')}{' '}
        <a href={PINETS_URL} target="_blank" rel="noopener">PineTS</a>
        {' | '}
        <a href={REACT_FLOW_URL} target="_blank" rel="noopener">React Flow</a>
      </p>
      <p>{t('footer.disclaimer')}</p>
    </footer>
  )
}
