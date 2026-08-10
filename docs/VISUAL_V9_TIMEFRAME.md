# VISUAL v9 — timeframe anchoring (TIMEFRAME_ANCHORING_SPEC.md)

**Scope:** `indicator/wrapper.js` (timeframe-change detection + disclosure
marks + diag), `sim_synth.js` part 15, platform-facts registry.
**Engine untouched — `node indicator/test_core.js` verified `205/205
MATCH`.** The trader toggles 1M/5M/15M/30M constantly: everything below
treats that as the primary workflow.

## 1. The bug (§1) — cause confirmed, fix shipped

§1's strongest hypothesis is right, and it is a **known platform
behavior**: a community thread documents graphics-module indicators
keeping stale values across a timeframe change until re-saved/re-added
(now in the registry). A surviving instance keeps a mirror whose
(index, timestamp) pairs are at the OLD bar spacing; `_slotOf`
interpolates through them and every `[t-du]` emission displaces by the
timeframe ratio — exactly "the histogram gets thrown out of position".

**Fix — runtime detection + full self-reset**, two independent detectors
on every `map` call, either one triggers:

1. `chartDescription.elementSize` re-read each call (not just at init) —
   catches the switch even when the platform never re-inits us;
2. a new bar arriving FINER than the known period (data-side signal, in
   case `elementSize` lags or is absent). Coarser deltas are
   indistinguishable from session gaps and are covered by detector 1.

The reset rebuilds everything — core, mirror, caches, `barMin`, scaled
caps (§1.3) — and the banner shows **`[timeframe changed - reloading]`**
until the mirror refills, so the rebuild is never mistaken for a bug.
The `[t-du]` freshness test already scales with `barMin` (§1.4) and now
always uses the post-reset value. `diag=1` prints
**`tf=<underlyingType>/<elementSize> barMin=<n>`** first (§1.2), so one
screenshot per timeframe settles the semantics — including whether a
1-hour chart is `MinuteBar/60` or a different type (which would fall to
the existing "use a time-based chart" guard).

## 2. The MP_55396 pattern (§2), adopted

Supported range **1M–30M** (the trader's own conclusion, matching the
reference tool's Daily-session guidance). Outside it the banner shows
**`UNSUPPORTED TIMEFRAME - use 1M-30M (1M = graded basis)`** — never a
silent wrong drawing. Within the range everything renders normally.

## 3. Do the graded levels move? (§3) — answered with numbers

**(A) is unavailable — recorded as a platform fact:** Tradovate exposes
no multi-timeframe series input; community "MTF" indicators aggregate the
chart's own finer bars upward, which cannot produce a 1-minute basis on a
coarser chart; `d.profile()` (tick VAP) remains rejected for graded
levels (different binning than the harness).

**(B) constrain + disclose, shipped:** when `barMin > 1`, every
profile-derived LEVEL label carries a `*` — PREV POC/VAH/VAL, dPOC/dVAH/
dVAL, HTF, NPOC, ACCUM, LEG, session key values, TP/SL, and signal texts
— and the banner CAUTION line explains it:
`CAUTION: 30-min bars - grades measured on 1-min; * marks 30-min-bin
levels`. A coarse-bin level can never be mistaken for the graded one.

**The measured drift (§4's "turn the worry into a number"):** on the
synthetic dataset, the prior-session levels move vs the 1M basis by at
most **~0.33 points (≈3 ticks)** at 30M (5M: ≤0.08; 15M: ≤0.33). The sim
prints these numbers on every run, so any regression in drift is visible.
Real-GC drift can be read the same way live: compare a `*`-marked POC on
30M against the 1M reading during the §4 toggle test.

## 4. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 15:
  15a  the same session data run on 1/5/15/30M charts: session-start and
       prior-session anchors resolve to the SAME TIMESTAMP on all four
       (slot arithmetic scales with barMin); POC/VAH/VAL drift vs 1M
       measured and printed; 1M labels unmarked, 30M labels carry *,
       CAUTION line explains the mark
  15b  live switch on a surviving instance (1M -> 5M, platform re-feeds
       at new spacing): self-reset fires, barMin=5, mirror rebuilt at
       5-minute spacing, [timeframe changed - reloading] shows while
       refilling and clears after, session anchor lands on ground truth
  parts 1–14 all still pass
```

## 5. Live procedure (§4's toggle test)

1. Rebuild, paste, F5, `diag=1`.
2. Toggle 1M → 5M → 15M → 30M → back. At each step: profile/medians/
   brackets/rays must sit on their own candles; expect a brief
   `[timeframe changed - reloading]` right after each switch; `tf=` and
   `barMin=` in the diag line must match the chart.
3. On any non-1M step, level labels show `*` — compare a starred POC to
   its 1M value to see the real-data drift (sim predicts a few ticks).
4. If any step still displaces: screenshot with `diag=1` — `tf=`,
   `barMin=`, `mirror=` and the sp@ list will show which detector missed.
