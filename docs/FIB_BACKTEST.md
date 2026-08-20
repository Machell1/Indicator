# Fib confluence backtest (GCQ6, graded delta basis, full dataset)

**Question:** do we take more trades and improve performance with fib?
**Method:** `backtest/fib_study.js` — regression-locked DaleCore replay,
up/down-volume delta (the graded basis), SL/TP simulated bar-by-bar
(same-bar SL+TP counts as a LOSS; open trades mark-to-close at the
roll; one trade at a time). Fib = entry level within 0.15 ATR of a
session-leg retracement (38.2/50/61.8/78.6) — the shipped v13 rule,
NOT optimized (first threshold tried).

## Results

| Variant | n | win% | avgR | totR |
|---|---|---|---|---|
| V0 graded gates — ALL | 4 | 50% | +0.07 | +0.27 |
| V0 fib-confluent | 3 | 67% | +0.43 | +1.27 |
| V1 window OFF — ALL | 27 | 41% | −0.05 | −1.35 |
| **V1 fib-confluent** | **7** | **86%** | **+0.63** | **+4.39** |
| V1 no-fib | 20 | 25% | −0.29 | −5.74 |

Bootstrap 95% CI on V1 fib-confluent avgR: **[−0.05 .. +1.25]**, n=7.
Fib subset by kind: leg 4, accum 2, prior-poc 1.
R values: 0.39, −1.00, 0.90, 0.78, 0.22, 2.09, 1.00.

Note: V0's totals measure the SHIPPED once-per-session machine end-to-end
(4 fires in ~5 months — consistent with the playbook's "gates are tighter
than the grades were measured on"). They do not contradict the published
grades, which came from the offline 57-touch execution study.

## Verdict (the project's own bar)

- **The separation looks real but the CI includes zero at n=7** — the
  ACCUM grade required a CI excluding zero. Fib therefore stays exactly
  what v13 shipped: an UNTESTED info-only aid. No gate changes.
- **4 of the 7 fib winners are LEG-class trades** — the class marked
  inert/untested. If anything, this hints fib may be the missing filter
  that makes LEG tradeable — a hypothesis for the next contract roll's
  data, not a conclusion.
- **Paper-trade candidate, trader's call:** admit off-window signals
  ONLY when fib-confluent (V1∩fib = ~7 trades/5mo vs 4 baseline — more
  trades, better in-sample R). Recommend running it as watch-only
  alongside the graded machine until the roll adds sessions and the CI
  can speak. Re-run: `node backtest/fib_study.js` after each roll.
