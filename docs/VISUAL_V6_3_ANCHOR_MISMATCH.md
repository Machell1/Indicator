# VISUAL v6.3 — the in-range wrong anchors (field report §5)

**Scope:** `indicator/wrapper.js` anchor consumers + banner + diag,
`sim_synth.js` part 9. **Engine untouched — `node indicator/test_core.js`
verified `205/205 MATCH` on this revision.**

## 1. The path v6.2 didn't cover

Your §5 numbers (`gap=0 desync=0`, mirror 1:1 with the chart, session anchor
exact) rule out the resolution function itself: in that state every
exact-match timestamp resolves by pure tail-offset, which cannot return a
wrong-but-in-range index. The wrong anchors came from *around* it — the
**fallback anchors in the consumers**:

- the ACCUM level ray fell back to **x0** when `idx(accum.start)` returned
  undefined — and with the newly confirmed 3000 bars-to-load ceiling, a
  Thursday rotation start **routinely predates the loaded history**, so the
  gold ray + label were pinned at the session start (your "~x0/live-bar
  region"), with the infinite-right ray running over the pre-gridded future
  axis ("extending into the future grid");
- naked-POC rays fell back to **x0 − 200** — same class, mid-recent-history;
- both are wrong-but-legal indexes ≤ i, exactly the blind spot you described:
  the overshoot guard can never see them.

## 2. Fixes

1. **Honest anchoring for pre-history levels.** A level born before the
   loaded history truthfully extends from off-screen left: its ray now
   anchors at the chart edge (index 0), never at x0/x0−200. The ACCUM box
   and histogram (which need a real window position) stay hidden when the
   window start can't resolve. A dim banner marker explains the state and
   the remedy: **`[old anchors offscreen - load more bars]`**.
2. **Per-layer `[anchor mismatch]` cross-check (your §5 suggestion).** Every
   consumer now resolves through `idx(t, layer)`; each resolved anchor is
   compared against an independent pure tail-offset reference for the same
   timestamp. Divergence beyond 1 bar puts the layer name on the banner:
   `[anchor mismatch: accum,sp,…]`. Items keep drawing per the trust
   hierarchy (in known-gap mode the stored path is still the right one and
   suppression would hide correct structure), but wrongness anywhere IN
   RANGE is now visible and attributed — nothing can be silently wrong
   again.
3. **ACCUM window telemetry.** There is a second hypothesis your §5 can't
   yet exclude: the engine legitimately detecting a thin Sunday-overnight
   rotation near the live edge (quiet bars shrink the trailing ATR, and the
   rotation scan starts at the newest bars). If so, the anchors were CORRECT
   for a window the trader didn't expect — a semantics question, not a
   resolution bug, and the graded machine's behavior is not mine to edit.
   `diag=1` now prints `acc=<start>..<end>` as bars-back-from-now (`pre` =
   older than loaded history). One reading separates the two: `acc=pre..N`
   or `acc=1150..900` = old window, anchor bug class; `acc=90..30` = the
   engine really detected a recent window.

## 3. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 9:
  9a  ACCUM window + naked POC born before the mirror: gold ray anchored
      at the chart edge (0), never x0; box/histogram hidden; offscreen
      marker shown; no false mismatch
  9b  gapped mode with a uniformly stale in-range stored frame: items
      keep drawing per the trust hierarchy, banner names the divergent
      layers ([anchor mismatch: accum,mark ...]) alongside
      [mirror desync]
  parts 7 and 8 (prepend / gap / unresolved / weekend-gap boot) all
  still pass
```

## 4. Next session

- If the gold ACCUM ray appears at the LEFT edge with
  `[old anchors offscreen - load more bars]`: v6.2's resolution was right
  all along and the window predates 3000 bars — the marker is the fix
  working.
- If `[anchor mismatch: …]` ever appears: screenshot with `diag=1`; the
  named layers plus `acc=…` ages give a complete remote diagnosis.
- If the box still draws near the live edge with `acc=<small>..<small>`:
  the engine genuinely detected a fresh overnight rotation — that becomes
  a semantics discussion for the playbook, not a rendering defect.
