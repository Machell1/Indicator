# VISUAL v9.3 — the 1M assessment gaps (ONE_MINUTE_ASSESSMENT.md)

**Scope:** `indicator/wrapper.js` (HTF banner, width-policy statement,
coarse label pitch), `sim_synth.js` part 18. **Engine untouched — `node
indicator/test_core.js` verified `205/205 MATCH`.**

## 1. HTF-on-1M — measured, then decided

Per the assessment's "measure first": on the real GCQ6 dataset, a
composite built from the last k sessions was compared against the
20-session composite at every roll from session 20 onward (n=212):

| k sessions | dPOC med / p90 / max | dVAH med / p90 / max | dVAL med / p90 / max |
|---|---|---|---|
| 2  | 86.9 / 393.5 / 950.8 | 99.0 / 317.9 / 967.3 | 145.7 / 429.8 / 1190.4 |
| 3  | 86.9 / 361.2 / 951.1 | 95.5 / 308.2 / 925.5 | 143.2 / 410.3 / 1167.3 |
| 5  | 53.8 / 341.9 / 951.1 | 72.6 / 244.9 / 718.8 | 114.7 / 363.7 / 727.9 |
| 10 | 6.2 / 328.5 / 573.8  | 40.9 / 210.5 / 598.7 | 67.6 / 268.5 / 638.8 |

(Points; GC tick = 0.1.)

**Decision: never synthesize an HTF on 1M.** The ~2 sessions loadable
under the 3000-bar ceiling misstate the 20-session levels by a **median
of ~87–146 points** — a pseudo-HTF would routinely contradict the
number the trader reads on 30M by hundreds of points, on the layer whose
whole job is big-picture context. The instance-lifetime persistence
direction fails the same test: it starts at k=2 (days of the same
drift), dies on every F5, and the platform offers no storage (registry
Q7). The assessment's third direction is the honest one, now shipped:

> `HTF: n/a - 2/5 sessions loadable here (read HTF on 30M)`

— session count live, ceiling explicit, remedy named. Not a warm-up that
will finish. If the platform's data-call timeout is ever lifted (the
one thing that would genuinely fix this), the banner self-heals.

## 2. Width policy — chosen and stated

The 30M-vs-1M difference was emergent; it is now a stated decision,
recorded at the constants in `wrapper.js`:

- **Finalized session profiles fill 85% of their day at every timeframe**
  (the MP_55396 look — consistent across 1M/5M/15M/30M).
- **The developing/current-session profile (and the v4 prev-projection)
  stay capped at ~150 one-minute bars.** Reason: rows render opaque
  (fill alpha broken — the same platform fact behind assessment item 3),
  and a day-wide developing profile at 1M would bury the live session's
  candles. Scaling it up before translucency is proven would trade item
  2 for a worse item 3.
- **Revisit trigger:** the `vaFill` live test. If the plotter honours
  opacity, row rendering can move to the plotter path, translucent
  profiles can fill the day like MT5, and both this cap and item 3
  resolve together.

## 3. Label pitch (carried §8 residual)

The coarse cluster pitch is retuned against the §8 30M frame (HTF-span
factor 0.08 → 0.12): the ACCUM label's cluster and the dPOC/PREV-POC fan
merge into one fan instead of two touching ones. Acceptance is the same
top-right stack on the next 30M frame.

## 4. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 18: a 2-session 1M-style
  run must show the explicit ceiling banner (exact text asserted), build
  no composite, and draw no HTF layers; parts 1–17 all still pass
  (17c updated for the 0.12 pitch)
```

## 5. The vaFill go-ahead (assessment item 3)

Green light — the test is safe by construction: plotter REGISTRATION has
been live since v6 (the indicator loads with it), so the untested part is
only the drawing path, and every outcome is recoverable with `vaFill=0`.
Procedure for a quiet moment:

1. `vaFill=1` in the dialog (defaults: color `#3E7E93`, opacity 18).
2. Expected if opacity is honoured: translucent VAL→VAH bands behind the
   candles of every session — candles readable through them.
3. Other outcomes, both informative: opaque bands (alpha ignored in the
   plotter too → the translucency route dies, caps stay) or nothing
   (plotter draw path inert → same conclusion). Screenshot either way;
   then `vaFill=0`.
4. If translucent: next PR moves profile row rendering onto the plotter
   path — resolving assessment item 3 properly and unlocking day-wide
   developing profiles (item 2's revisit trigger).
```
