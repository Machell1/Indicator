# HANDOFF v12 — right-edge pinned live-session profile (ADDITIVE)

**Status: APPROVED BY THE TRADER.** His words:

> "keep the per-session MP_55396 profiles as they are, and add a
> right-edge pinned profile for the current session. You'd get an
> un-mis-anchorable read of the live session — the one you actually
> execute off — while history keeps the layout you specified. It's
> additive, so it can't regress what already works."

**Branch from CURRENT `main` (045e3cf or later).** Three prior PRs branched
from stale copies and silently reverted applied review fixes; every fetch
is now diff-checked for fix survival before merge.

Read first: `docs/NATIVE_ANCHOR_STUDY.md` (why this shape, and why the
obvious alternative is impossible) and `docs/DAILY_BREAK_MODE_FLIP.md`
(the fault that motivated it).

## WHY THIS SHAPE

Established, not assumed:

- **Tradovate has no native volume profile.** Catalogue-verified live:
  searching "profile" returns exactly one indicator, a community VZO
  variant, in the same JS sandbox we are.
- **`export type ScaleUnit = 'du' | 'px';`** — a closed union of two.
  No timestamp coordinate exists, on any path. The bug class cannot be
  designed away by expressing time directly.
- **`du(n)` on a live chart addresses a minute-slot, not a bar** (our own
  measurement; the docs say the opposite and will never adjudicate it —
  `tools/graphics.js` is not in the public repo and the entire published
  spec of `du()` is one sentence).

So the only structurally safe horizontal position is one that **carries
no time information at all**. A profile pinned to the pane's right edge
qualifies. That is precisely why the community VZO profile has never
exhibited any of the faults we spent this project chasing.

## WHAT TO BUILD

A new, independently toggleable family: **the CURRENT (developing)
session's volume profile, pinned to the right edge of the chart pane**,
rows growing LEFT, sitting in the empty future-grid area.

Reuse the developing-profile rows already computed (`dev.rows` — the SVP
path). **Do not compute a second profile and do not touch `dale_core.js`**
(regression-locked, `node indicator/test_core.js` must stay 205/205).

Include on it: POC row highlight, VAH/VAL markers, and per-row value
text, matching the existing palette and `ROW_EMPHASIS` conventions.

### Use the GRAPHICS-ITEMS path with `cs: "frame"` — NOT the canvas plotter

This is the one non-obvious call, so here is the full reasoning:

- **`cs: "frame"` is viewport space with no relationship to the time
  axis.** We already use it for the status banner (`origin: { cs:
  "frame", h: "left", v: "top" }`). Use `h: "right"` here with px
  x-bounds. Tradovate's own "Creating Advanced Custom Indicators" article
  documents the idiom: *"We want our bars to be locked to the price axis,
  so we use `px(0)` for its `position.x` value"*, with **negative** pixel
  widths because x-zero locks to the chart's right edge.
- **The canvas plotter cannot do this.** Its x comes from
  `plotting.x.get(entity)` / `x.relative()` / `x.between()`, all derived
  from bars that exist. `x.relative(lastBar, +Npx)` tracks the last bar,
  which is *not* the pane's right edge once the user scrolls. Pinning is
  the whole point.
- **`Canvas` has no text primitive** — only `drawLine`, `drawPath`,
  `drawHeatmap`. The plotter path could not carry the value text or the
  VAH/VAL labels at all.
- **The fill-alpha limitation does not apply here.** Graphics-items fills
  ignore alpha (live Bug A, v3) — which is exactly why rows were migrated
  to the plotter in v10. **That reason is absent for this family**: the
  right-edge profile sits in the empty future grid where there are no
  candles to occlude. Opaque is fine, and is what the VZO profile does.

So the constraint that forced the plotter migration for the in-chart rows
does not bind here, and the two constraints that *do* bind (pinning, text)
both point at graphics items. Ship this family opaque on the items path
and leave the in-chart rows on the plotter exactly as they are.

## HARD REQUIREMENTS

1. **Purely additive.** No change to the per-session MP_55396 profiles,
   the level lines, the label column, or the plotter row path. If a diff
   touches those, it is out of scope for v12.
2. **Independent of `[du]`/`[t-du]`.** This family must emit no `du`
   coordinate whatsoever. If a `duTime` change can move it, it is wrong.
   That independence IS the feature — verify it deliberately.
3. **Check the emitted-geometry invariant does not eat it.** The
   future-grid scan drops items whose `du` x exceeds `xCap = i + 2`. A
   frame/px item has no `du` x and should pass untouched — confirm that
   in the sim rather than assuming, and confirm `MAX_ROW_SLOTS` cannot
   false-positive on px widths.
4. **Stable global keys** (the A8 rule), keyed to the session's own start
   tms, not a loop index.
5. **One toggle param, default ON**, plus a px-width param (the VZO
   equivalent is 150). The trader asked for this on the chart.
6. **All four gates before the PR:** `node indicator/build.js`,
   `test_core.js` 205/205, `sim_synth.js`, `sim_tradovate.js`. Do not
   skip `sim_tradovate` — it caught a real regression in the first v11
   draft that the other three passed.
7. Extend `sim_synth.js` with an invariant for this family: **no emitted
   item in it may carry unit `du`.** That is a one-line structural test
   that makes requirement 2 permanent rather than a review promise.

## WHAT THIS DOES NOT DO — say so on the banner

This is **insurance, not a fix**. The daily-break AUTO flip
(`DAILY_BREAK_MODE_FLIP.md`) still mis-places the labels, session vline,
VA zone box and ACCUM box for roughly an hour a day, and at 1M the
`3 x barMin` threshold is only 3 minutes plus one bar period. **Item D.3
of the study — deleting AUTO mode — remains open and is still the real
fix.** The recommended path there is unchanged: run `calib=1` during a
16:00-17:00 CT break to measure which space the axis is in, then choose
the rule from the measurement instead of guessing a constant.

Do not let v12 shipping make that look handled.

## OPEN QUESTIONS FOR YOU TO DECIDE AND STATE

- **Vertical alignment.** The right-edge profile shares the price scale,
  so rows land at their true prices — good. But when the viewport is
  zoomed to a narrow band (the trader's 1M chart tonight showed a ~11
  point window), most of the session profile is off-screen. Decide
  whether it clips, compresses to fit, or shows only the in-view slice,
  and **say which** — do not let it be emergent.
- **Overlap with the community VZO profile.** He runs
  `VZOProfile_Customizable` on the same chart, also right-edge pinned at
  150px. Two pinned profiles will collide. Offer an x-offset param so
  ours can sit inboard of his rather than on top of it.
- **Whether the developing profile should also stay in-chart.** Keeping
  both means the same data drawn twice. The v11 frame already showed
  adjacent duplicate labels (`POC 4393.2*PREV POC 4393.2*`); this could
  compound that. Recommend, don't just implement.

## COSMETIC ITEMS CARRIED FROM v11 (fold in if cheap)

1. Per-session key-values now duplicate the main label column
   adjacently — suppress them for the CURRENT session, or push the
   column right.
2. The ACCUM label clips the right chart edge and loses its tail.
