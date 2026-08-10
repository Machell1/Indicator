# CLONE SPEC — MarketProfile_55396 look for the session-profile layer

**Mandate from the trader:** "I want our volume profile to be a clone of
that on Tradovate" — *that* being the EarnForex Market Profile
(`MarketProfile_55396.mq5`, source committed at
`docs/reference/MarketProfile_55396.mq5`, 3,127 lines) as configured live
on his FundedNext MT5 chart. This spec extracts the exact rendering
semantics from the source + his live input values. The trader is a visual
person; this look is his home ground — match it.

## His live configuration (the target look)

| Input | Value | Visual meaning |
|---|---|---|
| Session | Daily | one profile per session day |
| SessionsToCount | 20 | history depth (we cap lower for platform perf; see §3) |
| ColorScheme | **Blue_to_Red** | blocks colored by time-of-session: early=blue → late=red |
| MedianColor / Style / Width | White / SOLID / 1 | POC ("median") line ACROSS the profile width, per session |
| ShowMedianRays | **All** | EVERY session's POC extends right as a DASHED white ray |
| RaysUntilIntersection | Stop_No_Rays | rays never stop |
| ValueAreaSides / HighLow | White / SOLID / 1 | the VA BRACKET: horizontal lines at VAH & VAL spanning the profile width + vertical sides connecting them at the profile edges |
| ShowValueAreaRays | None | no VA rays |
| ShowKeyValues | true, White, size 8 | VAH / VAL / POC prices printed AT each profile |
| ProminentMedianColor / Width | Yellow / 4 | when a session's POC is prominent (dominant TPO row), its median line is thick yellow |
| ValueAreaPercentage | 70 | matches our engine |
| RightToLeft | false | profile grows left→right from session start |
| ShowSinglePrint | No | skip single-print marking |
| EnableDevelopingPOC/VAHVAL | false | he does NOT use the developing overlays in MT5 — but our SVP dev layer is a v5 feature he approved; keep it, devProfile toggle already exists |

## 1. Source mechanism (what "clone" means)

MP_55396 builds a **TPO histogram per session**: for each one-tick price
row, one OBJ_RECTANGLE **per contributing bar**, spanning that bar's time
slot — so a row is a strip of blocks growing rightward from the session
start, and each block's color interpolates along Blue→Red by the bar's
distance from the session's beginning (source lines ~1035–1080: base
0x00FF0000, offsets shift the channel per step). Median/VA/text are
OBJ_TREND/OBJ_TEXT per session.

## 2. Tradovate translation (one rect per row — platform budget)

A literal block-per-bar clone is ~40k primitives/session — not viable.
The information the gradient carries is WHEN each price traded. Preserve
it with one rectangle per row:

- **Row color = volume-weighted mean time-of-session of that row**,
  mapped on the same Blue→Red ramp (early=blue → late=red, interpolate
  RGB exactly like the source: blue 0x0000FF → red 0xFF0000 through
  purple). Rows the market built in the morning read blue; rows built
  late read red — the at-a-glance reading is identical.
- Row width ∝ row volume (we bin REAL volume, not TPO count — this is
  a deliberate upgrade, the strategy is a VOLUME methodology; the look
  is cloned, the data is better. Keep the banner honest if any label
  implies TPO).
- Mean-time per row must be computed in the WRAPPER (display-only pass
  over session bars, like _devProfile) — dale_core is locked and its
  binning already carries the row extents; do NOT touch the engine.

## 3. Per-session elements (each finalized session, newest N)

1. Histogram rows as §2, anchored at the session start, max row width
   scaled to ~the session's bar span (his profiles visually fill their
   day; our current wSess=90-bar cap is too small — scale caps up to the
   session span in duMode, keep the live-edge cap from v6.4).
2. **White solid median line** across [session start → session start +
   max row width] at the POC price.
3. **Dashed white median ray** from the profile's right edge to
   infinity-right, for EVERY session (ShowMedianRays=All). This replaces
   nothing: keep naked-POC red rays as OUR layer (they encode
   traded-through state the MT5 tool doesn't have) — but de-duplicate:
   when a naked-POC ray and a median ray coincide, draw only the naked
   (red) one; the median ray takes over once the level is traded
   through. Document this divergence in the doc.
4. **VA bracket in white**: horizontal segments at VAH and VAL spanning
   the profile width + vertical connectors at both ends (four
   LineSegments per session).
5. **Key values text**: "VAH 4407.9", "POC 4400.2", "VAL 4391.3" in
   small white text at the profile's right edge, fanned via the existing
   de-collision helper (fontSize 10–11; his MT5 uses size 8 but
   Tradovate text renders larger-boned — match visually, not
   numerically).
6. **Prominent median**: reuse the source's criterion (its
   CheckProminentMedian: median row length vs neighbors) — implement the
   same test on our volume rows; when prominent, the median line is
   YELLOW width 4 (source default). This is a genuinely useful Dale-ish
   signal (dominant acceptance) and it's in his config.
7. Sessions rendered: 6–8 max (slice already exists) — his 20 would
   flood the item budget; note the cap on the banner only if a user
   expectation gap appears.

## 4. What does NOT change

- The graded-signal layers (ACCUM, marks, SL/TP, banner, evidence tags),
  dev profile (devProfile toggle), HVN/LVN ticks, vaFill plotter, naked
  POCs (see §3.3), all v6.x anchor/guard/telemetry machinery.
- The PREV-session projection layer: keep, but restyle its rows with the
  same Blue_to_Red ramp so the chart reads as ONE system.
- Engine untouched — 205/205 must pass; sims must pass; emitted-geometry
  invariant must cover the new elements (median lines, brackets, text
  anchors all ≤ live bar per v6.4 rules).

## 5. Sim additions expected

- Row-color ramp: assert every session row's color is on the Blue→Red
  line (pure R/B mix, G=0 — same channel math as the source) and
  monotone with mean-time.
- VA bracket geometry: four segments per rendered session, VAH/VAL exact
  from the engine, spans equal to the profile width.
- Median/prominent: prominent test fires on a synthetic dominant row;
  line width/color switch asserted.
- All new items pass the emitted-geometry invariant (no future-grid).
