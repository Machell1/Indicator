# LIVE FIELD REPORT — first live session, 2026-08-09 18:00 ET open

**Build:** v6.1 + review fixes (main @ the v6.1 merge) + one hot patch during
the session (diag line reordered, see §4). **Account state throughout:**
position 0, equity unchanged. The engine, levels, banner, and signal watch
all behaved correctly on live data. One rendering defect found — precisely
instrumented below.

## 1. THE BUG — all old-timestamp anchors displace into the future grid

**Symptom:** with the market live, the ACCUM box + gold histogram, the ACCUM
level ray's start point, and the historical session profiles all render in
the EMPTY future region right of the live candles (the axis pre-grids the
upcoming session's time slots — labels for 11:54pm / 08-10 / 7:54am exist
with no bars). Displacement is roughly 150–400 index slots. Price-anchored
items (all rays' y, labels, banner) are correct; it is purely the x/index
axis.

**Decisive facts:**
1. **F5 does NOT fix it while the market is open.** A fresh boot reproduces
   it deterministically. (Pre-open, fresh boots and pans always re-anchored
   correctly — the user verified this repeatedly Sunday afternoon.)
2. **The diag line in the broken state reads:** `anchor=ok@2946 i=3000
   base=0 mirror=3000` (later `ok@2946 i=3001 ... mirror=3001` — mirror
   tracks live appends perfectly). At 17:54 CDT, x0=2946 with i=3000 is
   EXACTLY right: 54 live bars since the 17:00 CDT open. **The current
   session-start anchor resolves correctly.**
3. Therefore: **recent timestamps resolve correctly; OLD timestamps
   (Thursday/Friday: accum.start, sessionProfiles[].start) resolve too
   HIGH** — they land beyond i, in the future slots. The self-check shows
   no `[mirror desync]` because mirror length == chart length; the
   corruption is inside the mapping for older entries, not the counts.
4. Working hypothesis to verify first: the live chart's bar array now
   contains only ~3000 bars starting Thursday (bars-to-load 3000), while
   the WEEKEND GAP means wall-clock-to-index is discontinuous. If any part
   of the v6.1 index resolution interpolates or extrapolates by TIME
   (rather than walking actual mirror entries), Thursday timestamps get
   pushed right by roughly the size of the gap. The displacement magnitude
   (~a few hundred slots) is consistent with the Fri-17:00→Sun-18:00 gap
   interacting with an extrapolation. `base=0` in all readings.

**Asks:**
- Fix old-timestamp resolution under live conditions (binary search over
  actual mirror entries only — no time-linear shortcuts anywhere).
- Add a hard clamp/guard: any resolved anchor > i is invalid — suppress
  the item (occlusion-guard style) AND surface `[anchor overshoot]` on the
  banner. The current self-check missed this failure completely.
- Add a sim scenario reproducing a weekend-gap history (Thu+Fri bars, 49h
  hole, then live Sunday bars) and assert every layer's anchor <= i.

## 2. CONFIRMED LIVE — prop delivery model (major platform fact)

With diag=1 during the live session, the full dump read:

```
props: htfSessions=number:20  scaledWidths=undefined:undefined
devProfile=undefined:undefined  nodes=undefined:undefined
vaFill=undefined:undefined  vaFillColor=undefined:undefined
vaFillOpacity=undefined:undefined  showHistory=undefined:...
```

while the `diag` param itself — which had just been CHANGED in the dialog —
delivered and took effect immediately (the line rendered, survived F5, and
turning it back to 0 also delivered).

**Delivery model, now proven:** `period` specs always deliver
(htfSessions=number:20). `number` and `color` spec VALUES are NOT delivered
while they sit at spec defaults — they arrive `undefined` — but a value the
user actively changes in the dialog IS delivered (and persists across F5).
The v4 architecture (defensive coercion; code defaults == intended
behavior) absorbs this exactly as designed. Update the platform-facts
registry section 4: this supersedes the narrower "bool values never arrive"
fact from the v4 session.

## 3. What worked live (all verified on the open)

- Session roll: PREV became Friday's session with correct values
  (POC 4407.9 / VAH 4432.4 / VAL 4352.5) the moment tonight's bars arrived.
- Banner status tracked the live signal watch ("waiting: price has not
  moved 1 ATR from the level") with the delta disclosure + [du] marker.
- Dev levels (dPOC/dVAH/dVAL) updated with the developing session.
- Settings dialog round-trips work: color picker renders, changed values
  deliver, Save/Apply both function; indicator survives settings saves.
- Mirror integrity under live appends: mirror incremented in lockstep with
  i on every new bar.
- Bars-to-load: platform accepts up to 9000 in the dialog, but ~9000 makes
  the indicator's data call exceed the platform's ~3s timeout and NOTHING
  loads (not even the banner). 3000 loads reliably and covers a full prior
  session. Treat >3000 as unusable until proven otherwise.

## 4. Hot patch shipped during the session

`stat4` diag line reordered: `anchor=/i=/base=/mirror=` now print FIRST,
props after — the props dump is longer than the viewport and was clipping
the anchor numbers off-screen (the load-bearing diagnostic). `i=` added.
Deployed live 17:54 CDT; keep this ordering.

---

## 5. v6.2 live verification (deployed 18:22 CDT, same session)

Diag with v6.2 running: `anchor=ok@2918 i=3002 base=0 mirror=3002 gap=0
desync=0` -- the fields render, mirror tracks appends, no gaps, no
re-index detected since this boot, session-start anchor exact.

**Fixed live:** the PREV-session profile now anchors correctly at the
17:00 CDT session start (it floated in the future grid under v6.1).

**Still wrong:** the ACCUM box + gold histogram + a second session profile
still render just right of the live edge (~x0/live-bar region, extending
into the future grid), and the overshoot guard does NOT fire -- so those
anchors now resolve to a wrong-but-legal index <= i (clustered near the
live edge / x0 region), not an overshoot. The ACCUM window is from
Thursday; its correct anchor is deep in the Friday candle region
(tail-offset ~1150-1200 back from i). Hypothesis: the ACCUM/session
resolution path still consumes a stored index (or resolves via a
different helper than the one fixed), and the stored boot-frame numbers
happen to land near the live edge instead of past it -- which is why the
overshoot guard never trips. Note the guard as designed can only catch
anchors > i; a "wrong but plausible" anchor is invisible to it. Consider
cross-checking each layer's resolved anchor against its own timestamp
via tail-offset (they should agree within a bar) and flagging
`[anchor mismatch]` on divergence -- that catches wrongness anywhere in
range, not just overshoot.

---

## 6. v6.3 live verification (deployed 18:43 CDT, same session)

Diag: `anchor=ok@2897 i=3001 base=0 mirror=3001 gap=0 desync=0
acc=2879..897` -- v6.3 running, telemetry complete.

**The decisive reading:** `acc=2879..897`. The ACCUM window is WITHIN the
loaded history (start 2879 bars back ~= Thu evening, end 897 back ~= Fri
~03:00) -- NOT `pre`, NOT a fresh overnight rotation. Both endpoints
resolve in-range, and NO `[anchor mismatch]` flag fires. Yet the gold
ACCUM histogram/box cluster still RENDERS at the live-edge / future-grid
region (~x 610-730 on a 1366 viewport with the last candle at ~595), i.e.
at du positions ~= i..i+150 instead of du ~= 122..2104 where indices
(i-2879)..(i-897) belong.

**Conclusion: resolution is now provably correct and cross-checked; the
displacement survives in the RENDERING CONSUMERS of those resolved
anchors.** Something between "anchor resolved" and "primitive emitted"
re-derives or reuses a different x for these layers. Candidates to audit
line-by-line: (a) any consumer still holding a cached/stale local variable
from a previous frame's resolution; (b) width/second-coordinate arithmetic
that ADDS an absolute index where a width was intended (e.g. x + ib
instead of x + (ib - ia)); (c) a du() call receiving a bars-back value
instead of an absolute index (2879 as an absolute du lands right of i on
a 3001-bar chart -- which matches the observed positions almost exactly:
du(2879)..du(2104+...) -- CHECK THIS FIRST: the cluster sits where the
BARS-BACK numbers would land if drawn as absolute indexes).

Note the near-coincidence: acc start 2879 bars-back vs cluster at du
~2900-3050 on a 3001-bar chart. A bars-back/absolute-index unit confusion
in the ACCUM/session consumers would produce exactly this geometry.

---

## 7. v6.4 live verification -- CASE CLOSED (deployed 19:07 CDT)

Diag: `anchor=ok@2874 i=3002 base=0 mirror=3002 gap=0 desync=0
acc=2879..917 emit accB@undefined accL@undefined sp@undefined`

The emit telemetry settles sections 5 and 6 conclusively: the ACCUM box,
ACCUM ray, and session-profile layers are NOT EMITTED in the live frame
(v6.4 guards suppress them), no [future-grid item] flag fires, and the
chart is clean. The "cluster at the live edge" investigated in sections 5
and 6 was the RIGHT-EDGE LABEL COLUMN + rays passing through -- structure
misread from compressed screenshots, exactly as the v6.4 audit proposed.
The only real anchor defect was v6.1's stale stored indexes, fixed in
v6.2. Sections 5-6 stand as a record of how in-range wrongness was ruled
out layer by layer.

One follow-up question for the next PR (minor): `accL@undefined` -- the
ACCUM level ray is also suppressed in this frame. If the intended v6.4
behavior is "ray edge-anchors with the provenance suffix when the window
is resolvable" (acc=2879..917 IS in-range here), confirm why the ray
chose suppression over edge-anchor+suffix; if intended (e.g. box-hidden
implies ray-hidden), document it in VISUAL_V6_4_EMITTED_GEOMETRY.md.

Session tally: 4 live deployments (v6.1 hot patch, v6.2, v6.3, v6.4),
205/205 on every one, position 0 and equity unchanged throughout.

---

## 8. v7 live verification (deployed 20:30 CDT): the MP look renders; one mis-boxed session profile

**The clone look is CONFIRMED live** -- Blue->Red gradient reads exactly
like the reference (blue early rows top, red late rows bottom), white
median row, brackets, gold ACCUM rows interleaved. The construction-time
emit telemetry prints plain numbers: `anchor=ok@2789 i=3000 base=0
mirror=3000 gap=0 desync=0 acc=2879..1005 emit accB@120 accL@120 sp@29`.

**THE BUG:** a fully-styled session profile whose content is THURSDAY's
session -- trader-confirmed by its levels: white median at 4324.9, rows
bracketing VAH 4344.1 / VAL 4303.6, exactly the Thursday values -- is
drawn in a box spanning roughly [Friday close .. right edge of the
future grid], i.e. across TONIGHT's session region. The trader confirms
tonight NEVER traded 4305-4365 (price was 4370+ all evening, at 4375
falling when observed). So: right content, wrong box.

**Second finding:** that box extends well past the live bar into the
future grid and `[future-grid item]` did NOT fire -- the emitted-geometry
guard does not cover the new MP elements (day-spanning boxes/medians/
brackets), contrary to spec section 4. Close that gap regardless of the
box fix.

**Telemetry gap that hid the culprit:** `sp@29` prints only the FIRST
session profile's position. The mis-boxed session (Thursday's) is one of
the later entries. Print ALL session anchors as a comma list
(`sp@29,1430,2810,...`) so the culprit self-identifies next reading.

**Geometry hints for the audit:** Thursday's session START (Wed 17:00 NY)
is PRE-HISTORY at bars-to-load 3000 (buffer starts ~Thu afternoon) -- its
start does not resolve. The v6.3 rule for that case is edge-anchor (rays)
or hide (boxes/histograms). The new MP day-spanning box code appears to
take a different path: box lands at ~[Fri-close .. +day-span]. Audit what
the MP box does when idx(session.start) is undefined -- suspect a
fallback to the session END (Thu 16:00 CDT resolves fine) PLUS the day
span drawn FORWARD from it, which lands the box exactly where observed
(Thu-end + 1 day = Fri-end, + drift across the weekend-gap axis). The
v6.3 rule should apply: unresolvable box start = do not draw the box,
banner the offscreen marker.

---

## 9. v7.1 live (deployed 21:05 CDT): construction proven correct; the divergence is du->pixel

Full telemetry with the styled profile visible ACROSS the future grid:
`gap=0 desync=0 acc=2879..1123 emit accB@121 accL@121 sp@0w1165,1371w1173`
and the element signature confirms `vaFill=0` (your plotter hypothesis is
refuted -- the fill was never on; thanks for the falsifiable prediction).

Read it together: EVERY emitted structure sits at sane bar-indexes far
left of the live bar (sp boxes [0..1165] and [1371..2544], accB/accL at
121; i ~= 3010). Nothing is constructed past the live bar; the span guard
correctly has nothing to catch. Yet the rendered profile visibly spans
from the Friday-candle region deep into the pre-gridded future axis
(Monday-morning labels), and the visible axis compresses ~1,400 Friday
bars into ~350px while stretching ~12 future hours across ~700px --
NON-UNIFORM index-to-pixel behavior.

**Conclusion: with construction-truth telemetry on both sides, the only
remaining variable is the platform's du->pixel mapping on a live chart
whose axis includes the weekend gap + pre-gridded future session. du(n)
does not land at "the n-th bar's pixel column" under these conditions.
Every prior "mis-anchor" this weekend is consistent with this one fact.**

**The ask -- a du-axis calibration probe, one screenshot to map it:**
under `diag=1` (or a new `calib=1`), draw thin labeled vertical lines at
du = i, i-100, i-500, i-1000, i-2000 plus du = 0, and one line placed by
PRICE-anchored means at the live bar for reference. A single frame then
gives the empirical du->pixel function (uniform? per-bar? per-minute
including gaps? clamped?). Once mapped, either du positions get a
transform before emission, or -- if the mapping is per-minute-with-gaps --
anchors should be emitted as (timestamp-derived minute offsets) instead
of bar indexes. Do not guess: probe first, transform second.
