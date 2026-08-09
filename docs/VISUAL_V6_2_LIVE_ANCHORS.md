# VISUAL v6.2 — response to the live field report (18:00 ET open)

**Scope:** `indicator/wrapper.js` anchor resolution + banner, `sim_synth.js`
part 8, platform-facts registry update. **Engine untouched —
`node indicator/test_core.js` verified `205/205 MATCH` on this revision.**

## 1. Root cause of the old-anchor overshoot

First: the resolution never used time-linear shortcuts — it was already an
exact binary search over mirror entries. The defect was in *which* number the
search returned, plus a reporting hole:

1. **Stale stored indexes with no observable rebase.** v6.1's primary path
   returned the chart index recorded when each bar was pushed, corrected by a
   prepend base. Your diag numbers (`ok@2946 i=3000 base=0 mirror=3000`, old
   anchors +150–400) prove the live chart **re-indexed/trimmed its bar array
   between pushes**: recent bars carry current-frame indexes (Sunday bars and
   the session start resolve exactly), old bars carry boot-frame indexes
   (+150–400), and neither rebase detector fired — the developing-bar check
   can't (its timestamp isn't the last pushed), and the walk-back boundary
   check never runs when `history.get` is dead on live (Q3). `base=0` with a
   split-frame mirror is exactly that signature.
2. **The banner was printed before the flags could raise.** The `[mirror
   desync]` cross-check actually fired during those resolutions — but the
   banner line was emitted at the top of the frame build, before the ACCUM /
   session-profile anchors were resolved. That is why the self-check "missed
   this failure completely."

## 2. The fix

- **Trust hierarchy with a witness.** Both computations are kept, and each is
  exact under a different live-observed failure mode:
  - *tail-offset* (mirror position counted from the newest entry, anchored at
    the live bar's ground-truth index) — exact under re-indexing/trims; blind
    only when the mirror missed bars;
  - *stored-index + base* — exact when the mirror missed bars (Q3 gaps);
    stale under unseen re-indexing.
  The walk-back now **records the moment it strands bars** (break before
  reaching the already-pushed boundary, or the 500-bar cap filling):
  `mirrorGapped`. Resolution trusts tail-offset unless the mirror is
  known-gapped — so the evening frame resolves every old anchor exactly, and
  the previously-verified gap scenario still resolves via stored indexes.
  Disagreement between the two always raises `[mirror desync]`.
- **Overshoot guard.** Any anchor resolving beyond the live bar is invalid by
  definition: it is suppressed (the item is hidden, occlusion-guard style)
  and `[anchor overshoot]` appears on the banner. Nothing can render in the
  future grid regardless of what the platform does to the index space.
- **Banner emitted last.** All anchor-health flags (`[anchor unresolved]`,
  `[anchor overshoot]`, `[mirror desync]`) now reflect the frame that was
  actually just built. The diag line additionally prints `gap=`/`desync=`
  and keeps the anchor-first ordering from your hot patch.

## 3. Registry updates (from your §2 and §3)

`TraderMachell_Review_v2.md` §4 now records: the confirmed prop-delivery
model (period always delivers; number/color deliver only after the user
changes them in the dialog — code defaults are the shipped behavior),
the bars-to-load ~3000 practical limit (~9000 exceeds the platform's ~3s
data-call timeout and nothing loads), and the live re-indexing fact with a
pointer to the trust hierarchy.

## 4. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 8, weekend-gap live boot:
  8a  cached Thu+Fri replay -> live snap with a 354-bar head trim, Sunday
      bars 49h after Friday's close arriving as direct completes,
      history.get dead throughout (base stays 0 -- the live signature):
      session-start AND every historical session-profile anchor resolve
      to post-trim ground truth EXACTLY; nothing rendered past the live
      bar; [mirror desync] shown; no false [anchor overshoot]
  8b  trust forced onto a stale stored frame resolving past the live bar:
      every stale-anchored layer suppressed, [anchor overshoot] +
      [anchor unresolved] shown, nothing in the future grid
  parts 7a/7b/7c (prepend / gap / unresolved) all still pass under the
  new trust hierarchy
```

## 5. Next session

- The evening frame should now draw ACCUM/session profiles at their true
  positions. If a layer is ever hidden instead, the banner will say which
  guard fired — `diag=1` now also prints `gap=`/`desync=` so one screenshot
  fully classifies any residual platform behavior.
