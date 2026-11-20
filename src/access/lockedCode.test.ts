import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { generatePine } from '../codegen/generator'
import { example } from '../store/examples'
import { CodePanel } from '../components/CodePanel'
import { UNLOCK_URL } from '../links'
import { LockedCode } from './LockedCode'
import { HEAD_LINES, lockedView, maskLine } from './mask'

const ex = example('pro')
const gen = generatePine(ex.nodes, ex.edges, ex.title, ex.settings)
const lines = gen.code.split('\n')

// How React writes text into HTML.
const html = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

// Every line of the script past the header, unless the header has the same line.
const hiddenLines = () => {
  const head = new Set(lines.slice(0, HEAD_LINES).map((l) => l.trim()))
  return lines.slice(HEAD_LINES).map((l) => l.trim()).filter((l) => l.length > 3 && !head.has(l))
}

function expectNoHiddenCode(markup: string) {
  const hidden = hiddenLines()
  expect(hidden.length).toBeGreaterThan(20)
  for (const line of hidden) {
    expect(markup, line).not.toContain(html(line))
    expect(markup, line).not.toContain(line)
  }
  for (const piece of ['strategy.entry(', 'strategy.exit(', 'alert_message', 'ta.ema(']) {
    expect(markup).not.toContain(piece)
  }
}

describe('the placeholder for a locked script', () => {
  it('keeps the shape of each line and none of its characters', () => {
    const line = '    strategy.entry("Long", strategy.long, alert_message=msg) // 42'
    const masked = maskLine(line, 3)
    expect(masked).toHaveLength(line.length)
    expect(masked.startsWith('    ')).toBe(true)
    expect(masked.trim()).toMatch(/^[x# ]+$/)
    // It depends on where a character is, not on which one it is.
    expect(maskLine('abcdef', 7)).toBe(maskLine('uvwxyz', 7))
  })

  it('shows the first lines as they are and noise for the rest', () => {
    const { head, masked } = lockedView(gen.code)
    expect(head).toBe(lines.slice(0, HEAD_LINES).join('\n') + '\n')
    expect(head.startsWith('//@version=6\nstrategy(')).toBe(true)
    expect(masked).toMatch(/^[x#\s]+$/)
  })
})

describe('the locked code panel', () => {
  it('holds the header lines, the unlock card and nothing else of the script', () => {
    const markup = renderToStaticMarkup(createElement(LockedCode, { code: gen.code, checking: false }))
    for (const line of lines.slice(0, HEAD_LINES)) expect(markup).toContain(html(line))
    expectNoHiddenCode(markup)
    expect(markup).toContain('Copy this script with your SignalForge plan')
    expect(markup).toContain('Unlock with my plan')
    expect(markup).toContain(`href="${html(UNLOCK_URL)}"`)
    expect(markup).toContain('href="https://www.signalforge-ai.com/pricing/"')
  })

  it('while the plan is being checked, shows no card and no script', () => {
    const markup = renderToStaticMarkup(createElement(LockedCode, { code: gen.code, checking: true }))
    expectNoHiddenCode(markup)
    expect(markup).not.toContain('Unlock with my plan')
    expect(markup).toContain('Checking your plan...')
  })

  // The panel opens before SignalForge has answered: locked, with Copy and
  // Download off until the answer comes.
  it('starts locked, with Copy and Download off', () => {
    const markup = renderToStaticMarkup(createElement(CodePanel, { gen }))
    expectNoHiddenCode(markup)
    expect(markup.match(/<button[^>]*disabled=""/g)).toHaveLength(2)
  })
})
