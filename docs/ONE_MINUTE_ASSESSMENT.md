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

---

# section 9 — vaFill LIVE TEST: THE PLOTTER HONOURS OPACITY (2026-08-10 11:15-11:21 CDT)

Ran at the trader's go-ahead, v9.3 deployed, 1M chart, live RTH.

## RESULT: THE ROUTE WORKS. Real alpha compositing confirmed.

Procedure and readings:
1. `vaFill=1`, opacity at the 18 default -> a band is present but too
   subtle to call with confidence from a compressed screenshot. Refused
   to declare either way on that frame.
2. Raised `vaFillOpacity` to **80** to turn a marginal signal into a
   decisive one. Result unmistakable: a solid teal region spanning the
   prior session value area (VAL 4352.5 -> VAH 4432.4) across the whole
   session, **with every candle still visible through it** — wicks,
   bodies and the 09:00 rally all readable inside the band.
3. Restored to a usable **opacity 14**; shading present, candles clean.
   Chart left in this state.

**Conclusion: `canvas.drawLine` with a first-class `opacity` style does
real alpha compositing on this platform.** This is the definitive
counter-case to the graphics-items fill-alpha fact (live Bug A, v3): the
two pipelines genuinely differ, exactly as the v6 community research
predicted. Registration, draw path, opacity, colour and VA span are all
now live-verified — the layer built in v6 and never run until today is
fully proven.

## What this unlocks (the next PR)

Per Cursor's own branch condition, this is the "route works" outcome:
- Move the profile ROWS onto the plotter path so they stop occluding the
  candles they sit on (1M assessment item 3, root-caused rather than
  worked around).
- With rows no longer opaque, the ~150-bar developing-profile cap can be
  revisited: day-wide developing profiles become viable, which closes
  the cross-timeframe width inconsistency (item 2) in the same change.
- Both items were explicitly blocked on this reading. They are now
  unblocked.

## Calibration notes for the implementation

- 18 (the shipped default) reads too faint against this dark theme at
  1M; **14 is comfortable for the VA band**, and the useful range for
  rows will need its own tuning since rows overlap each other.
- 80 is far too strong for production but is an excellent diagnostic
  setting — recommend keeping it in the doc as the "is the plotter
  drawing at all?" probe, since the 18-default frame was genuinely
  ambiguous.
- The band correctly shades each bar with ITS session's prior VA; on a
  1M chart where the whole viewport sits inside the prior VA, that means
  the entire visible area tints. Worth stating in the doc so it is not
  mistaken for a bug.

## Account state

Position 0, equity 98,919.41 unchanged. All dialog interaction went
through the Elements panel with a screenshot verification before every
click inside the dialog (the process rule added after the section 7
order-bubble incident) — no chart-canvas clicks.

---

# section 10 — v10.1 FULL MIGRATION LIVE (2026-08-10 13:55-14:00 CDT)

Deployed the full row migration and ran the deliberate 5M smoothness
pass Cursor asked for.

## 1M — CLEAN

Full translucent developing profile spanning the session, candles
readable throughout, all structure intact: banner, `HTF: n/a - 2/5
sessions loadable here (read HTF on 30M)`, PREV POC 4407.9 unstarred,
dVAH 4411.6 / dPOC 4394.8 / dVAL 4381.5, VA bracket, `[t-du]`, no
`[oversize item]`. rowOpacity 20 default reads correctly.

## 5M PAN/ZOOM PASS — no hangs, but read the caveat

Four full-width drags (both directions) plus repaints at 5M with the
deepest history and every family migrated. **No renderer hangs, no
screenshot timeouts, no stalled repaints** — each pan completed and
redrew correctly, and the HTF composite populated (`HTF POC 4136.6`,
`HTF: above value`). Compare against earlier in this project where the
renderer genuinely froze and CDP screenshot calls timed out; nothing of
that kind occurred here.

**Honest limit on this result:** discrete screenshots cannot measure
frame rate during a drag. What is verified is "no hangs, correct
redraw"; true perceived smoothness is a human judgment and the trader
should do one deliberate pan himself before this is called settled.

## NEW COSMETIC FINDING — translucent blocks stack at coarse timeframes

At 5M with ~6 sessions in view, the now-translucent row blocks from
adjacent sessions OVERLAP each other, and overlapping translucency
compounds: the chart reads as a patchwork of coloured slabs (magenta,
navy, olive) behind price. Candles remain visible — the occlusion fix
holds — but the composite is visually noisy in a way the opaque gauges
were not, because opaque gauges were narrow and these fill their
sessions.

This is the flip side of closing the width inconsistency: full-width
profiles at every timeframe means neighbouring sessions now share
screen space. Suggestions (not prescriptions):
- scale `rowOpacity` down as the count of VISIBLE sessions rises, so
  6 stacked sessions do not sum to an opaque wash;
- or reduce the finalized-session fill fraction while keeping the
  DEVELOPING profile full-width (the developing one is what the trader
  reads intraday; history only needs to be legible, not prominent);
- or cap rendered sessions by visible span rather than a fixed count.

Recommend tuning against a 5M screenshot the same way the label pitch
was tuned against the section 8 frame.

## Deferred this pass

`hpro@/apro@/accB@` telemetry capture and the 30M label-stack acceptance
check were NOT done — the settings dialog was already opened several
times during live RTH for the vaFill calibration, and further dialog
work during the session was judged not worth the risk. Both remain
queued for a quiet moment.

Account: position 0, equity 98,919.41 unchanged. Chart restored to 1M at
the live edge.

---

# section 11 — v10.2 EMPHASIS TABLE LIVE (2026-08-10 14:20 CDT, 1M)

Deployed. On 1M the chart is markedly quieter: price action fully
unobstructed through the rally to 4442, historical session blocks well
recessed, all levels crisp (PREV POC 4407.9, dVAH 4411.6, dPOC 4394.8,
dVAL 4381.5, VAH 4432.4, `HTF: n/a - 2/5 sessions loadable here`,
`[t-du]`). The per-family emphasis mechanism works as specified.

**Calibration note (trader's eye required):** at the shipped defaults the
result may be slightly TOO recessive on 1M — historical sessions at
effective 10 read very faint. Not a defect; the numbers were explicitly
shipped as starting points. Candidate tweak if the trader agrees:
session 0.5 -> 0.6, htf 0.4 -> 0.5, leaving dev at 1.0. Await his read
before changing anything.

**5M patchwork acceptance NOT run.** Deliberate: gold was in a live rally
(+22.4, 0.51%) with the trader on his execution timeframe, and the
acceptance requires switching away from it. Queued with the other
trader-side readings rather than forced during a moving market.

## Remaining queue (all trader-side, none blocking)

1. Deliberate human pan at 5M — perceived smoothness (the honest limit
   section 10 stated on screenshot-based verification).
2. 5M frame for the emphasis/patchwork acceptance + any per-family tweak.
3. Coarse-timeframe `hpro@/apro@/accB@` telemetry capture.
4. 30M label-stack cross-cluster acceptance.

Account: position 0, equity 98,919.41 unchanged across 15 deployments.
