# VISUAL v7.1 — the mis-boxed session (field report §8)

**Scope:** `indicator/wrapper.js` MP session block + telemetry,
`sim_synth.js` part 12. **Engine untouched — `node indicator/test_core.js`
verified `205/205 MATCH`.**

## 1. The audit (§8's suspect)

§8 hypothesized an unresolvable session start falling back to the session
END with the day span drawn forward. **The committed code contains no such
path**: when `idx(session.start)` is undefined the session was skipped
entirely (`continue`) — no end-fallback, no forward span, and main is
byte-identical to PR #8 (no hot patches). The width rule also caps every
rendered session at the live edge (`wS ≤ i − 12 − six`), so a box whose
numbers came from the committed resolution path cannot span
[Friday close → future grid].

That leaves an honest gap: from here I cannot reproduce the observed frame
from the committed code. The candidates that survive are all *observability*
problems — the skip was silent (no marker, indistinguishable from a bug),
and `sp@` printed only the first session, so the culprit box could not
self-identify. v7.1 closes every one of those holes so the next reading
names the emitter definitively; and its guards make the observed geometry
impossible to emit in du space regardless of which upstream path produced
it.

## 2. Changes

1. **v6.3 rule applied to MP boxes (the ask).** An unresolvable session
   start now records WHY: start predates loaded history →
   `[old anchors offscreen - load more bars]` on the banner and a `pre`
   entry in telemetry; otherwise an `x` entry. Nothing is ever drawn for
   such a session — same as before, but no longer silently.
2. **Guard coverage extended to all MP elements (spec §4).**
   - An emission-time **span guard**: a day-spanning session structure
     (rows/median/bracket) may never cross the live bar; a violating
     session is skipped whole and named via `[future-grid item:
     sp<start>SPAN]`. The width cap makes this unreachable from committed
     code — it is defense in depth against whatever produced §8's frame.
   - **px-mode rule**: px row widths cannot be checked in du space, so in
     px mode sessions anchored within 60 bars of the live edge are skipped
     entirely (telemetry `cap` entry).
   - The end-of-frame du scan (v6.4) continues to cover every MP
     Shapes/LineSegments item; dashed median rays remain the one
     *visually* unbounded element by design (`infiniteEnd`), matching
     ShowMedianRays=All.
3. **Full `sp@` telemetry (the ask).** One entry per session in the
   rendered slice, oldest first: `sp@29w1173,1409w1173,pre` — rendered
   sessions print `anchor+width`, skipped ones print why (`pre` /
   `x` / `n` no-profile / `<x>cap` live-edge / `<x>SPAN` guard). A
   mis-boxed profile now self-identifies in one diag reading: whichever
   entry's `anchor..anchor+width` matches the observed box is the
   culprit, and if NO entry matches the observed box, the emitter is not
   the MP session layer at all (the remaining candidates would be the
   vaFill plotter if enabled, or platform-side behavior — the reading
   decides).

## 3. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 12:
  12a  pre-history session start: nothing drawn, offscreen marker on the
       banner, "pre" entry in sp@
  12b  session anchored 5 bars from the live edge: skipped by the cap,
       "cap" entry in sp@, no future-grid flag
  12c  sp@ lists every session in the slice (count asserted)
  12d  every rendered anchor+width entry stays >=10 bars left of the
       live bar
  parts 1–11 all still pass
```

## 4. Next session

Same frame, `diag=1`, one screenshot. Read `sp@`:
- an entry `<a>w<w>` whose span matches the observed box → the MP layer
  drew it and the numbers say from what anchor — we fix that resolution
  with exact knowledge;
- `pre` where Thursday should be → Thursday was correctly skipped and the
  observed box came from something else (check whether `vaFill=1` is set
  in the dialog — changed values persist across F5 — and whether the box
  disappears with `vaFill=0`);
- `[future-grid item: sp…SPAN]` → the span guard caught and suppressed a
  breach that the previous build would have drawn.
