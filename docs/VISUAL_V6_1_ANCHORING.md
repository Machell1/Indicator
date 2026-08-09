# VISUAL v6.1 — the right-edge histogram, root cause and fix

**Field report (2026-08-09 afternoon screenshot):** the session histogram was
drawn over the final cluster of candles at the right edge, making the working
area hard to read. Engine untouched — `node indicator/test_core.js` verified
`205/205 MATCH` on this revision.

## 1. Root cause

Two defects lined up, either of which puts a histogram at the live edge:

1. **The fallback anchor was "near the last bar".** When the session-start
   timestamp failed to resolve, the code fell back to `x0 = i − 60` — sixty
   bars left of the last candle — and then drew a full histogram growing
   right from there. That is exactly the frame in the screenshot.
2. **Anchoring assumed a gapless mirror.** Timestamps were resolved to
   indexes by offset-from-the-end of the pushed-bar mirror, which is only
   correct if every chart bar was pushed. The v3 audit (A10) documented the
   residual risk: if the platform's `history.get` walk-back silently misses
   bars (platform fact Q3 — it has failed on live before), every anchor
   shifts RIGHT by the miss count. A few missed hours puts the "session
   start" anchor in the middle of the final candles.

## 2. The fix

**Stronger anchoring (primary + cross-check):**

- Every pushed bar now records its **chart index as reported by the platform
  at push time** (from `map`'s own `i`, or the walk-back's `k`), normalized
  to a fixed frame. History prepends (Q2) shift all indexes uniformly; the
  frame offset is re-measured on every draw from any already-pushed bar (the
  current bar, or the walk-back boundary bar — covering both engine models).
  Timestamp→index resolution now returns this recorded index, which stays
  correct **even when the mirror has gaps**.
- The old offset-from-the-end computation is kept as a cross-check. If the
  two disagree, the mirror is gappy: the banner shows **`[mirror desync]`**
  and the `diag=1` line carries `anchor=/base=/mirror=` details — so the
  next screenshot diagnoses itself.

**Occlusion rules (the user-visible guarantee):**

- A histogram is **never** placed relative to the last bar. If the session
  anchor cannot be resolved, histograms, VA zone, node ticks and the session
  marker are hidden; level rays and labels stay (thin, horizontal — still
  fully readable) anchored from the chart edge, and the banner explains:
  **`[anchor unresolved - profiles hidden]`**.
- When the anchor is good, right-growing session histograms are width-capped
  to stop **12 bars short of the last candle**, and are skipped entirely for
  very young sessions. The live edge — where the trader reads and navigates —
  can no longer be painted over by profile rows. (The HTF ghost mirrors LEFT,
  away from the live edge; historical session profiles sit days back.)

## 3. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 7, anchor robustness:
  7a PREPEND: back-load 700 older bars mid-session; anchor tracks the
     ground-truth index exactly; no false desync flag; no live-edge paint
  7b MISSED PUSHES: history.get blind for a 31-bar stretch (Q3); mirror
     forms a permanent gap; anchor STILL exact via recorded indexes;
     [mirror desync] shown; no live-edge paint
  7c UNRESOLVED: session start absent from the mirror; all histograms/
     zone/ticks hidden, rays anchored at the chart edge, banner explains
  plus the live-edge cap asserted on every developing-profile row
```

## 4. What to expect on the chart

- The same layout as this morning, but the current session's profile stops
  well short of the newest candles.
- If you ever see `[anchor unresolved - profiles hidden]` or
  `[mirror desync]` in the banner line, screenshot it with `diag=1` on —
  that line now contains everything needed to pin the platform behavior.
