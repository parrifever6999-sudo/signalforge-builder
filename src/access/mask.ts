// What the code panel shows while the script is locked: the first lines as
// they are (version and header), then noise in the shape of the rest. The
// noise depends only on the position of each character, never on the
// character itself, so nothing of the hidden script can be read back from it.

export const HEAD_LINES = 6
// Enough to fill the panel; the rest of the script is not drawn at all.
const MAX_MASKED_LINES = 40
const NOISE = 'x#'

export function maskLine(line: string, row: number): string {
  let out = ''
  for (let col = 0; col < line.length; col++) {
    const c = line[col]
    if (c === ' ' || c === '\t') {
      out += c
      continue
    }
    const h = (Math.imul(row + 1, 73856093) ^ Math.imul(col + 1, 19349663)) >>> 0
    out += NOISE[h % 5 === 0 ? 1 : 0]
  }
  return out
}

export function lockedView(code: string): { head: string; masked: string } {
  const lines = code.split('\n')
  const rest = lines.slice(HEAD_LINES, HEAD_LINES + MAX_MASKED_LINES)
  const head = lines.slice(0, HEAD_LINES).join('\n')
  return {
    head: rest.length > 0 ? `${head}\n` : head,
    masked: rest.map((line, i) => maskLine(line, i)).join('\n'),
  }
}
