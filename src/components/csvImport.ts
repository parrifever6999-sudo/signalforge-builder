import { useBuilder } from '../store/builderStore'
import { decodeText } from '../data/csv'
import type { Translate } from '../i18n'

// What the file picker offers, and the size past which a file is refused
// before it is read (a few years of 1-minute candles fit well under it).
export const CSV_ACCEPT = '.csv,.txt,.tsv,text/csv,text/plain'
const MAX_CSV_BYTES = 40 * 1024 * 1024

// Loads the file the user picked as the chart's candles. Used by the toolbar
// button and by the "your broker's candles" guide under the chart.
export async function importCsvInput(e: React.ChangeEvent<HTMLInputElement>, t: Translate): Promise<void> {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (file.size > MAX_CSV_BYTES) {
    window.alert(t('csv.tooBig'))
    return
  }
  const error = useBuilder.getState().importCsv(file.name, decodeText(await file.arrayBuffer()))
  if (error) window.alert(t(error))
}
