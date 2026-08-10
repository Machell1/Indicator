# v11 LIVE + a mode-flip bug the daily maintenance break exposes

**2026-08-10, 16:19-16:25 CDT, 5M MGCZ6, v11 (aa5cfd6) deployed.**

## v11 ITSELF: CONFIRMED WORKING

Level lines now run the full chart width, PDL-style, exactly as Cursor
predicted. Same prices, same colours, same dash patterns; the green
(~4453), orange (~4448), gold PREV POC, cyan and dashed red levels all
span edge to edge. The `du(0)`/`infiniteStart` conversion does what the
community study said it would.

## BUT: EVERY LABEL DISAPPEARED — and it is NOT v11

The `lab(...)` call sites are byte-identical across the v11 diff. The
only changes in the 1164/1202/1236 hunks are `ray(...)` -> `lvl(...)`.
Nothing in the label path, `layoutLabels`, `txt`, `lx`, or the
future-grid guard (which exempts Text) was touched.

**The cause is the `[t-du]` -> `[du]` AUTO flip, wrapper.js L923-925:**
```js
const tMode = O.duTime === 1 ||
  (O.duTime === 2 && this.lastPushedMs > 0 &&
    Date.now() - this.lastPushedMs < 3 * this.barMin * 60e3);
```
COMEX gold halts 16:00-17:00 CT every weekday. On a 5M chart the
threshold is 3 x 5 = **15 minutes**, so at 16:15 CT — mid-break — AUTO
decides the chart is not live and falls back to bar-index emission.

Observed to the minute:
- **16:14 CDT** (pre-deploy, v10.2, ~14 min stale): banner `[t-du]`,
  labels all present and correctly placed right of the live edge.
- **16:19 CDT** (v11, ~19 min stale): banner reads **`[du]`**, every
  label gone.

The inference AUTO makes — *"last bar stale => chart is not live => bar
and slot spaces coincide"* — **is false during the daily break.** The
axis is still laid out in live minute-slot form: the current frame
pre-grids the future out to 08/12, ~1.5 days past the last candle. So
bar-index emission mis-places everything. The label column `lx = i + 4`
(~3003) lands at minute-slot 3003 ~= 2.1 days after origin, i.e. around
08/03 — far off-screen left of the 08/06 viewport edge. That is where
the labels went.

## WHY THE PROFILES STILL LOOK RIGHT (and this corroborates the story)

The translucent session blocks are still correctly placed, which at
first looks like a contradiction. It is not: **v10 moved rows onto the
custom plotter, which draws in pixel space with its own bar->x mapping**
and never touches `du`. So rows are structurally immune to this flip.

That leaves exactly the du-emitted set as the casualties, and it matches
what is missing on screen:
- all level/price **labels** (`lx = i + 4`)
- the **session-start vline** (`dayLn`)
- the **VA zone box** (`vaZ`) and the ACCUM box

**This is the residual anchor-dependent surface v11 counted (9 layers) —
now with a live, reproducible, once-a-day trigger.**

## THE FIX IS NOT OBVIOUS — please measure before choosing

Three candidates, none clean:

1. **Raise the staleness threshold** above the 60-min break (say 90 min).
   Cheap, but the constant is a guess, and note `3 * barMin` is already
   absurdly tight at 1M — **3 minutes**, which thin overnight stretches
   cross routinely. If this class has been intermittently misfiring at
   1M overnight, this is why.
2. **Latch it**: once a live bar is observed, keep `[t-du]` for the life
   of the instance. Physically right — axis layout does not revert
   without a reload — but **it does not fix today's case**, which is an
   F5 *during* the break: no fresh bar ever arrives, so the latch never
   engages and we sit in `[du]` on a live-laid-out axis.
3. **Decide from axis evidence rather than the clock.** Preferred in
   principle, but we do not currently know what the platform does to the
   axis during a 60-min halt.

**Recommended: run `calib=1` during tomorrow's 16:00-17:00 CT break.**
That is precisely the instrument built for this in field-report section
9, the break is a zero-risk window (position 0, no live RTH), and one
screenshot settles which space the axis is in. Pick the rule from the
measurement, not from a guess about the constant.

Interim: leave AUTO alone. `duTime=1` would fix the break but would
break the genuine weekend pre-open case, which is the one `[du]` was
Saturday-proven for. The break is one hour a day and not a trading hour.

## Verification still owed

The reopen at 17:00 CT should flip the banner back to `[t-du]` and bring
every label back in place with no other change. If it does, this
diagnosis is confirmed end to end without any dialog interaction.

Account: position 0, equity 98,919.41 unchanged. No chart-canvas clicks;
the only click was the panel-header gear, which turned out to be
Tradovate's own panel menu, not indicator params — dismissed with Esc.
