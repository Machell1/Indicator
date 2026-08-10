# TIMEFRAME SWITCHING — live bug + anchoring spec (2026-08-10)

**Trader report (live, v8 deployed and otherwise verified):** *"when the
time frame is changed the histogram gets thrown out of position again."*
He toggles 1M/5M/15M/30M constantly while trading — this is not an edge
case, it is his normal workflow. **Everything must hold position across
timeframe toggles.**

## 1. THE BUG — hypotheses to check first (v8 `[t-du]` interacts here)

`_slotOf` is correctly timeframe-aware (`mPer = this.barMin * 60e3`), so
the slot math itself is not the suspect. The suspects are upstream:

1. **Stale mirror across an aggregation change (STRONGEST).** `tmsList` /
   `idxList` are built from the *previous* timeframe's bars. If the
   instance survives a timeframe switch (or is re-created while the
   platform re-feeds bars at the new aggregation), the mirror holds
   (index, timestamp) pairs at the old spacing while `i` counts new-size
   bars. `_slotOf` interpolates through those pairs → every emitted x is
   wrong by the ratio of the two timeframes. **Check: does `init()`
   actually re-run on a timeframe change, and is the mirror cleared?
   Add an explicit reset keyed on a detected `barMin` change, and a
   `[timeframe changed - reloading]` banner state for the frames before
   the mirror refills.**
2. **`barMin` stale or mis-read.** `init()` reads `chartDescription
   .elementSize` once (wrapper ~L353-358) guarded by `underlyingType ===
   "MinuteBar"`. Verify `elementSize` semantics per timeframe: is a 1-HOUR
   chart `MinuteBar/60`, or a different `underlyingType` with
   `elementSize = 1`? If the latter, `barMin` silently falls back to 1 and
   the transform is off by 60x. **Print `barMin` and the raw
   `underlyingType`/`elementSize` in the `diag` line** so one screenshot
   settles it per timeframe.
3. **`this.barMin` read at draw time vs init time.** Any consumer that
   captured a scaled cap (`wPrev`, `wSess`, …) at init keeps the old
   timeframe's value if init doesn't re-run.
4. Confirm the `[t-du]`/`[du]` auto decision still resolves correctly at
   coarse timeframes (the "last bar fresh vs wall clock" test must scale
   with `barMin`, or a 30M chart looks stale at minute 20 and silently
   drops to `[du]` mid-session — which would itself displace everything).

## 2. HOW MarketProfile_55396 SOLVES THIS (trader asked specifically)

It does **not** attempt timeframe independence. It *constrains and warns*.
From the source header (`docs/reference/MarketProfile_55396.mq5` L8-L12)
and the runtime checks at L304-L356:

```
"Daily   - should be attached to M5-M30 timeframes. M30 is recommended."
"Weekly  - should be attached to M30-H4 timeframes. H1 is recommended."
"Monthly - should be attached to H1-D1 timeframes. H4 is recommended."
"Intraday- should be attached to M1-M15 timeframes. M5 is recommended."
```

and at runtime (Daily session):
```mql5
if ((PeriodSeconds() < PeriodSeconds(PERIOD_M5)) ||
    (PeriodSeconds() > PeriodSeconds(PERIOD_M30)))
{ Alert("Timeframe should be between M5 and M30 for a Daily session."); }
```
with `DisableAlertsOnWrongTimeframes` to silence it. It also has
`PointMultiplier` (0 = adaptive) to cap object counts as resolution rises.

**The trader independently arrived at the same conclusion** ("best route
would be the 30M... this would ensure the histogram forms on the 30M,
15M, 5M and 1M"). Adopt the pattern: a documented supported range with an
on-chart notice outside it — never a silent wrong drawing.

## 3. THE HARDER QUESTION — do the GRADED LEVELS move with timeframe?

Our profile is built from the chart's own bars. On a 30M chart the engine
bins 30M bars; on 1M it bins 1M bars. **The evidence grades
(+0.40R/80%/n=10 stack, +0.28R/75%/n=12 ACCUM) were measured on 1-MINUTE
bars in the Python harness.** So a POC that reads 4407.9 on 1M may read
differently on 30M — same code, coarser input.

This is the real "everything in its correct place" requirement, and it
outranks the cosmetic fix. Options, in preference order:

- **(A) Fixed 1-minute basis regardless of display timeframe** — ideal
  and evidence-preserving: levels identical on every chart. Requires the
  platform to supply 1-min data to an indicator running on a 30M chart.
  **First task: determine whether Tradovate exposes any secondary-series
  / multi-timeframe input** (community indicators may show a pattern; if
  none exists, record it as a platform fact and move to B).
- **(B) Constrain + disclose (the MP_55396 answer, guaranteed available):**
  support 1M–30M, recommend 1M for graded trading, and when `barMin > 1`
  keep the existing `CAUTION: N-min bars - grades measured on 1-min`
  banner **and** mark the affected level labels (e.g. `PREV POC 4407.9*`)
  so a level derived from coarser bars is never mistaken for the graded
  one. Non-negotiable: on-chart text may never imply a grade the input
  resolution didn't earn.

## 4. VERIFICATION ASKED FOR

- Sim: replay ONE session's 1-min data, aggregate it to 5/15/30M, run all
  four; assert every session anchor, box span, ray, and label resolves to
  the same **TIMESTAMP** (not the same index) in each; report whether
  POC/VAH/VAL are identical across the four (this measures the §3 drift
  and turns it from a worry into a number).
- Sim: simulate a live timeframe switch — feed 1M bars, then re-init/feed
  5M bars with the same clock — and assert no stale-mirror displacement
  and that a reset (if added) fires.
- Live: the trader will toggle 1M→5M→15M→30M and back; the target is that
  the profile, medians, VA brackets and rays stay on their own candles at
  every step, with `diag=1` printing `barMin` and the raw
  `underlyingType`/`elementSize` for each.
