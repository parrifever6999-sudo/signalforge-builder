import { useRef, useState } from 'react'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { strategySlug } from '../codegen/generator'
import type { GenResult } from '../codegen/generator'
import { useAccess } from '../access/access'
import { LockedCode } from '../access/LockedCode'

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const NUDGE_MS = 900

// Brings the unlock card into view and puts the focus on its button, for a
// Copy or Download pressed while the script is locked.
export function useUnlockNudge() {
  const linkRef = useRef<HTMLAnchorElement>(null)
  const [nudge, setNudge] = useState(false)
  const show = () => {
    const link = linkRef.current
    if (link) {
      link.closest('.unlock-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      link.focus({ preventScroll: true })
    }
    setNudge(true)
    setTimeout(() => setNudge(false), NUDGE_MS)
  }
  return { linkRef, nudge, show }
}

// The Pine Script the blocks turn into, always up to date with the canvas.
// Without a SignalForge plan only its first lines are shown.
export function CodePanel({ gen }: { gen: GenResult }) {
  const t = useT()
  const title = useBuilder((s) => s.title)
  const status = useAccess((s) => s.status)
  const [copied, setCopied] = useState(false)
  const unlock = useUnlockNudge()
  const code = gen.code
  const open = status === 'unlocked'

  const onCopy = async () => {
    if (!open) return unlock.show()
    if (!(await copyText(code))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const onDownload = () => {
    if (!open) return unlock.show()
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${strategySlug(title)}.pine`
    a.click()
    URL.revokeObjectURL(url)
  }

  const busy = !code || status === 'checking'

  return (
    <section className="code-panel">
      <div className="panel-head">
        <h3>{t('code.title')}</h3>
        <div className="head-actions">
          <button type="button" onClick={onDownload} disabled={busy}>{t('code.download')}</button>
          <button type="button" className="primary" onClick={onCopy} disabled={busy}>
            {copied ? t('code.copied') : t('code.copy')}
          </button>
        </div>
      </div>
      {open || !code
        ? <pre className="code-block" tabIndex={0}>{code || t('code.empty')}</pre>
        : <LockedCode code={code} checking={status === 'checking'} linkRef={unlock.linkRef} nudge={unlock.nudge} />}
    </section>
  )
}
