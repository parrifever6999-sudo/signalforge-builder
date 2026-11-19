# SignalForge Strategy Builder

Build a TradingView strategy by wiring blocks together, test it on real candles
in the browser, and take the Pine Script with you. The script already carries
the alert messages that [SignalForge AI](https://www.signalforge-ai.com/) needs
to place the orders on MetaTrader 5.

Free, no account, nothing leaves your browser except the request for candles.

**Open it:** https://parrifever6999-sudo.github.io/signalforge-builder/

## What you can do with it

- Drag blocks onto the canvas: price, numbers, 19 indicators (moving averages,
  Bollinger bands, previous high and low, RSI, stochastic, CCI, momentum, MACD,
  ATR, standard deviation), conditions (crosses, comparisons, AND, OR), orders
  and chart lines.
- Set a stop loss and a take profit (percent, ATR multiples, or a multiple of
  the stop) and the lot size sent to MT5.
- See the result straight away: candles, your lines, entry and exit markers,
  net result, profit factor, win rate, drawdown.
- Copy or download the Pine Script v6 and paste it into TradingView.
- Share a strategy as a link, save it to a file, or just come back later: the
  browser remembers what you were working on.
- English and Spanish.

## How it works

```
blocks on the canvas -> Pine Script v6 -> run in the browser -> chart and figures
```

1. `src/codegen/generator.ts` turns the graph into Pine Script v6. It is strict
   on purpose: what it writes has to compile in TradingView, not only here.
2. `src/engine/pineRunner.ts` runs that script with
   [PineTS](https://github.com/LuxAlgo/PineTS) over the candles and reads back
   the plots and the trades.
3. Candles come from Binance's public market-data endpoint (spot prices, no key
   needed). If it cannot be reached, a built-in sample series stands in and the
   app says so.

## What the backtest assumes

- Orders fill at the open of the next bar.
- Each trade uses 100% of equity, starting from 10,000, with a 0.05% cost per
  side.
- One position at a time: a new entry is ignored while a trade is open.
- Prices are Binance spot. Your broker's prices, spread and swaps will differ.
  Gold is PAX Gold (PAXG), a token that tracks it.
- About a thousand candles per run. A handful of trades proves nothing, and the
  app warns you when there are fewer than 30.

A backtest shows what would have happened, not what will happen.

## Sending it to MetaTrader 5

Every order in the generated script has an alert message like this:

```json
{"action":"buy","symbol":"XAUUSD","lot":"0.1","strategy":"ema_9_21_cross"}
```

In TradingView, create an alert on the strategy, choose "Order fills only", put
`{{strategy.order.alert_message}}` as the message and paste your SignalForge
webhook address. TradingView needs a paid plan for webhooks. The stop and the
target are worked out by the strategy in TradingView, which sends a close
message when either is hit; they are not placed as orders at the broker.

## Run it yourself

Needs Node.js 22 or newer.

```bash
npm install
npm run dev      # http://localhost:6061
npm test         # generator, engine, storage and translations
npm run build    # static site in dist/
```

The build is a plain static site. It works from any path, so it can be hosted
anywhere that serves files.

## Project layout

```
src/
  blocks/      what each block is and the Pine it writes
  codegen/     graph -> Pine Script v6 (+ tests)
  engine/      runs the script with PineTS
  data/        real candles and the offline sample series
  store/       app state, saving, share links, the built-in examples
  components/  toolbar, palette, chart, figures, code and MT5 panels
  nodes/       the block drawn on the canvas
  locales/     en.json and es.json
```

Text shown to the user lives in `src/locales`. A test fails if a key is missing
in one language, unused, or if a source file is not plain ASCII.

## Licence

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). The engine,
PineTS, is AGPL, so this app is too. If you run a modified version for other
people, you have to offer them its source.

The licence covers the code. The SignalForge name and logo are not part of it:
if you publish your own version, give it your own name.

## Credits

- [PineTS](https://github.com/LuxAlgo/PineTS) runs the Pine Script.
- [React Flow](https://reactflow.dev/) draws the canvas.

Not affiliated with TradingView. Pine Script is a trademark of TradingView.
Trading carries risk; nothing here is financial advice.
