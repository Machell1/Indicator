# VISUAL v10.1 — full row migration (green-lit by the v10 live verification)

**Scope:** `indicator/wrapper.js` (session/ACCUM/HTF row publishers,
priority-ordered plotter payload), `sim_synth.js` parts 19 (updated) + 20.
**Engine untouched — `node indicator/test_core.js` verified `205/205
MATCH`.**

## 1. What migrated

With `rowsPlot=1` (default), every profile ROW FILL now rides the
translucent plotter path verified live in v10:

| Family | Colors on the plotter path | Notes |
|---|---|---|
| Developing profile | teal / brighter VA / teal-green POC | v10, unchanged (day-wide, 85% of elapsed) |
| Finalized sessions | **Blue→Red ramp per row** (same 10-stop buckets) | the MP look, now translucent over its own candles |
| ACCUM histogram | dark gold / white POC row | window box stays a graphics outline (time-true endpoints) |
| HTF composite | dark gold-brown / HTF POC row | still a LEFT mirror (`dir: -1` in the payload) |

Structural non-fills stay as graphics items: session medians, VA
brackets, median rays, key values, the ACCUM box, all level rays, ticks,
labels, banner — unchanged.

The payload list is priority-ordered (dev → sessions → ACCUM → HTF
mirror) under one 12k-stroke budget, so if a pathological frame ever
exhausts it, the least-important layer degrades first. Realistic loads
sit far below the budget (1M: ~2 loadable sessions ≈ 7–8k strokes; 30M:
well under 1k).

`rowsPlot=0` restores every Shapes family exactly (dev + sessions +
ACCUM + HTF, with the v9.x caps and gauge widths) — sim-asserted, and
the shared sim runs continue to guard that legacy path.

## 2. Also encoded from the live verification

- `rowOpacity` 20 confirmed as the production default (already shipped
  as the default in v10 — no change needed).
- The withdrawn "profile at 11 AM" observation is noted for the record
  as a partially-repainted frame, not drift — no action.

## 3. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 20:
  - with rowsPlot on: NO Shapes row fills remain for any family;
    medians/brackets/ACCUM box still present as graphics
  - >=4 payloads, priority-sorted, dev first / HTF mirror last
  - session payload rows all on the Blue->Red line (R+B=255)
  - HTF payload is a left mirror; its strokes land in
    [anchor-w, anchor]; total strokes within the 12k budget
  - rowsPlot=0 restores dpro/sp*C/apro/hpro Shapes exactly
  part 19 updated for the payload list; parts 1-18 pass with the
  Shapes-path invariants pinned to rowsPlot=0 so both paths stay guarded
```

## 4. Live checks

1. Session profiles should now show their candles through the Blue→Red
   rows — the last opaque fills on the chart are gone.
2. The HTF mirror and ACCUM histogram render as before but translucent;
   `rowOpacity` governs all families (one knob).
3. Pan/zoom: v10 confirmed the redraw cost at 1M with ~1 profile; this
   adds the remaining families — worth one explicit smoothness check on
   the deepest-history timeframe you use (5M), where stroke counts are
   highest. `rowsPlot=0` remains the instant fallback.
