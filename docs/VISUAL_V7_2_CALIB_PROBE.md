# VISUAL v7.2 — du-axis calibration probe (field report §9)

**Scope:** `indicator/wrapper.js` (probe layer + `calib` param),
`sim_synth.js` part 13. **Engine untouched — `node indicator/test_core.js`
verified `205/205 MATCH`. No coordinate transforms anywhere in this
version** — §9's discipline is honored: probe first, transform second (the
sim asserts emitted anchors are still raw du).

## 1. What ships

`calib=1` (number param, string-tolerant, default 0) draws, on top of the
normal display:

- **Thin magenta verticals at known du values:** `i`, `i−100`, `i−500`,
  `i−1000`, `i−2000`, `0`, plus two deliberately INSIDE the pre-gridded
  future axis: `i+60` and `i+300` (the distortion §9 measured lives
  there). Negative values clamp to 0.
- **A label riding each line** at that same du x, naming the raw number it
  was given: `du 2910 (i-100)`. Wherever the platform paints the line, the
  label identifies it — no cross-referencing. Labels are vertically
  staggered so they read apart even if the mapping bunches lines together.
- **A price-anchored reference:** a horizontal white dashed ray at the
  live close (`LIVE CLOSE <price>`), using the proven price axis — the
  `du=i` probe is judged directly against the live candle it must stand
  on.
- Banner: `CALIB ACTIVE - each magenta line must stand on its bar`.

The probes are emitted AFTER the emitted-geometry guard on purpose — the
future probes must reach into the future grid to measure it. They are the
sanctioned exception, they exist only under `calib=1`, and the guard
continues to protect every normal layer.

## 2. How to read the screenshot (one frame decides)

Include the time axis in the shot. With `i ≈ 3000`:

| Observation | Meaning | Transform consequence |
|---|---|---|
| Every line stands on its bar (`i` on the live candle, `i−100` 100 candles left, `0` at history start; `i+60/i+300` evenly beyond) | du = bar index, uniform; the weekend frames had another cause | none — re-open the emitter question with this probe as the control |
| Lines left of `i` stand correctly, but `i+60`/`i+300` are stretched/compressed vs 60/300 candle-widths | future grid uses a different scale (e.g. per-minute) than the bar region | clamp/transform only future-directed x (labels at `i+4` etc.) |
| `i−2000` (and/or `0`) lands visibly right of its bar while recent lines are correct — displaced by roughly the weekend-gap minutes | **du is per-MINUTE including gap/future slots, not per-bar** — §9's leading hypothesis; explains every weekend frame at once | emit anchors as timestamp-derived minute offsets from the live bar: `x = i − (lastTms − tMs)/60000·(1/barMin)` … i.e. replace index arithmetic with time arithmetic at emission; the probe's measured slope calibrates it |
| Lines bunch non-linearly (neither per-bar nor per-minute) | mapping is piecewise (session boxes? axis segments) | measure segment boundaries from the labeled lines; transform per segment |
| `LIVE CLOSE` ray crosses the live candle but the `du=i` line does not | even the live-bar index diverges | the mapping offset is global; the same reading still calibrates it |

Whatever the shape, the labeled lines give the empirical du→pixel function
directly; the follow-up PR implements exactly the measured transform and
re-verifies with the same probe (`calib=1` before/after).

## 3. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 13:
  - calib off (default): zero probe items
  - calib='1' (string prop): all 8 lines at exactly the documented du
    values; each label rides its own line and names its raw du number
  - i+60/i+300 survive into the future grid with no [future-grid] flag
    (sanctioned exception); banner shows CALIB ACTIVE
  - live-close reference at the exact close price
  - probe-first discipline: emitted anchors are still raw du (asserted
    against an independent tail-offset recompute)
  parts 1–12 all still pass
```

## 4. Procedure for the trader

1. Rebuild, paste, F5. Set `calib=1` (and `diag=1` if you want the full
   line). Screenshot with the time axis visible, ideally with the same
   viewport as the §9 frame.
2. Set `calib=0` afterwards — the probes vanish; nothing else changes.
3. One screenshot is enough; two (one scrolled left to Friday's region)
   remove all remaining ambiguity about the gap segment.
