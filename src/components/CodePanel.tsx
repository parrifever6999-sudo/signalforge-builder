import { useState } from 'react'
import { useBuilder } from '../store/builderStore'
import { useT } from '../i18n'
import { strategySlug } from '../codegen/generator'
import type { GenResult } from '../codegen/generator'

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// The Pine Script the blocks turn into, always up to date with the canvas.
export function CodePanel({ gen }: { gen: GenResult }) {
  const t = useT()
  const title = useBuilder((s) => s.title)
  const [copied, setCopied] = useState(false)
  const code = gen.code

  const onCopy = async () => {
    if (!(await copyText(code))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const onDownload = () => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${strategySlug(title)}.pine`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="code-panel">
      <div className="panel-head">
        <h3>{t('code.title')}</h3>
        <div className="head-actions">
          <button type="button" onClick={onDownload} disabled={!code}>{t('code.download')}</button>
          <button type="button" className="primary" onClick={onCopy} disabled={!code}>
            {copied ? t('code.copied') : t('code.copy')}
          </button>
        </div>
      </div>
      <pre className="code-block" tabIndex={0}>{code || t('code.empty')}</pre>
    </section>
  )
}
