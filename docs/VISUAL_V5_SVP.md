# VISUAL v5 — Session Volume Profile layer

**Request:** find the best free "session volume profile", clone it, integrate it.
**Scope:** `indicator/wrapper.js` (display layer) + `indicator/sim_synth.js`.
**Engine gate:** `dale_core.js` untouched — `node indicator/test_core.js`
verified `205/205 MATCH` on this revision.

---

## 1. Research: what the best free SVPs are

| Tool | Platform | What makes it good | Reuse status |
|---|---|---|---|
| [F3s Session Volume Profile](https://www.tradingview.com/script/g5Y1hQ1S-F3s-Session-Volume-Profile/) (funky3s) | TradingView, open script | The most complete free SVP: **developing POC/VAH/VAL updating live** (dashed), prior-session POC/VAH/VAL locked at close (solid), HVN/LVN nodes, initial-balance rails, independently toggleable layers, CME-timezone session anchoring | Pine Script; reuse governed by TradingView House Rules |
| [Session Volume Profile — Open Source [CantoLab]](https://www.tradingview.com/script/uDRS8vr5-Session-Volume-Profile-Open-Source-CantoLab/) | TradingView, open script | Clean minimal SVP: left-aligned histogram, POC/VAH/VAL lines + labels at profile start, VA highlighting, per-period reset, toggle controls | Pine Script; TradingView House Rules |
| [SessionVolumeProfile library](https://www.tradingview.com/script/5ubxXb8z-SessionVolumeProfile/) (jmosullivan) | TradingView, open library | Developer-facing: programmatic POC/VAH/VAL, "extend prior value areas over today" drawn as **lines** (not histograms) — the canonical SVP layout convention | Pine library; House Rules |
| [LibVPrf](https://www.tradingview.com/script/t13d0hHc-LibVPrf/) | TradingView, open library | Most sophisticated math options (volume allocation models, buy/sell splitting, VA algorithms, profile merging) | Pine library; House Rules |
| Tradovate [custom-indicators](https://github.com/tradovate/custom-indicators) | Tradovate, MIT | The official framework this project already builds on; **no volume-profile indicator to clone**, but documents `d.profile()` (tick volume-at-price via the `requirements` flag) | MIT, already in use |

## 2. Why v5 integrates the feature set, not cloned code

1. **License.** The best free SVPs are TradingView open scripts. "Open" there
   means source-visible on TradingView; republishing/reuse outside TradingView
   is governed by their House Rules, not a permissive license. There is no
   Tradovate-native open-source SVP to lift. Cloning verbatim would put
   encumbered code in this repo.
2. **Platform.** They are Pine Script. Nothing runs on Tradovate's CommonJS
   module system; only the feature set and layout conventions port.
3. **Project integrity (the decisive one).** This project's profile math is
   regression-locked to the Python research harness (205/205 checkpoints) and
   the on-chart levels carry graded evidence tags. A cloned profile engine
   would compute *slightly different* POC/VAH/VAL (different binning, VA
   algorithm, volume allocation) and put two conflicting sets of levels on
   the chart — precisely what the honesty contract forbids.

So v5 implements the SVP capability natively: **the feature set of the best
free tools, computed by this project's own locked engine functions.**

Also evaluated and deliberately not used: Tradovate's `d.profile()`
(tick-accurate volume-at-price per price level). It would make rows
tick-perfect but its distribution differs from the graded bar-range binning —
the developing profile would no longer converge into the graded session
profile at the roll, recreating the two-engines problem. Candidate for a
future *verified* experiment, not for this layer.

## 3. What v5 adds

The one hallmark SVP capability the project lacked (it already had prior
levels locked + extended, per-session histograms, VA zone, naked POCs):

- **Developing session profile** (`devProfile=1`, default): the current
  session's histogram, anchored at the session start in the session's own
  box. Built from committed session bars with the **exact grid convention
  `_finalizeSession` uses** (same `buildProfile`, same `displayRows`, same
  `step = range/rows`) — at the session roll the developing profile
  converges bit-identically into the graded prior-session profile. Cached;
  recomputed only when a bar commits (zero per-tick cost).
- **dPOC / dVAH / dVAL**: teal-green dashed rays + small labels, updating
  live as the session builds (F3s's headline layer). They run through the
  existing label de-collision engine. **Display-only:** the signal machines
  consume the locked prior-session levels, never the developing ones.
- **SVP-standard layout**: with `devProfile=1`, each session box contains
  its own histogram (the prior session's profile sits in *its* box via
  `sessionProfiles`), and prior-session structure projects across today as
  rays + the dashed VA zone — the convention the jmosullivan library
  formalizes (prior value areas extend as lines, not histograms).
  `devProfile=0` restores the v4 layout (prior-session histogram projected
  at today's start) for continuity with the MT5 look.

All v4 guarantees carry over: opaque-safe solid-hex palette, robust prop
coercion (the new param is a number 0/1 spec, string-tolerant), du widths
default with px fallback, alignment self-test, banner instrumentation.

## 4. Verification on this revision

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new invariants:
  - drawn dPOC EXACTLY equals an independently recomputed profile from the
    engine's own buildProfile over the session's bars (=== on the float)
  - developing POC row straddles that POC; all dev rows inside the
    profile's true span; dVAH/dVAL rays present
  - devProfile default: no prev projection at the session start;
    devProfile='0' (string prop): v4 layout restored, no dev items
  - label de-collision holds under the forced pile-up, now 14 labels
  - carried: opaque-safe hex colors, prop-coercion torture, both engine
    models, px fallback frame
```

## 5. First-session notes

1. Expect the current session's box to fill with the teal developing
   profile after ~10 committed bars; dPOC/dVAH/dVAL rays in teal-green.
2. The white PREV POC ray and blue VAH/VAL rays are unchanged — those are
   the tradeable levels. dPOC is context (where today's acceptance is
   building relative to yesterday's).
3. Prefer the old look? `devProfile=0` in the settings dialog restores the
   v4 layout exactly.
