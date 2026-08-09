# VISUAL v6 — techniques learned from free community sources

**Request:** study how other free sources construct their code and use it to
improve ours.
**Scope:** `indicator/wrapper.js`, `indicator/tools/` dev stubs,
`indicator/sim_synth.js`. **Engine untouched — `node indicator/test_core.js`
verified `205/205 MATCH` on this revision.**

## 1. Sources studied, and their reuse status

| Source | License | What was studied |
|---|---|---|
| [sdmiami/tradovate-custom-indicators](https://github.com/sdmiami/tradovate-custom-indicators) (`barVPOC.js`, `deltaHistogram.js`) | none published (all rights reserved) — **study-only** | Custom canvas plotter as sole renderer; `d.profile()` per-bar volume-at-price; `paramSpecs.color`/`percent` in working use |
| [paidtofade/tradovate-indicators](https://github.com/paidtofade/tradovate-indicators) (`p2f-scaleZones.js`) | GPL-3 — **study-only** (incompatible with this repo) | Zone shading via one bar-wide vertical `drawLine` per bar **with a first-class `opacity` style**; `paramSpecs.enum`; session-boundary detection by time gap |
| [blakeharv/tradovate-indicators](https://github.com/blakeharv/tradovate-indicators) | has LICENSE file | Repo layout only; no volume-profile content |
| TradingView open scripts ([F3s SVP](https://www.tradingview.com/script/g5Y1hQ1S-F3s-Session-Volume-Profile/), [LibVPrf](https://www.tradingview.com/script/t13d0hHc-LibVPrf/)) | TV House Rules — **study-only** | Feature semantics: HVN/LVN prominence nodes, layer toggles, volume-allocation models |

**No code was copied from any of these.** They were read to learn platform
techniques and feature semantics; everything shipped here is original code
written against this project's own engine and conventions.

## 2. The techniques, and what they told us

1. **The custom-plotter pipeline does translucency.** Community indicators
   that need alpha do not use `graphics` items — they register
   `predef.plotters.custom(fn)` and draw with `canvas.drawLine/drawPath`,
   whose style takes a first-class `opacity` (0..1). This is a separate
   rendering path from the one where our live Bug A proved fill alpha
   broken. Zone shading is built as **one bar-wide vertical line per bar**
   (`relativeWidth: 1`), accumulated across the visible history.
2. **Plotters receive `history` as a formal argument at draw time** — a
   documented contract, unlike the `history.get`-inside-`map` path that
   failed on live (platform fact Q3).
3. **`paramSpecs.color` and `enum` work in shipping community indicators** —
   color pickers are a viable way to let the trader tune visuals without
   rebuilds (values still get our defensive coercion).
4. **`d.profile()`** gives tick-accurate per-bar volume-at-price. Already
   evaluated in v5 and deliberately not used for levels (would diverge from
   the graded binning); position unchanged.
5. Session detection by time gaps (scaleZones) is inferior to our DST-aware
   CME clock; nothing to adopt there.

## 3. What v6 ships (original implementations)

| Feature | Default | Detail |
|---|---|---|
| **Translucent value-area fill** (`vaFill`, `vaFillColor`, `vaFillOpacity`) | **OFF** | A custom canvas plotter shades VAL→VAH of every session with real opacity, via per-bar vertical lines. Each `map()` return now carries `vaLo`/`vaHi` (plain data; nothing auto-plots without a `plots` declaration — community precedent). Default off until live-verified; the plotter body is wrapped so an exception can never take the chart down. **Rollback if the indicator fails to LOAD:** delete the marked PLOTTER BLOCK and the `plotter` key in `module.exports`. |
| **HVN/LVN node ticks** (`nodes`) | ON | Computed from the locked prior-session profile. LVNs are contiguous low-volume runs under the **engine's own `stopBehindLVN` criterion** (row volume < `lvnFrac` × POC volume), edge tails excluded, deepest-first, max 4 — the ticks mark exactly where the engine sees low-volume pockets (the playbook's LVN-stop structure). HVNs are prominent local maxima ≥ 60% of POC volume, ≥ 3 rows off the POC, max 3. Quiet 6-bar ticks at the session start; dark red (LVN) / pale gold (HVN); no labels, no banner noise. |
| **Color/opacity params** | — | First `paramSpecs.color` usage (`vaFillColor`), plus `vaFillOpacity` 0–100 (clamped). Both defensively coerced like every prop since v4. |

## 4. Verification on this revision

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new invariants:
  - every LVN tick satisfies the engine stop criterion against the real
    profile volumes; every HVN tick >= 60% of POC volume; caps enforced
  - plotter: exactly one custom plotter registered; zero draws with
    vaFill off; correct draw count/color/VA span with string props;
    opacity clamped to (0,1]; a throwing history cannot escape
  - map() per-bar output carries vaLo/vaHi for the plotter
  - all v4/v5 invariants carried (opaque-safe hex items, prop torture,
    dPOC exactness, label de-collision, both engine models)
```

## 5. Live checks for the new pieces

1. First and most important: the indicator must **load** with the plotter
   registered (registration itself is the one thing Node cannot prove).
   If it doesn't, apply the rollback note above and report — that becomes
   a new platform fact.
2. `vaFill=1`: value areas of all sessions shade translucently; rows stay
   visible through the fill. If the fill renders opaque here too, that is
   also a finding worth recording (then `vaFill=0` and we drop the layer).
3. `nodes=1` (default): up to 4 dark-red + 3 pale-gold ticks at the session
   start; they should sit exactly on thin/thick shelves of the previous
   session's histogram (compare against the profile in its own box).
