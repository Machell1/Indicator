# 1M ASSESSMENT + 15M FIRST CONTACT (2026-08-10, RTH ~10:45-10:55 CDT)

Live readings taken during the Monday session with v9.2 deployed. The
trader asked directly whether the 1M histogram formation is "everything
ok". Formation quality: **yes**. Completeness: **no** — three items
below, the first functional.

## 15M FIRST CONTACT — PASS (closes one queued item)

15M renders correctly: session profile anchored and growing right, all
levels and labels clean, `[t-du]` active, no reset residue, no slab, no
`[oversize item]`. Banner at 10:45: `stood down: touch had no
absorption-initiative signature`, `ACCUM 4414.9* SELL retest
[+0.28R/75% n12]`, `HTF: above value (info, not a gate)`, plus the 15-min
CAUTION and star marks — all correct for a coarse timeframe. The
per-profile key-value suppression is active at 15M as designed.

Not captured: `hpro@/apro@/accB@` telemetry (diag was off; deliberately
not toggled during a live RTH session after the section-7 order-bubble
incident). Still queued for a quiet moment.

## 1 — HTF COMPOSITE IS UNAVAILABLE ON 1M (functional, highest priority)

On 1M the banner reads **`HTF: needs more history`**; on 15M/30M the same
account/instrument shows `HTF POC 4109.4` and the above/below-value
context line. Cause is arithmetic, not a defect: the composite requires 5
completed sessions, and the working bars-to-load ceiling of 3000 is ~2
days of 1-minute bars. Raising the ceiling is not available — >3000
exceeds the platform's ~3s indicator data-call timeout and NOTHING loads
(recorded platform fact).

**Why it matters:** 1M is the graded basis (levels unstarred) and is
therefore the execution timeframe we tell the trader to use, so today he
must read HTF context on 30M and execute on 1M. The single self-contained
chart he asked for does not exist yet on the timeframe that matters.

Directions worth evaluating (no preference asserted — measure first):
- Persist finalized session summaries (key + POC/VAH/VAL + row digest)
  across the instance lifetime so the composite survives a shorter bar
  window, rebuilding from summaries rather than raw bars. Note the
  platform gives no storage API, so this only survives while the instance
  lives (F5 would reset it) — quantify whether that is still useful.
- Build the composite from the SESSION PROFILES we already retain rather
  than requiring 5 raw sessions in the buffer.
- If neither is sound, make the limitation explicit rather than silent:
  `HTF: unavailable at 1M (needs ~5 sessions; 3000-bar limit)` so the
  trader knows it is a data ceiling, not a warm-up that will finish.

## 2 — PROFILE WIDTH IS NOT CONSISTENT ACROSS TIMEFRAMES

30M: profiles fill ~85% of their session (matches MP_55396 and the
trader's MT5 look). 1M: the profile is a narrow band near the session
start covering roughly 10-15% of the 23-hour session (the `wPrev` 150-bar
cap against a 1380-minute session).

This directly contradicts the trader's original requirement — *"this
would ensure the histogram forms on the 30M, 15M, 5M and 1M"* — and it
was never a decision made in front of him. It may be defensible (a
session-wide profile on 1M would span the entire viewport and bury price)
but it should be **chosen and stated**, not emergent. Options: scale the
cap as a fraction of the session rather than a fixed bar count; or keep
the current behaviour and document it as intentional in the visual doc so
the difference between timeframes is expected rather than surprising.

## 3 — SOLID ROWS OCCLUDE THE CANDLES THEY SIT ON

On 1M the profile is drawn solid over the first ~2-4 hours of the
session, hiding that price action. Root cause is the long-standing
platform fact (fill alpha is ignored for Rectangle fills, live Bug A).

**`vaFill` — the canvas-plotter translucency route built in v6 for exactly
this problem — has still never been run live.** It has been toggle-ready
since v6 and every session since was consumed by the anchor/timeframe
work. If the plotter honours opacity as the community sources suggest,
the same pipeline may also be able to render the profile rows themselves
translucent, which would resolve this properly rather than cosmetically.
Recommend: test `vaFill=1` first (one toggle, already built), and only
then decide whether to move row rendering onto the plotter path.

## Suggested order

1. HTF-on-1M (functional gap on the execution timeframe).
2. `vaFill=1` live test — cheap, already built, unblocks item 3.
3. Width-consistency decision (choose and document).
4. Carried over: top-right label-stack cross-cluster sweep;
   `hpro@/apro@/accB@` telemetry capture at a coarse timeframe.
