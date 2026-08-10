# VISUAL v7 — the MP_55396 look for session profiles

**Scope:** `indicator/wrapper.js` session-profile layer + telemetry,
`sim_synth.js` part 11. **Engine untouched — `node indicator/test_core.js`
verified `205/205 MATCH`.** Implemented from `docs/MP55396_CLONE_SPEC.md`;
all code is original, written against this project's own engine (the
reference `.mq5` is third-party source and was consulted only to confirm
one behavioral parameter the spec cites — the prominent-median threshold).

## 1. What each finalized session now shows (newest 6)

Per the spec's live-configuration table:

| Element | Implementation |
|---|---|
| **Blue→Red time-graded rows** | Row color = the row's volume-weighted mean time-of-session (bar-position fraction), mapped on a pure R/B ramp (blue `#0000FF` open → red `#FF0000` close, G always `00`). Bucketed into 10 ramp stops so rows batch into ≤10 `Shapes` items per session (platform budget; a literal block-per-bar clone would be ~40k primitives). Rows the market built early read blue, late rows read red — the at-a-glance reading of the MT5 tool. |
| **Row data** | REAL volume widths (deliberate upgrade per spec §2 — the strategy is a volume methodology; the look is cloned, the data is better). Row extents/values come from the engine's own `buildProfile` grid, so they converge with the graded math by construction. |
| **Width** | Rows scale to ~85% of the session's bar span (his profiles visually fill their day), still subject to the v6.4 live-edge cap. |
| **Median line** | White solid width 1 across the profile width at the POC. |
| **Prominent median** | When the POC row's bar coverage ≥ 80% of the session's bars (the reference tool's threshold, translated from TPO strip length to bar coverage), the median goes **yellow, width 4** — dominant acceptance, visible at a glance. |
| **Median rays** | Dashed white ray from each profile's right edge to infinity (ShowMedianRays=All). **Dedupe rule (documented divergence):** an untested naked-POC level keeps OUR red ray (it encodes traded-through state the MT5 tool lacks) and the PREV POC keeps its solid white ray; the dashed median ray takes over once a naked level is traded through. |
| **VA bracket** | White solid: horizontal segments at VAH and VAL spanning the profile width + vertical connectors at both edges (one `LineSegments`, 4 lines). |
| **Key values** | `VAH / POC / VAL` prices in small white text at each profile's right edge, fanned through the existing de-collision layout (per-profile anchor). |

The per-session computation (mean time, coverage, VAH/VAL) is a
display-only cached pass over the session's bars — computed once per
finalized session, ever — using the engine's own `buildProfile`,
`floorDiv` grid math and the same ≤30-row display grouping.

## 2. What did not change (spec §4)

Graded-signal layers, evidence tags, dev profile (`devProfile` toggle),
HVN/LVN ticks, vaFill plotter, naked POCs (see dedupe above), banner, all
v6.x anchor/guard/telemetry machinery. The v4-layout PREV projection
(`devProfile=0`) is restyled with the same ramp so the chart reads as one
system, falling back to the teal rows if the session's bars are no longer
retained. The emitted-geometry invariant covers every new element
automatically (all are `Shapes`/`LineSegments` with live-edge-capped
spans; key-value text follows the label-column exemption).

## 3. Also in this PR — the §7 follow-up (accL@undefined)

Answer to the field report's question: **the ACCUM ray was never
suppressed.** v6.4's emit telemetry introspected `.v` on the platform's
`du()` coordinate objects, which are opaque on live — `@undefined` meant
"cannot introspect", not "not emitted". The box/ray/session layers were
present and correctly anchored off-viewport-left (the thin gold line
crossing the chart was `accL`). Fixed: telemetry now records the emitted
x at construction time in plain numbers; `emit accB@-` genuinely means
"not drawn this frame". `VISUAL_V6_4_EMITTED_GEOMETRY.md` §5's decision
table should be read with this correction.

## 4. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 11 (spec section 5):
  - every session-row color is on the Blue->Red line (#RR00BB, R+B=255)
  - ramp monotone with mean time, ground truth by construction: a fake
    session with an early band and a late band must color the late band
    in strictly higher ramp buckets
  - prominent median: 85%-coverage POC row -> yellow width 4; a
    50%-coverage session stays white width 1
  - VA bracket: exactly 4 segments; VAH/VAL match an independent
    engine-math recompute to the float; spans equal the profile width
  - key values present at the profile edge; median ray present, then
    deduped when an untested naked POC owns the level
  - no [future-grid item] flag from any MP element
  parts 1-10 all still pass (part 2/8 updated for the new key scheme and
  per-profile label anchors)
```

## 5. First look live

1. Sessions should now read like the MT5 chart: blue morning shelves,
   red afternoon shelves, white medians and VA brackets, prices at each
   profile, yellow medians on dominant-acceptance days.
2. If the gradient looks inverted (early=red), say so — that flips one
   line (`rampColor(1 - t)`), but the sim's construction-truth test says
   the current orientation matches "early=blue" as specced.
3. `diag=1`'s `emit` fields now print real numbers or `-`; `@undefined`
   can no longer appear.
