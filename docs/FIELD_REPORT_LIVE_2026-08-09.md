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
