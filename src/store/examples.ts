import type { Edge } from '@xyflow/react'
import type { BlockData, BuilderNode, ConditionKind } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import type { SavedState } from './graphIO'

export type ExampleKey = 'ema' | 'rsi' | 'breakout' | 'pro'
export const EXAMPLES: ExampleKey[] = ['ema', 'rsi', 'breakout', 'pro']

const n = (id: string, x: number, y: number, data: BlockData): BuilderNode => ({
  id, type: 'block', position: { x, y }, data,
})

// "out" names the output the wire leaves from, on blocks that have several.
const e = (source: string, target: string, targetHandle: 'a' | 'b' | null = null, out: string | null = null): Edge => ({
  id: `e-${source}${out ? `.${out}` : ''}-${target}-${targetHandle ?? 'in'}`,
  source, target, sourceHandle: out, targetHandle,
})

const close: BlockData = { kind: 'source', source: 'close' }
const cond = (condition: ConditionKind): BlockData => ({
  kind: 'condition', condition, sourceA: 'close', sourceB: 'close',
})

// Fast EMA above slow EMA: buy. Back below: close.
function ema(): SavedState {
  return {
    title: 'EMA 9/21 cross',
    settings: { ...DEFAULT_SETTINGS },
    nodes: [
      n('n1', 0, 150, close),
      n('n2', 280, 0, { kind: 'indicator', indicator: 'ema', length: 9, source: 'close' }),
      n('n3', 280, 250, { kind: 'indicator', indicator: 'ema', length: 21, source: 'close' }),
      n('n4', 580, 0, cond('crossover')),
      n('n5', 580, 210, cond('crossunder')),
      n('n6', 880, 20, { kind: 'action', action: 'entry_long' }),
      n('n7', 880, 230, { kind: 'action', action: 'exit_long' }),
      n('n8', 580, 430, { kind: 'plot', title: 'EMA 9', color: '#2563eb', style: 'line' }),
      n('n9', 880, 430, { kind: 'plot', title: 'EMA 21', color: '#f59e0b', style: 'line' }),
    ],
    edges: [
      e('n1', 'n2'), e('n1', 'n3'),
      e('n2', 'n4', 'a'), e('n3', 'n4', 'b'),
      e('n2', 'n5', 'a'), e('n3', 'n5', 'b'),
      e('n4', 'n6'), e('n5', 'n7'),
      e('n2', 'n8'), e('n3', 'n9'),
    ],
  }
}

// Buy a sharp dip (2-bar RSI under 15) only while price is above its long
// average; close when RSI recovers above 70.
function rsi(): SavedState {
  return {
    title: 'RSI pullback',
    settings: { ...DEFAULT_SETTINGS },
    nodes: [
      n('n1', 0, 0, { kind: 'indicator', indicator: 'rsi', length: 2, source: 'close' }),
      n('n2', 0, 220, { kind: 'value', value: 15 }),
      n('n3', 0, 340, close),
      n('n4', 0, 460, { kind: 'indicator', indicator: 'ema', length: 100, source: 'close' }),
      n('n5', 300, 60, cond('lt')),
      n('n6', 300, 340, cond('gt')),
      n('n7', 600, 190, cond('and')),
      n('n8', 900, 200, { kind: 'action', action: 'entry_long' }),
      n('n9', 300, 620, { kind: 'value', value: 70 }),
      n('n10', 600, 480, cond('gt')),
      n('n11', 900, 490, { kind: 'action', action: 'exit_long' }),
      n('n12', 600, 0, { kind: 'plot', title: 'RSI', color: '#8b5cf6', style: 'line' }),
    ],
    edges: [
      e('n1', 'n5', 'a'), e('n2', 'n5', 'b'),
      e('n3', 'n6', 'a'), e('n4', 'n6', 'b'),
      e('n5', 'n7', 'a'), e('n6', 'n7', 'b'),
      e('n7', 'n8'),
      e('n1', 'n10', 'a'), e('n9', 'n10', 'b'),
      e('n10', 'n11'),
      e('n1', 'n12'),
    ],
  }
}

// Close breaks the high of the last 20 bars: buy. Breaks the low: sell.
// The stop and the target do the closing.
function breakout(): SavedState {
  return {
    title: '20-bar breakout',
    settings: { ...DEFAULT_SETTINGS },
    nodes: [
      n('n1', 0, 0, { kind: 'indicator', indicator: 'highest', length: 20, source: 'high' }),
      n('n2', 0, 240, close),
      n('n3', 0, 360, { kind: 'indicator', indicator: 'lowest', length: 20, source: 'low' }),
      n('n4', 300, 60, cond('crossover')),
      n('n5', 300, 300, cond('crossunder')),
      n('n6', 600, 80, { kind: 'action', action: 'entry_long' }),
      n('n7', 600, 320, { kind: 'action', action: 'entry_short' }),
      n('n8', 300, 540, { kind: 'plot', title: 'High 20', color: '#16a34a', style: 'line' }),
      n('n9', 600, 540, { kind: 'plot', title: 'Low 20', color: '#dc2626', style: 'line' }),
    ],
    edges: [
      e('n2', 'n4', 'a'), e('n1', 'n4', 'b'),
      e('n2', 'n5', 'a'), e('n3', 'n5', 'b'),
      e('n4', 'n6'), e('n5', 'n7'),
      e('n1', 'n8'), e('n3', 'n9'),
    ],
  }
}

// What the newer blocks are for, in one strategy: follow the Supertrend only
// while the 4-hour trend agrees and Monday to Friday, risk 1% of the balance
// per trade, and let a trailing stop do the closing.
function pro(): SavedState {
  return {
    title: 'Supertrend with 4h filter',
    settings: {
      ...DEFAULT_SETTINGS,
      stopKind: 'atr', stopValue: 2,
      targetKind: 'none',
      trailKind: 'atr', trailValue: 3,
      beKind: 'rr', beValue: 1,
      sizeKind: 'risk', sizeValue: 1,
    },
    nodes: [
      n('n1', 0, 0, { kind: 'indicator', indicator: 'supertrend', length: 10, source: 'close', params: { factor: 3 } }),
      n('n2', 0, 250, close),
      n('n3', 0, 370, { kind: 'indicator', indicator: 'htf_ema', length: 50, source: 'close', tf: '240' }),
      n('n4', 0, 560, { kind: 'condition', condition: 'weekdays', sourceA: 'close', sourceB: 'close', days: '23456', tz: 'UTC' }),
      n('n5', 320, 0, cond('crossover')),
      n('n6', 320, 300, cond('gt')),
      n('n7', 620, 150, cond('and')),
      n('n8', 620, 440, cond('and')),
      n('n9', 920, 300, { kind: 'action', action: 'entry_long' }),
      n('n10', 320, 600, cond('crossunder')),
      n('n11', 620, 680, { kind: 'action', action: 'exit_long' }),
      n('n12', 920, 0, { kind: 'plot', title: 'Supertrend', color: '#16a34a', style: 'line' }),
      n('n13', 920, 560, { kind: 'plot', title: 'EMA 50 (4h)', color: '#f59e0b', style: 'line' }),
    ],
    edges: [
      e('n2', 'n5', 'a'), e('n1', 'n5', 'b', 'line'),
      e('n2', 'n6', 'a'), e('n3', 'n6', 'b'),
      e('n5', 'n7', 'a'), e('n6', 'n7', 'b'),
      e('n7', 'n8', 'a'), e('n4', 'n8', 'b'),
      e('n8', 'n9'),
      e('n2', 'n10', 'a'), e('n1', 'n10', 'b', 'line'),
      e('n10', 'n11'),
      e('n1', 'n12', null, 'line'), e('n3', 'n13'),
    ],
  }
}

export function example(key: ExampleKey): SavedState {
  return key === 'rsi' ? rsi() : key === 'breakout' ? breakout() : key === 'pro' ? pro() : ema()
}
