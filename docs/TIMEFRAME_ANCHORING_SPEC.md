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

---

# §5 — v9 LIVE TOGGLE TEST RESULT (2026-08-10 22:50-22:57 CDT)

Ran the full live procedure on the live chart. **Two wins, one hard
failure that must be fixed before this ships.**

## WORKS (verified live)

- `*` disclosure: on 5M every profile-derived label carried it —
  `VAH 4432.4*`, `PREV POC 4407.9*`, `dVAH 4398.7*`, `dVAL 4377.0*`,
  `VAL 4352.5*`, `ACCUM 4375.7*`, `HTF VAH 4304.6*` — with the CAUTION
  line explaining the mark. Evidence honesty shipped correctly.
- Session anchoring at 5M was EXACT: `sp@1274w235,1550w235,1826w235,
  2102w235,2378w235,2654w235`. Anchor spacing 276 slots x 5 min = 1380
  min = 23h = one session, and w235 x 5 = ~19.6h ~= 85% of a session.
  Slot arithmetic scales with barMin as designed.
- The reset fired on the 1M->5M switch (HTF composite populated from the
  deeper 5M history, levels re-derived).
- Recovery: F5 restores a correct chart (`tf=MinuteBar/1 barMin=1
  anchor=ok@2644 i=3001 ... emit accB@121 accL@121 sp@0w1074,1264w1173`),
  profile on its own candles.

## HARD FAILURE — infinite reset loop on the 5M -> 1M switch

Switching BACK to 1M leaves the indicator permanently dead. Diag, stable
for 60+ seconds on a chart titled `MGCZ6 1m`:

```
tf=MinuteBar/5  barMin=5  anchor=ok@0  i=3  base=0  mirror=3
gap=0 desync=0  emit accB@- accL@- sp@-   [timeframe changed - reloading]
CAUTION: 5-min bars - grades measured on 1-min; * marks 5-min-bin levels
```

**Root cause (mechanism, not hypothesis):** `chartDescription` is STALE —
it still reports `MinuteBar/5` after the chart switched to 1-minute
(exactly the platform quirk section 1.2 warned about). So on re-init
`barMin` is re-read as 5 on a 1-minute chart. Now the data-side detector
`finer = dMs - lastPushedMs < this.barMin * 60e3` compares 1-minute bar
spacing (60,000 ms) against a stale 5-minute period (300,000 ms) — TRUE
on **every incoming bar** — so `init()` runs on every bar, the mirror is
wiped before it can grow (`i=3 mirror=3`, never advancing), every layer
is suppressed, and the reloading banner never clears. **The detector that
was meant to catch the switch instead traps the indicator in a loop, and
only F5 recovers it.**

Severity: high. The trader toggles constantly; going *down* in timeframe
(the common direction, e.g. 30M -> 1M to enter) is exactly the failing
one, and the chart stays dead with no signals until a manual refresh.

**Fix direction:** the new period must be DERIVED FROM THE DATA, never
re-read from the stale `chartDescription` during a reset. On detecting
`finer`, set `barMin` from the OBSERVED spacing (e.g. the median of the
last N inter-bar deltas, or simply `dMs - lastPushedMs` rounded to
minutes) and only then re-init. Also make the reset idempotent: refuse to
re-init more than once per K bars, and clear `[timeframe changed -
reloading]` only once the mirror exceeds a minimum length — a permanent
reloading banner should itself be a detectable error state (e.g. escalate
to `[reset loop - press F5]` after N consecutive resets, so the trader is
told the remedy instead of staring at a dead chart).

## Also worth addressing (cosmetic, lower priority)

At 5M with a ~12-day viewport, the six session profiles (each ~85% of a
session wide) tile into a near-continuous olive/slate wall across the
left of the chart, obscuring price. MP_55396 avoids this in practice
because a trader views 1-3 sessions at that resolution. Consider scaling
profile width down as the count of VISIBLE sessions rises, or capping
total profile coverage to a fraction of the viewport.

## Not yet tested

15M and 30M were not reached — the 1M return path failed first and the
chart was restored for trading. Re-run the full four-way toggle after the
loop fix.

---

# §6 — v9.1 LIVE RE-RUN (2026-08-10 23:15-23:22 CDT): RESET LOOP FIXED

Deployed v9.1 and re-ran the failing path first.

**1M -> 5M -> 1M round trip: PASS.** The exact sequence that left the
indicator permanently dead under v9 (stuck `tf=MinuteBar/5 barMin=5
i=3 mirror=3`, all layers suppressed, reloading banner never clearing,
F5-only recovery) now recovers on its own within a bar. Post-round-trip
frame on 1M: prev/dev profile drawn ON its own candles at the session
start, `PREV POC 4407.9` with NO star (correct -- barMin back to 1, so
the graded basis is restored and the disclosure correctly disappears),
`dVAH 4398.3 / dPOC 4384.8 / dVAL 4377.5` tracking live price, no
`[timeframe changed - reloading]` residue, no `[reset loop - press F5]`
escalation. The observed-spacing derivation + stale-description distrust
does what it claims on the real platform.

Note the star behaviour is itself a clean end-to-end proof: `*` appeared
on every profile-derived label at 5M and vanished at 1M, which means
`barMin` was genuinely re-derived (not merely reset) in both directions.

## Still queued (unchanged priority)

1. 15M / 30M first contact -- not yet reached in a live session.
2. The profile-width wall at 5M+ with many sessions visible (cosmetic).
3. `staleCd=` observation over more switches, to answer whether the
   description staleness is one-shot or persistent (the one residual gap
   Cursor flagged: returning to exactly the stale timeframe is
   unprovable from spacing alone).

---

# §7 — 30M FIRST CONTACT (2026-08-10 23:27 CDT, trader-initiated)

The trader switched to 30M himself. **The MP clone works at 30M** — this
is the closest the project has come to the reference look. One layer is
badly broken, and label de-collision needs work at this density.

## WORKING at 30M (verified visually, no reset issues)

- Multiple session profiles, each Blue->Red graded, each sitting ON its
  own session's candles across ~4 weeks of history.
- White VA brackets + key values per profile, correct and readable:
  `VAH 4131.6* / POC 4106.6* / VAL 4075.3*`,
  `VAH 4139.9* / POC 4117.3* / VAL 4093.6*`,
  `VAH 4325.7* / POC 4301.2* / VAL 4219.8*`,
  `VAH 4425.1* / POC 4402.5* / VAL 4348.9*`.
- `*` on every profile-derived label + `CAUTION: 30-min bars - grades
  measured on 1-min; * marks 30-m...` -- disclosure correct at 30M.
- Status `armed - outside the 09:00-11:00 NY window`; HTF POC 4109.4,
  `HTF VAH 4303.2*`, `HTF VAL 4055.2*`, `NPOC 4117.3*`; `[t-du]` active.
- No reset loop, no reloading residue, no F5 needed. v9.1 holds at 30M.

## BROKEN 1 — a giant opaque slab swallows the rally (HIGH)

A dark olive/gold block spans roughly **08/05 -> 08/09 (~4 days, ~190
30M bars)** at the **full price height (~4050-4430)**, with row
striations, sitting exactly over the strongest rally on the chart and
hiding that price action completely. Color reads as `htfGhost #4E3D12`
or `accHist #5C4A16`.

Why this shouldn't be constructible: at 30M `wHtf = max(20, round(120/30))
= 20` bars and `wAcc = max(20, round(90/30)) = 20` bars, i.e. ~10 hours,
and the ACCUM row cap is `min(this.wAcc, max(10, ib - ia))` which is also
20. **Nothing in the width math should exceed ~20 bars, yet the rendered
block is ~190 bars wide -- roughly 10x.** Note the ACCUM label on the
same frame reads `3.5d` (its window is 3.5 days) and the slab is ~4 days
wide, which suggests some path is drawing at WINDOW length rather than
the row-width cap once barMin is large.

**Ask:** print `emit hpro@<x>w<width>` and `emit apro@<x>w<width>` (and
the ACCUM box span) in diag exactly like `sp@`, so a single 30M frame
identifies which family is oversized and by how much. Then cap in the
same place the emitted-geometry guard already lives -- a filled rect
wider than N bars OR taller than the visible price range is never
legitimate and should be suppressed + named, the same defense-in-depth
that caught earlier classes.

## BROKEN 2 — label collisions at multi-session density (MEDIUM)

Around 4100-4140 several labels overprint into unreadable clusters, e.g.
`POC 4130.1*` over `VAH 4130.9*`, and `ACCUM 4100.4* (30s)` overlapping
`NPOC 4117.3*`. The de-collision pass handles the right-edge column but
not per-profile key values from ADJACENT sessions whose price ranges
overlap. At 30M with ~6 profiles visible this is the normal case, not an
edge case. Consider: de-collide across ALL text items globally (not per
family), and/or drop per-profile key values when profiles are closer
together than the label pitch, keeping only the right-edge column.

## Process note

Diag numbers were NOT captured for this frame -- a mis-aimed click landed
on the chart canvas and opened Tradovate's order-entry bubble (no order
placed; position stayed 0, equity unchanged; cleared by reload). Chart
canvas clicks are now off-limits during testing; use the Elements panel
route only, and verify the settings dialog is actually open (screenshot)
before clicking any coordinate inside it.

---

# §8 — v9.2 LIVE ON 30M (2026-08-11 00:02 CDT): SLAB FIXED

Deployed v9.2 and re-checked the same 30M viewport.

**BROKEN 1 is fixed.** The ~4-day full-height olive slab is gone; the
08/05-08/09 rally renders as candles again. Every session profile now
draws as a narrow gauge beside its own session -- Blue->Red graded, with
white VA brackets hugging the rows, exactly the MP_55396 reading. The
gauge-width semantics (anchor transformed once, width emitted as a raw
slot count equal to bar count) behave on the real platform, and the
weekend-gap stretch that produced the slab does not recur.

**BROKEN 2 improved as designed.** At 30M the per-profile key-value
stacks are correctly suppressed (sessions < 150 bars), so the
`POC 4130.1*` / `VAH 4130.9*` overprint from section 7 is gone; the
right-edge column carries every level: `PREV POC 4402.5*`, `dVAH 4400.2*`,
`dPOC 4391.9*`, `dVAL 4380.3*`, `VAL 4348.9*`, `HTF VAH 4303.2*`,
`NPOC 4117.3*`, `HTF POC 4109.4* (20s)`, `HTF VAL 4055.2*`, plus the
ACCUM line with its `2.4d` provenance suffix.

**Residual (low, cosmetic):** in the top-right cluster the ACCUM text and
`dVAH/dPOC` still overlap the PREV POC row slightly -- the fan pitch
helps but does not fully separate a dense right-edge stack at 30M. Tune
against this frame when convenient; it is readable, not blocking.

**Not yet exercised:** 15M; the `[oversize item]` guard and the new
`hpro@/apro@/accB@` telemetry have not had to fire on a live frame (by
design -- nothing oversized was produced). Next time diag is on at a
coarse timeframe, capture them once to confirm they print.

State: 30M chart clean and readable, position 0, equity unchanged.
