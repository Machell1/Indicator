# v13 — Fibonacci entry aid (UNTESTED, info-only)

**Honesty framing first:** fib retracements have never been backtested in
this project. They ship exactly like HTF alignment does — as CONFLUENCE
information that never gates a graded machine — and every surface says
so (TV score prints `fib+8(untested)`; the Tradovate labels are dim and
the layer is documented here as an untested aid).

## Design

- **Anchor: the current session's leg** — the move whose retest we
  trade. Direction follows the more recent extreme (low before high =
  up-leg, retracements measured down from the high). Levels: 38.2 / 50 /
  61.8 / 78.6.
- **Tradovate:** four anchor-free level lines (the v11 un-mis-anchorable
  form) + dim labels; `≈POC` suffix when a fib sits within 0.15 ATR of
  the graded PREV POC — that coincidence is the "assist": the trade is a
  POC retest, and a fib on the same price is added confluence. `fibs`
  param, default ON. **No coarse-bin star, deliberately:** the star
  marks profile-BINNED levels; session extremes are exact at every
  timeframe.
- **TradingView (on the PR #21 branch):** the same four levels plotted,
  plus a `fib+8(untested)` component in the confluence score when the
  entry level sits on a fib, and a 61.8 tag. Informs, never gates.

## Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models)
node indicator/sim_synth.js     PASS — new part 23: exact arithmetic vs
  independently scanned extremes; anchor-free form; labels unstarred;
  ≈POC confluence fires when fabricated; toggle removes the family
  (part 2 label count updated for the four default-on fib labels)
Pine side: compile gate is the paste (see docs/TV_PORT_V2_GRADED_PARITY.md §3)
```
