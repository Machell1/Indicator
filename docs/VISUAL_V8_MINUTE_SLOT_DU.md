# VISUAL v8 — minute-slot du emission (field report §10)

**Scope:** `indicator/wrapper.js` (emission transform + params + probe
slot labels), `sim_synth.js` part 14, platform-facts registry update.
**Engine untouched — `node indicator/test_core.js` verified `205/205
MATCH`.** Implements §10's transform spec exactly: internal logic stays
bar-index-true; only the final `du()` emission converts.

## 1. The measured fact (now in the registry)

The v7.2 probe measured it: on a LIVE chart, `du(n)` addresses the n-th
**minute-slot** of the laid-out time axis (weekend gap compressed, future
session pre-gridded, uniform ~1 px/minute), not the n-th bar of the data
array — with the layout origin at the live session template start (`du 0`
≈ Sunday 17:00; the `du 1002` probe landed at Monday ~09:39, and the
nearer probes rendered off-screen right toward "Tuesday"). Pre-open, with
no live template, the spaces coincide — which is why every Saturday frame
aligned and the divergence began exactly at the Sunday open. Every
displacement chased in §§1–9 reduces to this one fact.

## 2. The transform

- **Architecture:** all internal logic — mirror, anchor resolution, trust
  hierarchy, guards, `emit` telemetry — is untouched and stays in
  bar-index space (they are index-true by construction and the sims prove
  them there). A single frame-scoped function converts at emission:
  every X-coordinate site now goes through `duX(v) = du(DU_T(v))`.
- **`DU_T` (index → minute-slot):** piecewise-linear through the mirror's
  (current-frame index, timestamp) pairs — exact at every pushed bar,
  time-interpolated between them (a span crossing a maintenance halt
  widens by the halt's minutes, exactly like the laid-out axis),
  extrapolated one slot per index beyond the ends (pre-gridded future,
  pre-history left). Slot = `(timestamp − origin) / 60000 / barMinutes`.
- **Origin:** the current session start (`out.dayStartTms`) — where the
  probe placed `du 0` — plus **`originShift`** (minutes, signed), the
  live-calibration knob §10 asked for. `diag=1` prints
  `tdu origin=<ts>+<shift>m`.
- **Rectangle widths transform by endpoints** (`T(x+w) − T(x)`), so
  day-spanning session boxes stay exact across halts.
- **Modes (`duTime` param):** `0` = bar-index emission (the
  Saturday-proven pre-open behavior), `1` = minute-slots, `2` = **AUTO**
  (default): minute-slots only while the chart is live (last pushed bar
  within 3 bar-periods of the wall clock). Pre-open and closed-market
  charts keep the proven index behavior automatically — the §10 "spaces
  coincide" case needs no user action. Banner shows the effective mode:
  `[t-du]` (slots) vs `[du]` (index) vs `[px]`.

## 3. Probe kept, extended for before/after

`calib=1` draws the same labeled lines; in `[t-du]` mode each label
additionally prints the **post-transform slot** it was emitted at
(`du 1002 (i-2000) slot -2878`), so the before/after verification is one
reading per §10's discipline. Expected live result after this build: the
`du=i` probe stands ON the live candle (its slot equals the live bar's
minute offset from the session open), `i−100` stands 100 minutes left,
and the session profiles/ACCUM box sit over their own candles.

## 4. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 14:
  - auto mode stays OFF on a stale (pre-open-like) chart: banner [du],
    all prior parts 1-13 run unchanged in index space
  - duTime='1' (string prop): session start emits at slot 0; a prior
    session's anchor emits at its exact (negative) timestamp offset --
    time arithmetic, not index arithmetic
  - spans stay finite/positive across the maintenance halt (endpoint
    transform)
  - the du=i probe lands at the live bar's true minute offset and probe
    labels carry the post-transform slot
  - contiguous-region coincidence: 50 bars = 50 slots exactly
  - originShift='120' moves the session start to slot -120
```

## 5. Live procedure

1. Rebuild, paste, F5. Default `duTime=2` (auto) — live chart engages
   `[t-du]` on its own; verify the banner shows it.
2. `calib=1`: the `du=i` line must stand on the live candle (the white
   LIVE CLOSE ray marks it). If it is offset by a constant number of
   minutes, set `originShift` to that number (sign per direction) — one
   knob, one reading.
3. Confirm the session profiles and ACCUM box now sit over their own
   candles, then `calib=0`.
4. Pre-open sanity (next weekend): banner should show `[du]` and the
   Saturday look should be unchanged.
