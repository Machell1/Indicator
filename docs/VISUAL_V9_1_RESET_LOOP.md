# VISUAL v9.1 — the 5M→1M reset loop (spec §5)

**Scope:** `indicator/wrapper.js` (`_checkTimeframe`/`_reset`/`init`
override + deep backfill + banner/diag), `sim_synth.js` part 16, registry.
**Engine untouched — `node indicator/test_core.js` verified `205/205
MATCH`.**

## 1. The failure, as measured (§5)

Your diag froze the mechanism perfectly: after the 5M→1M switch,
`chartDescription` stayed **stale at `MinuteBar/5`**, so v9's reset
re-read `barMin=5` on a 1-minute chart; the finer-spacing detector then
compared 60,000 ms bars against a stale 300,000 ms period — true on every
bar — so `init()` ran per bar, the mirror was wiped before it could grow
(`i=3 mirror=3`), every layer suppressed, reloading banner forever, F5
the only recovery. The detector meant to catch the switch became the
trap. The staleness itself is now a registry platform fact.

## 2. The fix (exactly the §5 direction)

1. **Derive the period from the data, never from the stale description.**
   On an observation-triggered reset, the new `barMin` is inferred from
   observed inter-bar spacing and passed into `init(bmOverride)` — the
   description is not consulted in that branch (it is stale by
   definition). Since a spacing BELOW the known period is impossible on a
   legitimate feed (bars are period-aligned; gaps only stretch spacing),
   **one finer bar is proof** — recovery fires on the first new 1M bar,
   not after a dead minute.
2. **Distrust memory.** The stale description value is remembered
   (`staleCd`) and the description-based detector is suppressed while the
   platform keeps reporting it; the moment the description re-syncs with
   reality, trust is restored (and later proper switches fire normally —
   sim-verified).
3. **Idempotent, rate-limited resets + escalation.** Resets are capped at
   3 per rolling minute. Sustained flapping stops resetting entirely,
   keeps the indicator ALIVE at its current settings, and shows
   **`[reset loop - press F5]`** — the trader gets the remedy instead of
   a dead chart. `diag` now prints `rst=<count>` and `staleCd=<n>`.
4. **Deep backfill after a reset (found by the new sim).** The walk-back's
   500-bar steady-state cap would leave a post-reset core with under one
   session of context (no PREV, no HTF) until F5. A reset frame now allows
   a one-time backfill of up to 6,000 bars, so the full loaded history
   rebuilds in the first frames after the switch.

Residual known gap (documented in the registry): if the description never
re-syncs AND the trader returns to exactly the stale timeframe, spacing
looks gap-like and cannot prove the switch — visible as a `tf=` vs
`barMin=` mismatch in diag. The 15M/30M re-run will show whether the
description staleness is one-shot or persistent.

## 3. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 16, four phases:
  1  healthy 5M chart (description correct)
  2  the live failure: 1-minute re-feed with the description STALE at
     MinuteBar/5 -> exactly ONE reset, barMin derived as 1 from spacing,
     mirror regrows past 50 at 1-minute spacing, layers back (dayLn),
     banners clear, diag shows tf=MinuteBar/5 barMin=1 staleCd=5
  3  description re-syncs -> distrust cleared; a later PROPER switch to
     5M fires the description detector again
  4  pathological description flapping -> escalation after the rate
     limit: [reset loop - press F5] shown, indicator alive (mirror
     keeps growing)
  parts 1–15 all still pass (15b's proper-switch path unchanged)
```

## 4. Next live steps (queued per §5)

1. Re-run the four-way toggle (1M→5M→15M→30M→1M, `diag=1`): every switch
   should show one brief reloading marker, `rst=` incrementing by one,
   `barMin=` tracking the chart, and — on downswitches — recovery within
   one bar even if `tf=` stays stale.
2. Profile-width scaling at 5M+ (sessions tiling into a wall) stays
   queued: it needs the re-run screenshots to tune against, and it is
   cosmetic (MP_SPAN_FILL / per-timeframe fill fraction is the knob).
