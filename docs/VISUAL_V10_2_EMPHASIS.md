# VISUAL v10.2 — per-family emphasis (assessment §10, the patchwork tune)

**Scope:** `indicator/wrapper.js` (`ROW_EMPHASIS` multipliers in the
plotter payloads), `sim_synth.js` part 20 asserts. **Engine untouched —
`node indicator/test_core.js` verified `205/205 MATCH`.**

## 1. Which §10 direction, and why

§10 offered three directions for the translucent-slab patchwork at 5M.
Implemented: the second — **the developing profile stays prominent;
history reads legible-not-prominent** — because it matches how the chart
is actually read (dev = working context, history = reference), and it is
consistent with §8, where the quiet historical gauges were explicitly
praised. The other two were set aside: scaling by *visible* session count
needs the viewport, which the platform does not expose (rendered-count
scaling would dim history exactly when more of it loads, punishing deep
history); capping rendered sessions discards information the MP look is
meant to carry.

## 2. The change

One constant table, applied at publish time and multiplied into the
stroke opacity by the plotter:

```
ROW_EMPHASIS = { dev: 1.0, session: 0.5, accum: 0.7, htf: 0.4 }
```

- `rowOpacity` (trader-calibrated 20) remains the single knob — it
  scales every family; the multipliers fix only the RELATIVE emphasis.
- Effective opacities at the default: dev 20, ACCUM 14, sessions 10,
  HTF mirror 8. Widths, Blue→Red ramp, brackets, medians — the whole MP
  reading — are untouched; the patchwork quiets because overlapping
  neighbours now compound from a lower base while the developing
  profile keeps its verified prominence.
- Tuned against the §10 5M frame description; the numbers are starting
  points in one visible constant, adjustable from the next calibration
  report exactly like the band (14) and rows (20) were.

## 3. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — part 20 extended:
  - payloads carry the emphasis multipliers (dev 1.0, sessions 0.5,
    HTF 0.4)
  - the plotter applies rowOpacity x opMul (0.40 x 0.5 = 0.20 asserted
    on session strokes)
  parts 1–19 all still pass
```

## 4. Next live reading

The same 5M viewport as §10: the developing profile should stand out,
historical sessions should read as quiet context (candles through
everything, as before), the ACCUM histogram in between, the HTF mirror
faintest. If the balance is off, report which family, and the constant
table adjusts — one line per family. Still queued, unchanged: the
deliberate human pan for perceived smoothness, the coarse-timeframe
`hpro@/apro@/accB@` capture, and the 30M label-stack acceptance.
