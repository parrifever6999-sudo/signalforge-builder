import { useRef } from 'react'
import { useT } from '../i18n'
import { CSV_ACCEPT, importCsvInput } from './csvImport'

// The markets in the menu are Binance prices. This opens over the chart and
// says how to bring the broker's own candles instead: MetaTrader 5 and
// TradingView both export them, and the file is read in the browser.
// Over the chart, not under it: the results row has a fixed height and the
// steps would squash the candles to nothing.
export function BrokerCandles() {
  const t = useT()
  const csvRef = useRef<HTMLInputElement>(null)

  return (
    <details className="broker-guide">
      <summary>{t('broker.title')}</summary>
      <div className="broker-body">
        <p>{t('broker.intro')}</p>
        <div className="broker-steps">
          <div>
            <h4>{t('broker.mt5')}</h4>
            <ol>
              <li>{t('broker.mt5.1')}</li>
              <li>{t('broker.mt5.2')}</li>
              <li>{t('broker.mt5.3')}</li>
            </ol>
          </div>
          <div>
            <h4>{t('broker.tv')}</h4>
            <ol>
              <li>{t('broker.tv.1')}</li>
              <li>{t('broker.tv.2')}</li>
            </ol>
          </div>
        </div>
        <p className="fine">{t('broker.notes')}</p>
        <button type="button" className="primary" onClick={() => csvRef.current?.click()}>{t('toolbar.csv')}</button>
        <input ref={csvRef} type="file" accept={CSV_ACCEPT} hidden onChange={(e) => void importCsvInput(e, t)} />
      </div>
    </details>
  )
}
