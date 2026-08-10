# VISUAL v11 — anchor-free levels + observation-always barMin
# (community anchoring study, items 1–3)

**Scope:** `indicator/wrapper.js`, `sim_synth.js` part 21 (+7c/9a
updated), registry, `docs/reference/community/README.md`. **Engine
untouched — `node indicator/test_core.js` verified `205/205 MATCH`.**

## 1. Study item 1 — barMin from timestamps, always

`chartDescription` is now a HINT we never depend on:
- finer feeds: one below-period spacing is proof (v9.1, unchanged);
- **coarser feeds: inferred on unanimous evidence** — six identical
  deltas, exact ≥2× minute multiples — **but only when the description
  disagrees with the current period or is absent.**
- A chart with NO description at all now infers its period from data
  (sim 21a).

**The disagreement gate is an engine-safety lesson the MUST-PASS gate
taught during this PR.** The first draft allowed unanimity alone;
`sim_tradovate.js` FAILED on the real 110k-bar stream — a dead overnight
stretch printed six identical multi-minute gaps, fired a bogus coarser
reset, wiped the core mid-stream, and the wrapper's signals diverged
from the reference core. The cost asymmetry decides the design: a false
coarser reset corrupts graded engine state; a missed coarse switch only
mis-scales display slots. With the gate added, sim_tradovate passes
again (signals identical), and the v9.1 residual gap STILL closes —
after a stale episode the description disagrees with the observed
barMin by definition (sim 21b replays exactly that scenario).

## 2. Study items 2+3 — the LEVEL/ANCHORED audit and conversion

Every layer classified; every LEVEL-class layer converted to the
structurally un-mis-anchorable form: a full-width line via
`infiniteStart` whose only explicit coordinates are the live edge
(`i−1`, `i+2` — valid by construction on every frame), with the bounded
right extension ending under the label column.

**Converted (12 families):** PREV POC/VAH/VAL, HTF POC/VAH/VAL,
dPOC/dVAH/dVAL, ACCUM level, LEG, naked POCs. No resolution, no
fallback, no offscreen special-casing — a level cannot be mis-anchored
because it is not anchored. (The ACCUM pre-history disclosure moved to
the box path, which still genuinely needs the anchor.)

**Residual anchor-dependent surface (the number the study asked for):
9 layers**, each anchored because its position IS its information:
the four profile-row families (dev/session/ACCUM/HTF via plotter
payloads + Shapes fallback), session structure (medians/brackets/
key-values), the ACCUM box, node ticks, event marks (+TP/SL at the
signal bar), and the session-start marker. That is the whole remaining
risk surface, down from ~21 emitting layers.

Also: the passive **`bidx=`** diag field (prints `d.index()`) — the
community sources anchor with it and claim it fixes alignment; the next
diag screenshot tells us what it returns on a live chart at zero cost.

## 3. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS — after catching the real
                                overnight-unanimity regression (see §1)
node indicator/sim_synth.js     PASS — new part 21:
  21a  no description at all: barMin observed from a 5M feed
  21b  the v9.1 residual scenario end-to-end: stale 5M->1M episode,
       then coarse return with the description still stuck -> barMin 5
       via unanimity, no escalation
  21c  quiet 1M stretches (varied multi-minute gaps): barMin stays 1,
       zero resets
  21d  the whole level family is anchor-free full-width with live-edge
       endpoints; bidx= present in diag
  parts 7c/9a updated to the stronger invariant; parts 1–20 pass
```

## 4. Live checks

1. Levels now run the full chart width (the MTF Key Levels/PDL idiom) —
   same prices, same labels, same colors; only the line geometry changed.
2. `diag=1`: note the `bidx=` value vs `i=` on a live chart — one
   reading decides whether `d.index()` is the layout ground truth the
   community sources treat it as.
3. Queued from the study sources: the `fillStyle.opacity` +
   `ContourShapes` + grid-right-container probe (one opt-in param,
   next PR).
