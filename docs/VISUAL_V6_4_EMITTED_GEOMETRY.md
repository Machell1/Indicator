# VISUAL v6.4 — the §6 unit audit, and what is actually at the live edge

**Scope:** `indicator/wrapper.js` consumers + banner + diag, `sim_synth.js`
part 10. **Engine untouched — `node indicator/test_core.js` verified
`205/205 MATCH`.** Build reproducibility also verified: the committed
artifact is byte-identical to a fresh `build.js` run, so the deployed code
is the code audited.

## 1. The audit you asked for (§6): every rendering consumer, line by line

Question: does any consumer hand a **bars-back** value to `du()` where an
**absolute index** belongs?

| Consumer | x source | Unit verdict |
|---|---|---|
| `dayLn`, `vaZ`, dev/prev histograms, HTF ghost, node ticks, alignTest | `x0 = idx(dayStartTms)` | absolute ✓ |
| session profiles `sp*` | `six = idx(sp.start)` | absolute ✓ |
| ACCUM box/histogram | `ia/ib = idx(accum.start/end)`; width `ib − ia` | absolute; width is a difference ✓ |
| ACCUM/LEG/naked/HTF rays | `ia` / `rayX0` / `oldAnchor()` / `rayX0 − 40` | absolute or edge-0 ✓ |
| marks, SL/TP rays | `mi = idx(mk.tMs)` | absolute ✓ |
| labels | `lx = i + 4` | absolute, at the live edge **by design** |
| bars-back values (`age()`) | diag text only | never reaches `du()` ✓ |

**Verdict: no bars-back/absolute confusion exists in any consumer.** The
`acc=2879..897` numbers are produced only inside the diag formatter and are
plain text.

## 2. So what is the "cluster at the live edge"?

Geometry from your own diag: `i=3001`, ACCUM box at absolute ~122..2104,
viewport ≈ 300 bars wide with the last candle at ~595 px. **The correctly
anchored ACCUM box is entirely off-screen LEFT.** What occupies px ~610–730
is, by design: the right-edge label column at `i+4` — including the gold
"ACCUM … [+0.28R/75% n12]" label — the developing-session profile cluster at
x0, the VA-zone dashes, the node ticks, and the gold ACCUM ray passing
through on its way from index 122. A gold label + gold ray + histogram
shapes at the live edge reads exactly like "the ACCUM cluster rendered
here", while the structure it belongs to sits 2,900 bars left of the
viewport. The near-coincidence you flagged (2879 bars-back ≈ du 2900–3050)
is the label column's position, not a unit bug.

That said, the audit lens still found **two real, reachable geometry
defects**, both fixed:

1. **Inverted-window rendering.** If `ia` resolved newer than `ib` (any
   stale/mixed frame), the box's "width" points the wrong way and the
   histogram's 10-bar minimum grows PAST the anchor. Now: box/histogram
   require `ib > ia`.
2. **Live-edge crossing for near-edge histograms.** The ACCUM and
   session-profile histograms had no live-edge width cap (only dev/prev
   did): a window ending near the live bar could legally paint rows into
   the future grid. Now capped like every other right-growing histogram.

## 3. Structural guarantees added (so this class of question closes)

- **Emitted-geometry invariant:** immediately before returning each frame,
  every chart-space rectangle and line is checked against the live bar
  (`x ≤ i+2`, including `x + width`). Anything beyond is dropped and named
  on the banner: **`[future-grid item: <keys>]`**. This guards the final
  geometry itself — independent of where any x came from, covering paths no
  audit can foresee. Text is exempt (the label column is the designed
  exception).
- **Emit telemetry:** `diag=1` now prints `emit accB@<x> accL@<x> sp@<x>` —
  the du x actually emitted for those items ("-" = not drawn). Next
  screenshot: if `emit accB@122` appears while you still see a gold box at
  the live edge, the platform is repositioning correct geometry (a new
  platform fact); if `accB@-`, the box isn't drawn at all and what you see
  is the label column + ray + dev profile.
- **Provenance labels:** when the ACCUM window sits left of the current
  session start, its right-edge label now ends with `◀ N.Nd` (window age in
  days) — the chart itself says "this level's structure is far left,
  possibly off-screen", which was the missing piece of readability behind
  both §5 and §6.

## 4. Verification

```
node indicator/build.js         wrote TraderMachell.js (byte-stable rebuild)
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 10:
  10a  fresh window ending 10 bars from the live edge: box drawn,
       histogram width-capped short of the edge, no flags
  10a2 far-left window: label carries the ◀ age suffix
  10b  poisoned resolution placing x0 at i+1: node ticks pruned by the
       emitted-geometry invariant, [future-grid item: nd…] named,
       [anchor mismatch: day…] raised by the cross-check
  10c  inverted window (ia > ib): box + histogram suppressed
  parts 5–9 all still pass
```

## 5. Next session, one reading decides it

With `diag=1`, the line now carries `acc=<ages>` **and** `emit accB@…`.
- `emit accB@122` + gold box still visibly at the live edge → platform-side
  repositioning; new platform fact, we adapt.
- `emit accB@-` (or `@122` with the box off-screen left) → v6.3/v6.4 were
  correct; the live-edge "cluster" is the label column + dev profile + ray,
  and the new `◀ 2.9d` suffix on the ACCUM label should already be making
  that legible.
- Any `[future-grid item: …]` marker → a genuinely out-of-space item was
  produced and suppressed; the key names the culprit.
