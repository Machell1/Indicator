# VISUAL v10 — translucent profile rows (unblocked by the §9 vaFill result)

**Scope:** `indicator/wrapper.js` (plotter row path, day-wide developing
width, params/defaults), `sim_synth.js` part 19, registry counter-case.
**Engine untouched — `node indicator/test_core.js` verified `205/205
MATCH`.**

## 1. What the §9 reading changed

The live test proved the custom-plotter pipeline does **real alpha
compositing** (registry: proven counter-case to the graphics-items
fill-alpha fact). That was the explicit blocker on assessment items 2
and 3; both are addressed here in one change, as queued.

## 2. The change

- **Developing-profile rows move to the plotter path** (`rowsPlot=1`,
  default). Each frame publishes the row set — prices, pitches, volume
  fractions, colors — with the anchor and width in **chart-index space**;
  the plotter draws one bar-wide vertical strip per column per
  contiguous same-color row run (the community zone technique), with
  `rowOpacity` (default 20, first guess — calibrate live like the band)
  and a 12k-stroke budget. Because the plotter uses the platform's own
  per-bar plot coordinates, the du minute-slot question never arises on
  this path.
- **Day-wide developing profile:** with rows translucent, the 150-bar
  opaque cap retires — the developing profile now fills 85% of the
  ELAPSED session (same fraction as finalized sessions), closing the
  cross-timeframe width inconsistency (assessment item 2) and the 2–4h
  session-start occlusion (item 3) together.
- **Evidence honesty preserved:** the developing POC row keeps the
  teal-green dev color on the plotter path too — graded gold stays
  reserved for the graded PRIOR POC.
- **Fallback:** `rowsPlot=0` restores the v9.3 opaque Shapes rows with
  the 150-bar cap exactly (sim-asserted). Finalized session profiles and
  the ACCUM/HTF histograms stay on the Shapes path this PR — they sit
  over old candles, §8 confirmed they read well, and migrating them
  should follow a live confirmation of row-plotting performance and
  look, not precede it. The `devProfile=0` prev-projection also keeps
  the Shapes path (non-default layout, same reasoning).
- **§9 calibration encoded:** `vaFillOpacity` default 18 → **14** (the
  trader's production value); **80** documented here and in the registry
  as the "is it drawing at all?" diagnostic probe (the 18-default frame
  was genuinely ambiguous); the whole-viewport tint on 1M when the
  visible range sits inside the prior VA is **correct behavior** — each
  bar is shaded with its own session's prior VA.

## 3. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 19:
  - default frame: opaque dev Shapes gone; payload published with the
    chart-index anchor and day-wide width (85% of elapsed, live-edge
    bounded); no graded gold in the row colors
  - plotter: strips only inside the profile span, all vertical,
    rowOpacity honoured, colors from the published set, run merging
    keeps <=8 strokes per column
  - rowsPlot=0: plotter draws nothing; the v9.3 Shapes path returns
    exactly (shared sim runs keep guarding it)
  parts 1–18 all still pass
```

## 4. Live procedure

1. Rebuild, paste, F5 (defaults: `rowsPlot=1`, `rowOpacity=20`).
2. The session-start region should show candles THROUGH the developing
   profile, and the profile should now reach ~85% across the elapsed
   session at every timeframe.
3. Calibrate `rowOpacity` like the band was calibrated: too faint →
   raise; if ambiguity, the 80 probe applies here too. Report the
   production number and I'll make it the default.
4. Watch pan/zoom smoothness — the plotter redraws on every repaint;
   the stroke budget should keep it comfortable, but this is the one
   thing only a live chart can confirm. If it drags, `rowsPlot=0` is
   the instant fallback.
5. If the look holds, next PR migrates the finalized-session rows the
   same way (Blue→Red ramp colors are already per-row in the payload
   format).
