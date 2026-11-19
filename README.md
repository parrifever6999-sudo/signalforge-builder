# SignalForge Strategy Builder

Build a TradingView strategy by wiring blocks together, test it on real candles
in the browser, and take the Pine Script with you. The script already carries
the alert messages that [SignalForge AI](https://www.signalforge-ai.com/) needs
to place the orders on MetaTrader 5.

Free, no account, nothing leaves your browser except the request for candles.

**Open it:** https://parrifever6999-sudo.github.io/signalforge-builder/

## What you can do with it

- Drag blocks onto the canvas. There are 67 of them, with a search box:
  - 49 indicators: moving averages (SMA, EMA, WMA, RMA, VWMA, Hull, DEMA, TEMA,
    ALMA, linear regression, VWAP), channels (Bollinger, Keltner, Donchian,
    Supertrend, Parabolic SAR, Ichimoku, previous high and low), momentum (RSI,
    stochastic, stochastic RSI, MACD, CCI, ROC, Williams %R, MFI, CMO, TSI,
    Awesome oscillator, ADX / DMI and more), volatility (ATR, ATR %, true range,
    standard deviation, Bollinger width, z-score) and volume (OBV, accumulation
    / distribution, Chaikin money flow).
  - Blocks with several outputs give you each line on its own handle: the three
    Bollinger bands, MACD with its signal and histogram, +DI and -DI, the
    Ichimoku lines.
  - Higher-timeframe blocks: the close, high, low, EMA or RSI of a larger candle
    (15 minutes to weekly) inside a strategy that runs on a smaller one.
  - Conditions: crosses, comparisons, rising and falling, AND, OR, NOT.
  - Time filters: trading hours and days of the week, in the time zone you pick.
  - Orders (buy, sell, close buy, close sell) and lines drawn on the chart.
- Manage the trade: stop loss and take profit (percent, ATR multiples, or a
  multiple of the stop), trailing stop, break-even, and an exit after a number
  of bars.
- Size the trade in the backtest as a share of the balance or by risk: the
  percent of the balance you lose if the stop is hit.
- Charge what trading costs: commission and slippage per side.
- Pick the market and how far back to look: 1,000 to 10,000 candles of crypto,
  gold, silver, oil, index and share contracts, from 5 minutes to daily.
- Or bring your own candles: import a CSV exported from MetaTrader or
  TradingView and test on your broker's prices.
- See the result straight away: candles, your lines, entry and exit markers,
  the balance curve against buy and hold, net result, profit factor, win rate,
  drawdown, streaks.
- Check whether it holds up:
  - Out of sample: hide the last 30% of the candles, tune the strategy on the
    first 70%, then uncover the rest and see if it still works.
  - Monte Carlo: the same trades drawn at random 1,000 times, to see how much of
    the result is luck.
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
3. Candles come from Binance's public market-data endpoints (no key needed):
   spot for crypto, the futures endpoint for gold, silver, oil, index and share
   contracts. Longer histories are read a thousand candles at a time. If the
   exchange cannot be reached, a built-in sample series stands in and the app
   says so.
4. `src/data/csv.ts` reads a file of your own instead: MetaTrader 4 and 5
   exports, TradingView exports, commas, semicolons or tabs, UTF-8 or UTF-16.
   The file is read in your browser and never uploaded.
5. `src/engine/robustness.ts` works out the balance curve, the two halves of
   the out-of-sample test and the Monte Carlo runs from the list of trades.

## What the backtest assumes

- Orders fill at the open of the next bar.
- The account starts at 10,000. Each trade uses 100% of the balance unless you
  change it, or the size that risks the percent you chose if the stop is hit
  (never more than 20 times the balance).
- Commission and slippage are charged together on every fill, as a percent of
  the trade. The default is 0.05% commission plus 0.02% slippage per side.
- One position at a time: a new entry is ignored while a trade is open.
- Stops, targets, trailing and break-even are checked against the high and low
  of each candle. What happened inside the candle is not known.
- A trade counts in the part of the history where it closed. With the last 30%
  hidden, nothing on screen depends on a hidden candle.
- A handful of trades proves nothing. The app warns you when there are fewer
  than 30 and will not run Monte Carlo on fewer than 10.

A backtest shows what would have happened, not what will happen.

## What it does not do

- Exchange prices are not your broker's prices. Gold on Binance futures moves
  with gold, but the spread, the swaps and the trading hours of your broker are
  different. To test on your broker's candles, import them as a CSV.
- Times in a CSV are read as UTC. MetaTrader exports use the broker's server
  time, so the hours filter will be off by that difference on imported files.
- The higher-timeframe blocks are built by hand from the candles of the chart
  and only use candles that have closed. They do not call `request.security`.
- Sizing by risk changes the backtest only. The lot sent to MetaTrader 5 is the
  fixed lot you set.
- No optimiser: it does not search for the best settings for you. That is on
  purpose. Settings found by search fit the past and tend to fail afterwards.

## Sending it to MetaTrader 5

Every order in the generated script has an alert message like this:

```json
{"action":"buy","symbol":"XAUUSD","lot":"0.1","strategy":"ema_9_21_cross"}
```

In TradingView, create an alert on the strategy, choose "Order fills only", put
`{{strategy.order.alert_message}}` as the message and paste your SignalForge
webhook address. TradingView needs a paid plan for webhooks.

The stop, the target, the trailing stop, the break-even and the time exit are
worked out by the strategy in TradingView, which sends a close message when one
of them is hit. They are not placed as orders at the broker: if TradingView or
the connection is down, nothing closes the trade.

## Run it yourself

Needs Node.js 22 or newer.

```bash
npm install
npm run dev      # http://localhost:6061
npm test         # generator, engine, data, storage and translations
npm run build    # static site in dist/
```

The build is a plain static site. It works from any path, so it can be hosted
anywhere that serves files.

## Project layout

```
src/
  blocks/      what each block is and the Pine it writes
  codegen/     graph -> Pine Script v6 (+ tests)
  engine/      runs the script with PineTS; balance curve, out of sample, Monte Carlo
  data/        candles from the exchange, CSV import, the offline sample series
  store/       app state, saving, share links, the built-in examples
  components/  toolbar, palette, chart, figures, code and MT5 panels
  nodes/       the block drawn on the canvas
  locales/     en.json and es.json
```

Text shown to the user lives in `src/locales`. A test fails if a key is missing
in one language, unused, or if a source file is not plain ASCII.

The tests run every block and every output through the engine, and check the
trade management against the candles: a trailing stop that never moves against
the trade, a break-even that arms when it should, a risk-sized trade that loses
the percent it was told to.

## Licence

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). The engine,
PineTS, is AGPL, so this app is too. If you run a modified version for other
people, you have to offer them its source.

The licence covers the code. The SignalForge name and logo are not part of it:
if you publish your own version, give it your own name.

## Credits

- [PineTS](https://github.com/LuxAlgo/PineTS) runs the Pine Script.
- [React Flow](https://reactflow.dev/) draws the canvas.

Not affiliated with TradingView or Binance. Pine Script is a trademark of
TradingView. Trading carries risk; nothing here is financial advice.
