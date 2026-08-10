# TraderMachell — Tradovate Custom Indicator: v3 Visual Layer (Audit + Overhaul)

> **2026-08-09 update:** the embedded sources below snapshot **v3**. After the
> first live session (see `FIELD_REPORT.md`), the visual layer was revised to
> **v4** — the repo's `indicator/` directory is the source of truth, and
> `docs/VISUAL_V4.md` documents the changes. **§4 below remains the living
> platform-facts registry and has been updated with the live findings.**

**From: Cursor (AI code review) — response to the 2026-08-09 review brief**
**For: the TraderMachell project (gold futures volume-profile trading system)**
**Date: 2026-08-09**

This document is the updated version of the review brief. It contains the audit
verdict, what was changed and why, a live-chart verification checklist, and the
complete updated source. **`dale_core.js` is byte-identical to the version you
sent** — every change is in the display layer (`wrapper.js`) plus one new
CSV-free test (`sim_synth.js`). `test_core.js` will keep printing `205/205
MATCH`; nothing it measures was touched.

---

## 0. Audit verdict — what was wrong, what changed

The engine and the anchoring architecture (timestamps + `tmsList` mirror) are
sound. The visual layer had two outright rendering bugs that plausibly explain
most of the "far from the best" verdict, plus the four defects you listed.
Everything below is fixed in the `wrapper.js` in §6.

| # | Severity | Finding | Fix |
|---|---|---|---|
| A1 | **High** | **Right-edge labels rendered on top of the candles.** `txt()` defaulted to `textAlignment: "leftMiddle"`, and your own platform facts (§4) record that `leftMiddle` extends text **LEFT** of the anchor point. Every level label was anchored at `lastBar + 4` and therefore grew leftward, overprinting the most recent price action. | Labels default to `rightMiddle` and extend right into the empty margin. |
| A2 | **High** | **The HTF composite ghost histogram was drawn with negative pixel widths** (`width: px(frac × max × dir)` with `dir = −1`). Negative-width rectangles are not in the proven-to-render set; the ghost plausibly never rendered at all. | In the new du-width mode the mirror is drawn honestly: left-anchored at `x0 − w` with positive width. In the px fallback mode (where a leftward offset is inexpressible without mixed-unit `op()`, which is proven broken on X) the ghost is skipped instead of silently emitting unprovable primitives; HTF rays and labels always draw. |
| A3 | Medium | **Histogram row pitch was re-estimated** from the mean gap between row prices (× 0.85), although `displayRows` already carries the exact pitch per row (`r.h = group × step`). The estimate is fragile (uneven top group, single-row profiles) and could misplace every row by a sub-row offset — your defect 2. | Rows now use `r.h` directly. Each row tiles its true price span `[price − h/2, price + h/2]` with a 8% hairline gap (`rowFill: 0.92`). |
| A4 | High | **No label de-collision** (your defect 3): labels of levels within a few ticks landed on the same pixels. | All right-edge labels go through a layout pass: labels within `0.25 × ATR` of each other form a cluster, are ordered by price, and fan around the cluster midpoint at a fixed 15 px pitch. Two labels can never overprint, at any zoom. Verified in `sim_synth.js` with a forced frame of 11 labels packed inside 0.3 × ATR. |
| A5 | Medium | **Row widths were fixed pixel lengths** (your defect 4): profiles didn't scale with the chart. | Default mode sizes rows in **du (bar-index) units** — `scaledWidths=true` — so profiles stretch and shrink with the chart exactly like the reference software. Caveat: du-width rectangles are plausible but **not yet live-verified**; the `scaledWidths=false` param restores the empirically proven px mode wholesale (one toggle, no rebuild). |
| A6 | Medium | **The Rectangle y-anchor convention was unverified and unfalsifiable on screen** (your defect 2 asked for a self-test). | The anchor is now a single constant, `RECT_Y_ANCHOR = "bottom"`, consumed by the only two rectangle constructors in the file (`vrect`/`pxrect`). The new `alignTest=true` param draws one magenta row centered on PREV POC **through the same code path as every histogram row**; the white POC ray must bisect it. If the row sits entirely above the ray, the platform is top-anchored: flip the constant to `"top"`, rebuild, and every rectangle in the indicator is corrected at once. |
| A7 | Low | **Mark noise on busy days** (your defect 5): "ABSORPTION" was stamped as text on every churn bar of every retained day. | Absorption bars are now small orange ◆ diamonds, current session only; only the most recent one gets the "ABSORPTION" text. Signals from prior sessions shrink to bare arrows (`showHistory=true` restores short labels). Flow-quit stamps are current-session only. Evidence tags on live signals are verbatim and untouched. |
| A8 | Low | **Naked-POC graphics were keyed by list position** (`nk0`, `nk1`…). When a ray gets tested and the list shifts, key `nk1` silently becomes a different level — "stable keys" in name only. | Keyed by the owning session's end timestamp (`nk<endTms>`), which is stable for the life of the level. |
| A9 | Low | Banner lines moved around depending on which flags were active (HTF context jumped between y=72 and y=90). | Three fixed line slots: status / levels / context+warnings. Nothing jumps. |
| A10 | Note | **Time anchoring** (your defect 1): the `tmsList` mirror and `_idxOf` offset-from-the-end resolution are correct — reviewed line by line, and re-verified under both engine models by `sim_tradovate.js`'s structure and the new `sim_synth.js`. One residual assumption is documented in the code: `endIdx = i − 1` for an uncommitted developing bar presumes the walk-back committed everything up to `i − 1`; if `history.get` fails at draw time (your Q3) *and* a bar was missed, anchors would shift by the miss count until the next commit. No code change — but the new **session-start marker line** (dashed vertical at the day anchor) makes any wrong anchor visible at a glance on live data, which is the confirmation you said you never had. |
| A11 | Polish | Value area was only readable by comparing row brightness. | A whisper-alpha **value-area band** (VAL→VAH, from session start to the current bar) makes value readable instantly. du mode only. |
| A12 | Note | `displayRows`' final (possibly partial) group can overhang the session high by less than one group height. The exact-edge case is already clamped in core. | Left as-is — fixing the partial-group case would mean touching `dale_core.js` for a sub-row cosmetic, and the brief locks the core. Documented here instead. |

**Not changed, deliberately:** `dale_core.js` (byte-identical), `build.js`,
`test_core.js`, `sim_tradovate.js`, the commit pipeline (`_pushEntity`,
walk-back, `lastPushedMs`), all signal machines, all evidence tags, the status
banner concept, and the honesty-box disclosures.

## 1. What this project is

TraderMachell is a custom JavaScript indicator for the **Tradovate web
platform** (pasted into its built-in Code Editor). It implements Trader Dale's
volume-profile trading model, backed by a real backtesting research program:

- Profiles are built from **real traded futures volume** (session
  volume-at-price histograms).
- The core levels: **prior-session POC / VAH / VAL** (70% value area), a
  **20-session HTF composite** profile, **accumulation-rotation levels**,
  **naked POC rays** (untested old session POCs extended right until price
  trades through them), and trade signals (entry / SL / TP) from a state
  machine.
- Every rule carries an **evidence grade** from backtests on 86 liquid GCQ6
  sessions of real exchange volume:
  - Prior-POC retest + absorption→initiative entry + reaction stop: **+0.40R,
    80% win, n=10** (the flagship)
  - Accumulation retest: **+0.28R, 75% win, n=12** (CI excludes zero)
  - Leg-cluster retest: **untested (0 completions)** — labeled `[untested]` on
    chart
  - HTF alignment: contradictory evidence — info tag only, never a gate
- The on-chart text tags quoting these numbers are **contractual honesty** —
  they must never be changed to claim more than the backtest showed. (v3
  preserves every tag verbatim.)

## 2. The visual overhaul — requirement status

The owner's verdict was: *"visual displays of the chart are far from the best.
I want to see a perfectly aligned histogram with levels, well labeled areas so
it's easy to read at a glance. I need my indicator to be professional looking
and correctly aligned to our winning strategy."* Status per requirement:

1. **Perfect price alignment — done, with an on-screen proof.** Rows tile
   their exact core-computed price spans (A3). The anchor convention is one
   constant with a self-test that makes any residual misalignment visible and
   provable on screen (A6). The top row can no longer overhang the session
   high by more than a partial display group (see A12).
2. **Perfect time anchoring — verified in review + made falsifiable.** The
   timestamp→index resolution is correct under both engine models (A10); the
   new session-start marker makes the anchor itself visible so the first live
   frame confirms or refutes it at a glance.
3. **Well-labeled, glanceable — done.** Labels extend right of the last bar
   into empty margin (A1) and can no longer collide (A4). Value area reads
   instantly via the band + brighter VA rows (A11). POC row is unmistakable
   gold; PREV POC ray stays white and 3 px. The status banner is kept and
   stabilized (A9).
4. **Professional look — done.** One palette block, three font roles, muted
   historical sessions, whisper-alpha fills, diamonds instead of text stamps,
   fixed banner slots. Reference look (Dale's software): teal left-anchored
   histograms behind candles, brighter value area, standout POC row, red naked
   POC rays, session boxes — all present.
5. **Engine semantics untouched — guaranteed.** `dale_core.js` is
   byte-identical; `test_core.js` and `sim_tradovate.js` were not modified.

New parameters (all runtime toggles, no rebuild):

| Param | Default | Meaning |
|---|---|---|
| `htfSessions` | 20 | unchanged |
| `scaledWidths` | true | du-width rows that scale with zoom; set false for the proven px mode |
| `showHistory` | false | label signals from prior sessions (arrows always draw) |
| `alignTest` | false | one-time Rectangle y-anchor self-test row |

## 3. Architecture

```
dale_core.js   — platform-independent engine (sessions, profiles, levels,
                 signal state machines). REGRESSION-LOCKED. Byte-identical
                 to the reviewed version.
wrapper.js     — Tradovate shell + ALL rendering. Overhauled (v3).
build.js       — splices core into wrapper -> TraderMachell.js (the single
                 file pasted into Tradovate's Indicator Editor). Never edit
                 TraderMachell.js by hand.
test_core.js   — Node regression test: streams 110k bars of real GCQ6 CSV,
                 requires bit-identical POC/VAH/VAL vs the Python harness
                 dump (levels_py.json). MUST PASS after any change.
sim_tradovate.js — Node simulation of the platform runtime: full history
                 replay + developing-bar re-entry under BOTH candidate
                 live-engine models (Q6). MUST PASS after any change.
sim_synth.js   — NEW: CSV-free rendering-invariant sim on deterministic
                 synthetic sessions (both engine models, both width modes,
                 plus a forced worst-case frame: 11 labels packed within
                 0.3 ATR, fabricated signal/absorption/flow-quit marks).
                 Anyone can run it; it does not replace the two above.
tools/         — NEW: Node-only dev stubs of the platform's ./tools modules
                 (predef/meta/graphics) so the sims can load the built
                 artifact. Never pasted into Tradovate.
```

Run: `node build.js && node test_core.js && node sim_tradovate.js && node sim_synth.js`
(Data files `../data_tv/TV_GCQ6_1min.csv` and `levels_py.json` are on the
owner's machine; `sim_synth.js` is the one that runs anywhere.)

Verified in this pass (no dataset available here, per the brief's fallback
instruction — core untouched, changes display-only):

```
node --check  on every file                    OK
node build.js                                  wrote TraderMachell.js (59029 bytes)
node sim_synth.js                              RESULT: PASS
  part2 forced frame:  58 items, 11 labels, 10 fanned (1 at cluster center)
  part3 px-fallback:   39 items
  16,560 bars, models A+B, no exceptions, model B not frozen,
  unique keys, all Text styled, no mixed-unit X coords, no negative
  widths, POC row straddles exact POC, VA band spans exactly VAL..VAH,
  HTF ghost never crosses right of the session start, zero label
  collisions.
```

Owner must additionally run `test_core.js` (expect `205/205 MATCH`) and
`sim_tradovate.js` (expect `PASS (both engine models)`) before pasting — those
exercise the real dataset. Since `dale_core.js` and the commit pipeline are
unchanged, both are expected to pass unmodified.

## 4. Platform facts — HARD-WON, verified on the live platform. Respect all of them.

(Unchanged from the previous brief; v3 was built against these.)

- **Module contract**: CommonJS. `module.exports = { name, description, calculator, inputType: 'bars', areaChoice: 'overlay', tags, params }`. Calculator = ES6 class, `init()` + `map(d, i, history)`; `this.props/contractInfo/chartDescription` are assigned by the app. Only `./tools/*` and `lodash` are requirable.
- **Bar data**: `d.timestamp() open() high() low() close() volume() offerVolume() bidVolume()`; undocumented but real: `d.index() isLast() isComplete() tradeDate() ticks()`. Delta = `offerVolume() - bidVolume()` (executed at ask minus at bid). NOTE: backtest grades were measured on upVolume−downVolume (corr 0.87, 24% identical) — disclosed in banner, do not remove that disclosure.
- **Graphics** (only meaningful on `d.isLast()`, `global: true` + stable keys):
  - **PROVEN to render**: `Shapes` with `Rectangle` primitives — `position {x: du(barIndex), y: du(price)}`, `size {width: px(N), height: du(priceSpan)}`, `fillStyle {color: ...}`; `LineSegments` with `Line {a, b, infiniteEnd}` in pure du coords + `lineStyle {lineWidth, color, lineStyle: 1..5}`; `Text` with explicit `style {fontSize, fontWeight, fill}` (misses = invisible), `textAlignment` (note: `leftMiddle` extends text LEFT of the point; `rightMiddle` extends RIGHT), frame-pinning via `origin {cs:'frame', h:'left', v:'top'}` + px coords.
  - **PROVEN to render (live 2026-08-09)**: `size.width` in **du units** on Rectangles — the v3 rows in the bug screenshot are du-width rows and tiled perfectly (the VA band that also drew is strictly duMode-gated, so duMode provably ran). `scaledWidths=1` is now the default; `0` restores the px pattern.
  - **OBSERVED NOT to render**: mixed-unit `op(du, '+', px)` expressions on the X axis of Line endpoints; `opacity` property inside `lineStyle` (kills the group).
  - **OBSERVED BROKEN (live 2026-08-09)**: **alpha in `fillStyle.color` is NOT honored** — v3's `rgba(…,0.07)` VA band rendered as a solid opaque slab (`docs/bug/live_bug_opaque_va_band_2026-08-09.png`). Treat ALL fills as fully opaque; use solid hex colors tuned for the dark theme; never stack fills that must stay distinguishable. Enforced by `sim_synth.js` since v4.
  - **PROVEN COUNTER-CASE (live 2026-08-10)**: **the custom canvas-plotter pipeline does REAL alpha compositing** — `canvas.drawLine` with a first-class `opacity` style rendered a translucent VA band with every candle readable through it (verified at opacity 80, production 14). The two rendering pipelines genuinely differ, exactly as the v6 community research predicted: graphics-items fills are opaque, plotter strokes composite. Consequence: anything that must sit OVER candles without hiding them belongs on the plotter path (v10 moved the developing profile's rows there). Calibration: 14 = comfortable band on the dark theme, 18 was ambiguous, 80 = the "is it drawing at all?" diagnostic probe.
  - **PROP DELIVERY MODEL (confirmed live 2026-08-09 evening session, supersedes the narrower bool-props fact from the afternoon)**: `period` spec values always deliver (`htfSessions=number:20`). `number` and `color` spec values are **NOT delivered while they sit at spec defaults** (they arrive `undefined`); a value the user actively CHANGES in the dialog IS delivered and persists across F5. Consequence: code defaults are the shipped behavior for untouched params — keep them equal to the intended defaults, coerce defensively (`true/'true'/1/'1'/…`), and never read a prop without a fallback. `diag=1` prints raw prop delivery on the banner.
  - **BARS-TO-LOAD LIMIT (live 2026-08-09)**: the dialog accepts up to 9000, but ~9000 makes the indicator's data call exceed the platform's ~3s timeout and NOTHING loads (not even the banner). 3000 loads reliably and covers a full prior session; treat >3000 as unusable until proven otherwise.
  - **LIVE RE-INDEXING (live 2026-08-09 evening)**: on a live chart the bar array can be trimmed/re-indexed between an indicator's map calls with no observable rebase event (old anchors' stored indexes went stale by 150–400 slots while `base=0`). Anchor resolution must not assume stored per-bar indexes stay valid; see the trust hierarchy in `wrapper.js` `_idxOf` (tail-offset trusted unless the mirror is known-gapped, overshoot suppression, banner flags).
  - **NO MULTI-TIMEFRAME SERIES API (verified 2026-08-10)**: indicators consume only the chart's own bar series via `map(d,i,history)`; there is no secondary-series/request-another-timeframe input (community "MTF" indicators aggregate the chart's finer bars upward, which cannot produce a 1-min basis on a coarser chart). The only extra data channel remains per-bar tick volume-at-price via `d.profile()` (`requirements`), rejected for graded levels (binning ≠ the graded harness). Consequence: graded levels are timeframe-resolution-dependent → constrain-and-disclose (`*` marks on coarse-bin level labels, banner CAUTION, 1M = graded basis).
  - **INDICATOR STATE SURVIVES TIMEFRAME CHANGES (community-confirmed + live 2026-08-10)**: graphics-module indicators keep stale state/values across a chart timeframe change (until re-save/re-add). A surviving mirror carries (index, timestamp) pairs at the OLD bar spacing, displacing every t-du emission by the timeframe ratio. Consequence: runtime timeframe-change detection with a full self-reset is mandatory (`wrapper.js` `_checkTimeframe`; `[timeframe changed - reloading]` while the mirror refills).
  - **`chartDescription` CAN STAY STALE AFTER A TIMEFRAME CHANGE (live-proven 2026-08-10, 5M→1M)**: after switching to a 1-minute chart, `chartDescription` still reported `MinuteBar/5` indefinitely. Any reset that re-reads it re-poisons itself (v9's infinite reset loop: init every bar, mirror wiped at `i=3 mirror=3`, chart dead until F5). Consequence: an observation-triggered reset must derive the new period FROM OBSERVED BAR SPACING (a spacing below the known period is impossible on a legitimate feed, so one finer bar is proof), remember and suppress the distrusted description value until it re-syncs, rate-limit resets, and escalate sustained flapping to `[reset loop - press F5]` while staying alive. ~~Residual known gap: a coarse re-switch to exactly the stale value while the description never re-syncs is undetectable by spacing.~~ **Closed in v11** (community anchoring study): coarser feeds are inferred on unanimous evidence (six identical deltas, exact ≥2× minute multiples) — but ONLY when the description disagrees with the current period or is absent. The disagreement gate is engine-safety, learned from a MUST-PASS sim_tradovate failure: real overnight data can print six identical multi-minute gaps, and a false coarser reset wipes graded engine state mid-stream, while a missed coarse switch only mis-scales display slots. `barMin` is now observation-authoritative in both directions; `chartDescription` is a hint we never depend on.
  - **du IS MINUTE-SLOTS ON A LIVE CHART (measured, v7.2 calibration probe, 2026-08-09 21:41 CDT)**: on a live chart, `du(n)` addresses the n-th MINUTE-SLOT of the laid-out time axis (weekend gap compressed, future session pre-gridded; uniform ~1 px/minute; layout origin ≈ the live session template start, where du 0 sits) — NOT the n-th bar of the data array. Pre-open, with no live template laid out, the two spaces coincide and du behaves as bar indexes (every Saturday frame). This one fact explains every anchor displacement observed on 2026-08-09. Consequence: internal logic stays bar-index-true and ONLY the final du() emission converts to timestamp-derived minute offsets (`wrapper.js` `duX`/`_slotOf`; `duTime` param: 0=index, 1=slots, 2=auto-live; `originShift` calibrates; `calib=1` probes verify).
- **Q1 — zoom buttons change aggregation**: the chart's − / + buttons silently switch 1m→5m→…→1h and reset the indicator. History is loaded by PANNING left, not zooming.
- **Q2 — history back-loading PREPENDS bars**: every absolute bar index shifts. NEVER store bar indexes across map calls. Current solution: store timestamps; resolve to indexes at draw time against `this.tmsList` (a mirror of pushed bars) by offset-from-the-end.
- **Q3 — `history.get(k)` proved unreliable at draw time** on the live platform (all probes failed once, degrading anchors to the last bar). That is why the tmsList mirror exists. Do not reintroduce `history.get` for anchoring.
- **Q4 — closed-market repaint**: with no live ticks, graphics often don't paint after a reload until the user interacts (opening/closing a chart panel). Live ticks make it continuous. No code fix known; don't chase it.
- **Q5 — code reload**: saving in the editor does NOT hot-reload the chart instance; a full page refresh (F5) is required.
- **Q6 — live commit model is undocumented**: the developing bar re-runs `map()` with calculator state rolled back to the last closed bar; whether a closed bar is ever re-mapped with `isComplete()===true` is unknown. The wrapper commits bars via BOTH paths (walk-back over not-yet-pushed closed bars + direct push when complete), idempotent via `lastPushedMs`. `sim_tradovate.js` and `sim_synth.js` test both models. Preserve this.
- **Q7 — no alerts, no network, no storage** from custom indicators. The indicator draws; alerting lives on the MT5 twin.
- **Q8 — sandboxed cross-origin iframe**: indicator console output is not reachable from the page console; debugging is by rendering or by the Node sim.

## 5. Live verification checklist (first session on real data)

The one thing this pass cannot do is look at the live chart. Do this once:

1. `node build.js && node test_core.js && node sim_tradovate.js && node sim_synth.js`
   — all four must pass (`205/205 MATCH` included).
2. Paste `TraderMachell.js` into the Indicator Editor, save, **F5** (Q5).
3. **Anchor check (defect 1):** the dashed gray vertical line must sit on the
   session's first bar (the first bar at/after 17:00 New York). If it doesn't,
   that frame is the reproduction we've been missing — note the bar time and
   the line's position.
4. **Row alignment check (defect 2):** set `alignTest=true`. The white PREV
   POC ray must bisect the magenta row.
   - Row straddles the ray → convention confirmed, set `alignTest=false`, done.
   - Row entirely ABOVE the ray → platform anchors rectangles at the top edge:
     set `RECT_Y_ANCHOR = "top"` in wrapper.js (one line), rebuild, repeat.
5. **Width-mode check:** if histograms/VA band don't render at all, du-width
   rectangles failed on live → set `scaledWidths=false` (proven px mode) and
   record the fact in §4 (change "UNVERIFIED" to "OBSERVED NOT to render").
6. **Label check (defect 3):** labels extend RIGHT of the last bar; when
   levels bunch, labels stack at a fixed pitch instead of overprinting.
7. Remember Q4: with the market closed, poke the chart (open/close a panel)
   before judging whether anything renders.

## 6. Source code follows

Everything below is the complete, current source. `TraderMachell.js` (the
built artifact actually pasted into Tradovate) is exactly `build.js` applied
to `dale_core.js` + `wrapper.js`; it is included last for reference —
regenerate it, never hand-edit it. `dale_core.js`, `build.js`, `test_core.js`
and `sim_tradovate.js` are reproduced unchanged from the previous brief.

---

## FILE: dale_core.js (UNCHANGED — regression-locked)

```javascript
/*
 * dale_core.js -- platform-independent core of the TraderDalePOC model,
 * ported from TraderDalePOC.mq5 v5.11 + the Python research harness
 * (dale_tv.py / dale_of2.py / dale_v5.py).
 *
 * Everything here is pure JS with no Tradovate API dependency, so the exact
 * same code can be (a) regression-tested in Node against the Python harness
 * on the GCQ6 dataset, and (b) wrapped in a Tradovate custom-indicator
 * module. Bars stream in one at a time (no lookahead).
 *
 * Bar shape: { tMs, o, h, l, c, vol, delta }
 *   tMs   = bar START time, UTC milliseconds
 *   vol   = real traded volume (d.volume() on Tradovate)
 *   delta = on Tradovate: offerVolume() - bidVolume(). DISCLOSURE: the
 *           backtest grades below were measured on upVolume - downVolume
 *           (the market-data API's uptick/downtick split), which the
 *           indicator runtime does not expose. On the test data the two
 *           correlate 0.87 and match exactly on 24% of bars -- a close
 *           cousin, not the same number. Only the prior-POC signature and
 *           flow-quit consume delta; profiles/levels are delta-free.
 *
 * Grades carried from the backtests (GCQ6 real volume, 86 sessions):
 *   prior-POC + signature + reaction stop : +0.40R, 80% win, n=10  [tested]
 *   ACCUM rotation retest                 : +0.28R, 75% win, n=12  [tested]
 *   LEG cluster retest                    : 0 completions          [untested]
 *   HTF alignment                         : contradictory -> tag only
 */

'use strict';

// ---- defaults (mirror the v5.11 inputs) ---------------------------------
const CFG = {
  rows: 80,            // price rows per profile
  vaPct: 0.70,         // value area
  priorDays: 10,       // prior POCs scanned for targets
  moveAwayATR: 1.0,    // arming distance
  flipBufATR: 0.15,    // close beyond POC = side flip
  lvnFrac: 0.30,       // LVN threshold vs POC row volume
  tpFrontATR: 0.15,    // front-run the target
  sigBars: 15,         // bars after touch to find the signature
  initBars: 5,         // initiative must follow absorption within N bars
  htfSessions: 20,     // sessions merged into the big picture
  legPivot: 12,        // pivot strength
  legMinATR: 0.75,     // min leg size (2.0 was unreachable in backtest)
  legLookback: 600,    // bars scanned for the leg
  accumLookback: 2880, // bars scanned for rotations (2 days)
  accumMinBars: 30,    // min rotation length
  accumMaxRangeATR: 1.5,
  accumBreakATR: 1.0,
  atrWindow: 420,      // 1-min bars ~ ATR(M30,14) horizon
  nyStartHour: 9,      // signal window, New York
  nyEndHour: 11,
  barMinutes: 1,       // chart bar size; scales the ATR factor + session mins
  liquidMinVol: 2000,  // prior session must have traded this to be trusted
  liquidMinBars: 120,  // ...and have this many bars (harness liquidity gate)
  sigStatWindow: 120,  // trailing bars for signature/flow-quit vol+range stats.
  // CALIBRATION NOTE: the backtest computed these medians over the whole
  // session (overnight included). Live+causal that made absorption
  // undetectable during NY hours (overnight medians are tiny), so the port
  // measures churn against the trailing ~2 hours instead -- same concept,
  // locally adaptive, consistent with the MT5 proxy. Disclosed in the banner.
};

// ---- New York time (US DST rule, no Intl dependency) --------------------
// DST: second Sunday of March 07:00 UTC -> first Sunday of November 06:00 UTC.
function nthSundayUtcMs(year, monthIdx, nth) {
  const first = Date.UTC(year, monthIdx, 1);
  const dow = new Date(first).getUTCDay();
  const firstSunday = 1 + ((7 - dow) % 7);
  return Date.UTC(year, monthIdx, firstSunday + 7 * (nth - 1));
}
function nyOffsetHours(tMs) {
  const y = new Date(tMs).getUTCFullYear();
  const dstStart = nthSundayUtcMs(y, 2, 2) + 7 * 3600e3;  // 2nd Sun Mar, 07:00 UTC
  const dstEnd = nthSundayUtcMs(y, 10, 1) + 6 * 3600e3;   // 1st Sun Nov, 06:00 UTC
  return (tMs >= dstStart && tMs < dstEnd) ? -4 : -5;
}
function nyParts(tMs) {
  const off = nyOffsetHours(tMs);
  const d = new Date(tMs + off * 3600e3);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    hour: d.getUTCHours(), dayMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  };
}
// CME session day: rolls at 17:00 New York. Returns "YYYY-MM-DD".
function sessionKey(tMs) {
  const p = nyParts(tMs);
  let dayMs = p.dayMs;
  if (p.hour >= 17) dayMs += 86400e3;
  const d = new Date(dayMs);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}
function inNyWindow(tMs, cfg) {
  const h = nyParts(tMs).hour;
  return h >= cfg.nyStartHour && h < cfg.nyEndHour;
}

// exact floor division matching CPython's float `//` (float_divmod), so bin
// boundaries land identically to the research harness. The final half-step
// correction is CPython's: (x - fmod) / y is mathematically an exact
// multiple of y, so if float rounding left div just under the integer,
// snap up to it.
function floorDiv(x, y) {
  let mod = x % y;                      // JS % on doubles = C fmod (exact)
  let div = (x - mod) / y;
  if (mod !== 0 && ((y < 0) !== (mod < 0))) { mod += y; div -= 1.0; }
  if (div !== 0) {
    const fl = Math.floor(div);
    return (div - fl > 0.5) ? fl + 1 : fl;
  }
  return 0;
}

// ---- volume profile (exact mirror of dale_tv.build_profile) -------------
function buildProfile(bars, step) {
  if (!bars.length || step <= 0 || !Number.isFinite(step)) return null;
  let lo = Infinity, hiAll = -Infinity;
  for (const b of bars) { if (b.l < lo) lo = b.l; if (b.h > hiAll) hiAll = b.h; }
  // degenerate-step guard: a near-zero ATR (flat overnight bars) can make the
  // grid explode; a real profile is ~80-160 rows, so thousands = garbage in
  if ((hiAll - lo) / step > 5000) return null;
  const gridLo = lo - 40 * step;
  const vol = new Map();
  let total = 0;
  for (const b of bars) {
    const a = floorDiv(b.l - gridLo, step);
    const z = floorDiv(b.h - gridLo, step);
    const share = z >= a ? b.vol / (z - a + 1) : b.vol;
    for (let k = a; k <= z; k++) vol.set(k, (vol.get(k) || 0) + share);
    total += b.vol;
  }
  if (!vol.size || total <= 0) return null;
  let pocRow = null, pocV = -1;
  for (const [k, v] of vol) if (v > pocV) { pocV = v; pocRow = k; }
  const poc = gridLo + (pocRow + 0.5) * step;
  const need = total * CFG.vaPct;
  let acc = vol.get(pocRow), up = pocRow, dn = pocRow;
  while (acc < need) {
    const a = vol.get(up + 1) || 0, b = vol.get(dn - 1) || 0;
    if (a <= 0 && b <= 0) break;
    if (a >= b) { up += 1; acc += a; } else { dn -= 1; acc += b; }
  }
  return {
    lo: gridLo, step, poc, pocRow,
    vah: gridLo + (up + 1) * step, val: gridLo + dn * step, vol,
  };
}

function stopBehindLVN(prof, forLong, atr) {
  const pv = prof.vol.get(prof.pocRow) || 0;
  const { lo, step, vol } = prof;
  if (forLong) {
    const k0 = floorDiv(prof.val - lo, step);
    for (let k = k0 - 1; k > k0 - 60; k--)
      if ((vol.get(k) || 0) < CFG.lvnFrac * pv) return lo + k * step - 0.10 * atr;
    return prof.val - 0.60 * atr;
  }
  // audit fix: start at k0 (the first bin above the VAH). The graded
  // harness carried a one-bin skip here (short stops one bin farther);
  // corrected for live use -- difference is at most one profile row.
  const k0 = floorDiv(prof.vah - lo, step);
  for (let k = k0; k < k0 + 60; k++)
    if ((vol.get(k) || 0) < CFG.lvnFrac * pv) return lo + (k + 1) * step + 0.10 * atr;
  return prof.vah + 0.60 * atr;
}

// ---- display helper: downsample a profile into <=N drawable rows --------
// Each row: { price, frac (0..1 of max volume), inVA, isPoc }
function displayRows(prof, N, maxPrice) {
  const keys = [...prof.vol.keys()].sort((a, b) => a - b);
  if (!keys.length) return null;
  const kLo = keys[0], kHi = keys[keys.length - 1];
  const span = kHi - kLo + 1;
  const group = Math.max(1, Math.ceil(span / N));
  const out = [];
  let vmax = 0;
  for (let g = kLo; g <= kHi; g += group) {
    // audit fix: clip the final (possibly partial) group before centering
    const kEnd = Math.min(g + group - 1, kHi);
    let v = 0;
    for (let k = g; k <= kEnd; k++) v += prof.vol.get(k) || 0;
    const price = prof.lo + ((g + kEnd + 1) / 2) * prof.step;
    // audit fix: skip the exact-edge overhang bin above the session high
    // (buildProfile parity with the graded harness is preserved; the clamp
    // is display-only)
    if (maxPrice !== undefined && prof.lo + g * prof.step >= maxPrice) continue;
    const isPoc = prof.pocRow >= g && prof.pocRow <= kEnd;
    const inVA = price >= prof.val && price <= prof.vah;
    out.push({ price, v, inVA, isPoc, h: group * prof.step });
    if (v > vmax) vmax = v;
  }
  if (vmax <= 0) return null;
  for (const r of out) { r.frac = r.v / vmax; delete r.v; }
  return out;
}

// ---- small helpers ------------------------------------------------------
function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pctile(a, p) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

// ---- the streaming core -------------------------------------------------
class DaleCore {
  constructor(cfg) {
    this.cfg = Object.assign({}, CFG, cfg || {});
    this.day = null;          // current session key
    this.dayBars = [];        // bars of the current session
    this.recent = [];         // rolling window (accumLookback) across sessions
    this.sessions = [];       // finalized sessions: {key, bars} (last htfSessions kept)
    this.prev = null;         // prior-session profile
    this.prevLiquid = false;  // prior session passed the harness liquidity gate
    this.priorPocs = [];      // recent prior POCs (targets)
    this.naked = [];          // untested session POCs (Dale's naked-POC rays)
    this.htf = null;          // composite profile {poc, vah, val}
    this.atr = 0;
    this._resetDayState();
    this.events = [];         // signal events accumulated over the run
  }

  _resetDayState() {
    // prior-POC machine (v5.11 FireSignal + SignatureScan semantics)
    this.poc = {
      side: null, wasOut: false, armed: false, maxd: 0, flipped: false,
      touchedAt: -1, reactExt: null, absorbAt: -1, done: false, fired: false,
    };
    // ACCUM machine (signed retest)
    this.acc = { level: null, prof: null, short: false, key: null,
      wasOut: false, maxd: 0, done: false, indep: false, start: null, end: null };
    // LEG machine (signed retest, v5.11 guards)
    this.leg = { level: null, prof: null, down: false, key: null,
      wasOut: false, maxd: 0, done: false, firedToday: false };
    this.sigLive = null;      // open signal being tracked for flow-quit
  }

  // ---- session roll ----
  _finalizeSession() {
    const minBars = Math.max(10, Math.round(30 / this.cfg.barMinutes));
    if (this.dayBars.length >= minBars) {
      let vol = 0, lo = Infinity, hi = -Infinity;
      for (const b of this.dayBars) { vol += b.vol; if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
      if (vol > 0) {
        const step = Math.max((hi - lo) / this.cfg.rows, 1e-9);
        const prof = buildProfile(this.dayBars, step);
        if (prof) {
          this.prev = prof;
          this._prevRows = displayRows(prof, 40, hi);
          // harness graded signals only when the prior session was liquid;
          // thin sessions still draw levels but are flagged + not traded
          this.prevLiquid = vol >= this.cfg.liquidMinVol &&
            this.dayBars.length >= Math.round(this.cfg.liquidMinBars / this.cfg.barMinutes);
          this.priorPocs.push(prof.poc);
          if (this.priorPocs.length > 50) this.priorPocs.shift();
          this.naked.push({ poc: prof.poc,
            endTms: this.dayBars[this.dayBars.length - 1].tMs, tested: false });
          if (this.naked.length > 12) this.naked.shift();
        }
        this.sessions.push({ key: this.day, bars: this.dayBars,
          startTms: this.dayBars[0].tMs,
          rows: prof ? displayRows(prof, 30, hi) : null });
        if (this.sessions.length > this.cfg.htfSessions) this.sessions.shift();
        this._rebuildHTF();
      }
    }
    this.dayBars = [];
    this._resetDayState();
  }

  _rebuildHTF() {
    if (this.sessions.length < 5) { this.htf = null; this._htfRows = null; return; }
    const all = [];
    for (const s of this.sessions) for (const b of s.bars) all.push(b);
    let lo = Infinity, hi = -Infinity;
    for (const b of all) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
    const step = Math.max((hi - lo) / this.cfg.rows, 1e-9);
    const p = buildProfile(all, step);
    this.htf = p ? { poc: p.poc, vah: p.vah, val: p.val, sessions: this.sessions.length } : null;
    this._htfRows = p ? displayRows(p, 40, hi) : null;
  }

  _updateATR() {
    const w = this.cfg.atrWindow;
    const src = this.recent.length > w ? this.recent.slice(-w) : this.recent;
    if (!src.length) { this.atr = 0; return; }
    let s = 0;
    for (const b of src) s += b.h - b.l;
    // harness definition: mean 1-min range x30. On k-minute bars the
    // equivalent linear scale is x(30/k). Grades were measured on 1-min.
    this.atr = (s / src.length) * (30 / this.cfg.barMinutes);
  }

  htfAligned(isLong, px) {
    if (!this.htf) return null;
    return isLong ? px >= this.htf.poc : px <= this.htf.poc;
  }

  _emit(ev) {
    this.events.push(ev);
    if (this.events.length > 200) this.events.shift();
    return ev;
  }

  // ---- ACCUM detection (mirror of DetectAccumulation / find_rotations) ----
  _detectAccum() {
    const cfg = this.cfg, atr = this.atr;
    const src = this.recent.length > cfg.accumLookback
      ? this.recent.slice(-cfg.accumLookback) : this.recent;
    const n = src.length, L = cfg.accumMinBars;
    if (n < L + 10 || atr <= 0) { this.acc.level = null; return; }
    const thresh = cfg.accumMaxRangeATR * atr, brk = cfg.accumBreakATR * atr;
    let e = n - 1 - L;
    while (e >= L) {
      let wHi = -Infinity, wLo = Infinity;
      for (let i = e - L + 1; i <= e; i++) { if (src[i].h > wHi) wHi = src[i].h; if (src[i].l < wLo) wLo = src[i].l; }
      if (wHi - wLo > thresh) { e -= 5; continue; }
      let s = e - L + 1;
      while (s > 0) {
        const nh = Math.max(wHi, src[s - 1].h), nl = Math.min(wLo, src[s - 1].l);
        if (nh - nl > thresh) break;
        wHi = nh; wLo = nl; s -= 1;
      }
      let up = false, dn = false, ext = 0, comp = -1, dead = false;
      for (let j = e + 1; j < n; j++) {
        const c = src[j].c;
        if (!up && !dn) {
          if (c > wHi + 0.2 * atr) up = true;
          else if (c < wLo - 0.2 * atr) dn = true;
          continue;
        }
        if (up) {
          if (src[j].h - wHi > ext) ext = src[j].h - wHi;
          if (c < wLo - 0.2 * atr) { dead = true; break; }
        } else {
          if (wLo - src[j].l > ext) ext = wLo - src[j].l;
          if (c > wHi + 0.2 * atr) { dead = true; break; }
        }
        if (ext >= brk && comp < 0) comp = j;
      }
      if (comp > 0 && !dead) {
        const step = Math.max((wHi - wLo + 2 * atr) / cfg.rows, 1e-9);
        const prof = buildProfile(src.slice(s, e + 1), step);
        if (prof) {
          const key = src[e].tMs;
          if (key !== this.acc.key) {
            this.acc = { level: prof.poc, prof, short: dn, key,
              wasOut: false, maxd: 0, done: false,
              start: src[s].tMs, end: src[e].tMs, indep: false,
              winHi: wHi, winLo: wLo, rows: displayRows(prof, 30) };
          } else {
            this.acc.level = prof.poc; this.acc.prof = prof; this.acc.short = dn;
            this.acc.winHi = wHi; this.acc.winLo = wLo;
            // audit fix: keep the display state in sync with the level
            this.acc.rows = displayRows(prof, 30);
            this.acc.start = src[s].tMs;
          }
          return;
        }
      }
      e = s - 5;
    }
    this.acc.level = null;
  }

  // ---- LEG detection (mirror of Leg2Update discovery, v5.11 guards) ----
  _detectLeg() {
    const cfg = this.cfg, atr = this.atr;
    const src = this.recent.length > cfg.legLookback
      ? this.recent.slice(-cfg.legLookback) : this.recent;
    const n = src.length, k = cfg.legPivot;
    if (n < 100 || atr <= 0) { this.leg.level = null; return; }
    let lastPH = -1, lastPL = -1;
    for (let i = n - 1 - k; i >= k && (lastPH < 0 || lastPL < 0); i--) {
      let ph = true, pl = true;
      for (let j = i - k; j <= i + k && (ph || pl); j++) {
        if (j === i) continue;
        if (src[j].h >= src[i].h) ph = false;
        if (src[j].l <= src[i].l) pl = false;
      }
      if (ph && lastPH < 0) lastPH = i;
      if (pl && lastPL < 0) lastPL = i;
    }
    if (lastPH < 0 || lastPL < 0) { this.leg.level = null; return; }
    const a = Math.min(lastPH, lastPL), b = Math.max(lastPH, lastPL);
    if (b - a < 15) { this.leg.level = null; return; }
    if (Math.abs(src[lastPH].h - src[lastPL].l) < cfg.legMinATR * atr) { this.leg.level = null; return; }
    const step = Math.max((src[lastPH].h - src[lastPL].l + atr) / cfg.rows, 1e-9);
    const prof = buildProfile(src.slice(a, b + 1), step);
    if (!prof) { this.leg.level = null; return; }
    // never duplicate the ACCUM level
    if (this.acc.level !== null && Math.abs(prof.poc - this.acc.level) < 0.30 * atr) {
      this.leg.level = null; return;
    }
    const key = src[b].tMs;
    if (key !== this.leg.key) {
      const fired = this.leg.firedToday;
      this.leg = { level: prof.poc, prof, down: lastPH < lastPL, key,
        wasOut: false, maxd: 0, done: false, firedToday: fired };
    } else {
      this.leg.level = prof.poc; this.leg.prof = prof;
    }
  }

  _target(entry, dirn, atr, rr) {
    let tp;
    const cand = this.priorPocs.slice(-this.cfg.priorDays)
      .filter(p => (p - entry) * dirn > 0.05 * atr);
    if (cand.length) {
      let best = cand[0];
      for (const p of cand) if (Math.abs(p - entry) < Math.abs(best - entry)) best = p;
      tp = best - dirn * this.cfg.tpFrontATR * atr;
    } else {
      tp = entry + dirn * 0.8 * atr;
    }
    // MT5 v5.11 sanity clamp (postdates the dale_of2 grade): never quote a
    // target closer than half the risk
    if (rr > 0 && Math.abs(tp - entry) < 0.5 * rr) tp = entry + dirn * rr;
    return tp;
  }

  _fastApproach(atr) {
    const n = this.dayBars.length;
    if (n < 6 || atr <= 0) return false;
    return Math.abs(this.dayBars[n - 1].c - this.dayBars[n - 6].c) > 0.8 * atr;
  }

  // ---- per-bar update. Call once per CLOSED bar, oldest first. ----
  push(bar) {
    const cfg = this.cfg;
    const key = sessionKey(bar.tMs);
    if (this.day !== null && key !== this.day) this._finalizeSession();
    this.day = key;
    this.dayBars.push(bar);
    this.recent.push(bar);
    if (this.recent.length > cfg.accumLookback + 200) this.recent.shift();
    this._updateATR();

    const out = {
      tMs: bar.tMs, day: key, atr: this.atr,
      dayStartTms: this.dayBars[0].tMs,
      prev: this.prev ? { poc: this.prev.poc, vah: this.prev.vah, val: this.prev.val,
        liquid: this.prevLiquid } : null,
      htf: this.htf, accum: null, leg: null, signal: null, flowQuit: false,
      confluence: false, status: '',
      prevProf: this._prevRows || null, htfRows: this._htfRows || null,
      absorb: false, nakedPocs: null,
      // per-session profiles for the MarketProfile-style display (each
      // session's histogram drawn at its own start, like the MT5 chart)
      sessionProfiles: this.sessions.slice(-6)
        .filter(s => s.rows)
        .map(s => ({ start: s.startTms, rows: s.rows })),
    };
    // Dale's naked-POC rule: a session POC stays drawn (extended right)
    // until price trades back through it
    for (const np of this.naked)
      if (!np.tested && bar.l <= np.poc && bar.h >= np.poc) np.tested = true;
    const nk = this.naked.filter(n => !n.tested);
    if (nk.length) out.nakedPocs = nk.map(n => ({ poc: n.poc, endTms: n.endTms }));
    const atr = this.atr;
    if (atr <= 0) return out;

    this._detectAccum();
    this._detectLeg();
    if (this.acc.level !== null)
      out.accum = { level: this.acc.level, short: this.acc.short,
        start: this.acc.start, end: this.acc.end,
        winHi: this.acc.winHi, winLo: this.acc.winLo, rows: this.acc.rows };
    if (this.leg.level !== null)
      out.leg = { level: this.leg.level, down: this.leg.down };

    // confluence (v5.11 guards: independence + info only)
    if (this.acc.level !== null && this.prev &&
        Math.abs(this.acc.level - this.prev.poc) < 0.30 * atr) {
      const dayStartMs = this.dayBars[0].tMs;
      const indep = this.acc.start >= dayStartMs ||
        (dayStartMs - this.acc.start) * 2 < (this.acc.end - this.acc.start);
      out.confluence = !!indep;
    }

    const px = bar.c;
    const inWin = inNyWindow(bar.tMs, cfg);
    const i = this.dayBars.length - 1;

    // ------- prior-POC machine: touch -> signature -> fire -------
    // gated on prior-session liquidity, matching how the grade was measured
    const P = this.poc;
    if (this.prev && this.prevLiquid && !P.done && this.dayBars.length >= 5) {
      const lvl = this.prev.poc;
      const above = px > lvl;
      if (P.side === null) P.side = above;
      else if (P.side !== above && P.touchedAt < 0) {
        const beyond = P.side ? lvl - px : px - lvl;
        if (!P.flipped && beyond >= cfg.flipBufATR * atr) {
          P.flipped = true; P.side = above;
          P.armed = false; P.wasOut = false; P.maxd = 0;
        }
        // NOTE: MT5 (tick-driven) additionally tracks the side after a flip;
        // in a bar-close-driven port that inverts the approach direction at
        // the touch bar. The GRADED machine (dale_of2, the +0.40R source)
        // takes direction from the PREVIOUS bar's close -- done below.
      }
      if (P.touchedAt < 0) {
        const d = Math.abs(px - lvl);
        if (d > P.maxd) P.maxd = d;
        if (d > 0.10 * atr) P.wasOut = true;
        if (!P.armed && P.maxd >= cfg.moveAwayATR * atr) P.armed = true;
        if (P.armed && P.wasOut && inWin) {
          // graded-exact touch: the bar spans the level; direction = side of
          // the previous bar's close (dale_of2: long = cl[i0-1] > poc)
          const touch = bar.l <= lvl && bar.h >= lvl;
          if (touch && this.dayBars.length >= 2) {
            const sideLong = this.dayBars[this.dayBars.length - 2].c > lvl;
            P.side = sideLong;
            P.touchedAt = i;
            P.reactExt = sideLong ? bar.l : bar.h;
          }
        }
      } else {
        // signature scan on REAL delta (dale_of2 semantics, causal medians)
        P.reactExt = P.side ? Math.min(P.reactExt, bar.l) : Math.max(P.reactExt, bar.h);
        const since = i - P.touchedAt;
        if (since > cfg.sigBars) { P.done = true; }
        else {
          const w = this.dayBars.slice(-cfg.sigStatWindow);
          const vols = w.map(b => b.vol);
          const rngs = w.map(b => b.h - b.l);
          const dmags = w.map(b => Math.abs(b.delta));
          const vmed = median(vols), rmed = median(rngs), d75 = pctile(dmags, 75);
          const long = P.side;
          if (P.absorbAt < 0) {
            const holds = long ? bar.l > lvl - 0.30 * atr : bar.h < lvl + 0.30 * atr;
            if (bar.vol >= 1.3 * vmed && (bar.h - bar.l) <= 0.9 * rmed && holds) {
              P.absorbAt = i;
              out.absorb = true;   // visual: churn/absorption bar at the level
              this._emit({ kind: 'absorb', tMs: bar.tMs, day: key,
                price: long ? bar.l : bar.h, long });
            }
          } else if (i - P.absorbAt > cfg.initBars) {
            P.absorbAt = -1; // absorption expired; keep looking within sigBars
          } else {
            const init = Math.abs(bar.delta) >= d75 &&
              (long ? bar.delta > 0 : bar.delta < 0);
            if (init) {
              P.done = true;
              const entry = bar.c;
              const sl = long ? P.reactExt - 0.10 * atr : P.reactExt + 0.10 * atr;
              const ok = long ? sl < entry : sl > entry;
              if (ok) {
                const dirn = long ? 1 : -1;
                const tp = this._target(lvl, dirn, atr, Math.abs(entry - sl));
                const al = this.htfAligned(long, entry);
                P.fired = true;
                this.sigLive = { long, entry, r: Math.abs(entry - sl), maxFav: 0 };
                out.signal = this._emit({
                  kind: 'prior-poc', tMs: bar.tMs, day: key, long,
                  entry, sl, tp, level: lvl,
                  tag: '[stack tested +0.40R/80% n10]',
                  htf: al === null ? '' : (al ? '[HTF aligned]' : '[HTF against]'),
                  flipped: P.flipped,
                });
              }
            }
          }
        }
      }
    }

    // ------- ACCUM retest (graded semantics: unsigned arming, no kill --
    // this is the machine the [+0.28R/75% n12] grade was measured on and
    // what MT5 v5.11 ships. The proximity + SL sanity guards below postdate
    // the grade; they exist only for bar-close granularity.) -------
    const A = this.acc;
    if (A.level !== null && !A.done) {
      const dAbs = Math.abs(px - A.level);
      if (dAbs > A.maxd) A.maxd = dAbs;
      if (dAbs > 0.10 * atr) A.wasOut = true;
      if (A.maxd >= cfg.moveAwayATR * atr && A.wasOut && inWin) {
        const touch = A.short ? bar.h >= A.level : bar.l <= A.level;
        if (touch) {
          A.done = true;
          if (Math.abs(px - A.level) <= 0.30 * atr) {
            const long = !A.short;
            const sl = stopBehindLVN(A.prof, long, atr);
            const entry = A.level;
            if ((long ? sl < entry : sl > entry) && (long ? px > sl : px < sl)) {
              const dirn = long ? 1 : -1;
              const tp = this._target(entry, dirn, atr, Math.abs(entry - sl));
              const al = this.htfAligned(long, entry);
              out.signal = out.signal || this._emit({
                kind: 'accum', tMs: bar.tMs, day: key, long,
                entry, sl, tp, level: A.level,
                tag: '[tested +0.28R/75% n12]' +
                  (this._fastApproach(atr) ? ' [fast approach - caution]' : ''),
                htf: al === null ? '' : (al ? '[HTF aligned]' : '[HTF against]'),
              });
            }
          }
        }
      }
    }

    // ------- LEG retest (signed, v5.11 guards, untested arm) -------
    const L = this.leg;
    if (L.level !== null && !L.done && !L.firedToday) {
      const dTrend = L.down ? L.level - px : px - L.level;
      if (dTrend > L.maxd) L.maxd = dTrend;
      if (dTrend > 0.10 * atr) L.wasOut = true;
      if (-dTrend > 0.50 * atr) { L.done = true; }
      else if (L.maxd >= cfg.moveAwayATR * atr && L.wasOut && inWin) {
        const touch = L.down ? bar.h >= L.level : bar.l <= L.level;
        if (touch) {
          L.done = true;
          const nearPrior = this.prev && Math.abs(L.level - this.prev.poc) < 0.30 * atr;
          if (Math.abs(px - L.level) <= 0.30 * atr && !nearPrior) {
            const long = !L.down;
            const sl = stopBehindLVN(L.prof, long, atr);
            const entry = L.level;
            if ((long ? sl < entry : sl > entry) && (long ? px > sl : px < sl)) {
              const dirn = long ? 1 : -1;
              const tp = this._target(entry, dirn, atr, Math.abs(entry - sl));
              L.firedToday = true;
              out.signal = out.signal || this._emit({
                kind: 'leg', tMs: bar.tMs, day: key, long,
                entry, sl, tp, level: L.level,
                tag: '[UNTESTED - inert in backtest]' +
                  (this._fastApproach(atr) ? ' [fast approach - caution]' : ''),
                htf: '',
              });
            }
          }
        }
      }
    }

    // ------- status line (mirrors the MT5 status text) -------
    if (!this.prev) out.status = 'waiting: no prior-session profile yet';
    else if (!this.prevLiquid) out.status = 'stand down: prior session too thin to trust';
    else if (this.sigLive) out.status = 'signal live - manage per playbook';
    else if (P.done && P.fired) out.status = 'signal complete for the session';
    else if (P.done && P.touchedAt >= 0)
      out.status = 'stood down: touch had no absorption-initiative signature';
    else if (P.done) out.status = 'done for the session';
    else if (P.touchedAt >= 0) out.status = 'TOUCHED - waiting for absorption-initiative';
    else if (P.armed && inWin)
      out.status = P.side ? 'armed: buy the retest from above' : 'armed: sell the retest from below';
    else if (P.armed) out.status = 'armed - outside the 09:00-11:00 NY window';
    else out.status = 'waiting: price has not moved 1 ATR from the level';

    // ------- flow-quit alert on the open prior-POC signal -------
    if (this.sigLive) {
      const S = this.sigLive;
      const fav = (S.long ? px - S.entry : S.entry - px) / S.r;
      if (fav > S.maxFav) S.maxFav = fav;
      if (fav <= -1 || S.maxFav >= 3) this.sigLive = null;
      else if (S.maxFav >= 0.3) {
        const w = this.dayBars.slice(-cfg.sigStatWindow);
        const vols = w.map(b => b.vol);
        const dmags = w.map(b => Math.abs(b.delta));
        const vmed = median(vols), d90 = pctile(dmags, 90);
        const opp = Math.abs(bar.delta) >= d90 && bar.vol >= 2 * vmed &&
          (S.long ? bar.delta < 0 : bar.delta > 0);
        if (opp) { out.flowQuit = true; this.sigLive = null; }
      }
    }

    return out;
  }
}

// Node + Tradovate-module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DaleCore, buildProfile, stopBehindLVN, sessionKey, nyOffsetHours, CFG };
}
```

---

## FILE: wrapper.js (OVERHAULED — v3 visual layer)

```javascript
/*
 * wrapper.js -- the Tradovate custom-indicator shell around DaleCore.
 * NOT used directly: build.js splices dale_core.js + this file into
 * TraderMachell.js (the single module you paste into Tradovate's
 * Indicator Editor).
 *
 * VISUAL SUITE (v3 -- alignment + legibility overhaul, modeled on Trader
 * Dale's software look):
 *  - PREV-SESSION VOLUME PROFILE: teal horizontal histogram growing right
 *    from the session start; rows sit exactly on their price span (the
 *    exact row pitch carried by the core is used -- no re-estimation);
 *    value-area rows brighter; POC row gold; whisper-alpha VALUE-AREA BAND
 *    from VAL to VAH across the session so value reads at a glance.
 *  - HTF COMPOSITE PROFILE: dark-gold ghost histogram growing LEFT from
 *    the session start (true mirror -- left-anchored positive-width rects,
 *    never negative widths), + thick POC ray, dashed VAH/VAL.
 *  - ZOOM-SCALING WIDTHS: histogram rows are sized in du (bar-index)
 *    units by default so profiles scale with the chart like the reference
 *    software. `scaledWidths=false` falls back to the px-width mode that
 *    is empirically PROVEN to render (see fallback notes below).
 *  - RIGHT-EDGE LABEL COLUMN: labels extend RIGHT of the last bar into
 *    empty margin (rightMiddle -- the platform's leftMiddle extends text
 *    LEFT, over the candles: that was v2's biggest legibility bug), and
 *    run through a de-collision pass that stacks labels of nearby levels
 *    at a fixed pixel pitch so they can never sit on each other.
 *  - ACCUM rotation: gold box outline + gold histogram + level ray.
 *  - LEG cluster ray (untested tag).
 *  - MARKS with noise control: absorption/flow-quit stamps only for the
 *    CURRENT session; older signals shrink to bare arrows (set
 *    showHistory=true to label them again). Evidence tags are verbatim.
 *  - SESSION START marker: subtle dashed vertical line at the day anchor,
 *    so a wrong time anchor is visible immediately.
 *  - ALIGNMENT SELF-TEST (alignTest=true): draws a magenta test row
 *    centered on PREV POC through the same code path as every histogram
 *    row. The white POC ray must bisect it. If the row sits entirely
 *    ABOVE the ray, the platform's Rectangle y-anchor is top-left: set
 *    RECT_Y_ANCHOR to "top" below (one line) and every row is fixed.
 *  - STATUS BANNER pinned to the viewport top-left (always visible),
 *    fixed line slots (no jumping), second line of key level numbers.
 *
 * Platform facts (verified): graphics via map() return on d.isLast();
 * LineSegments (+infiniteEnd rays), Text (needs fontSize+fill), du/px/op
 * coordinate helpers, origin{cs:'frame'} pins to viewport; leftMiddle
 * extends text LEFT of the point, rightMiddle extends RIGHT; mixed-unit
 * op() on the X axis of Line endpoints does not render; lineStyle.opacity
 * kills the group (alpha lives inside rgba strings); graphics do not
 * stretch autoscale; intra-bar state rolls back to last closed bar, so
 * bars are committed once via the lastPushedMs guard + history walk-back
 * (correct under both candidate live-engine models).
 */

/* __CORE_SPLICE__ */

const predef = require("./tools/predef");
const meta = require("./tools/meta");
const { px, du, op } = require("./tools/graphics");

// ---- render configuration ------------------------------------------------
// RECT_Y_ANCHOR: which edge of a Rectangle `position.y` names. "bottom"
// matches the one community indicator proven to render (it passes
// priceTop - binSize). If the alignTest row draws ABOVE its ray, the
// platform is top-anchored: flip this to "top". Single source of truth --
// every rectangle in the file goes through vrect()/hrect().
const RECT_Y_ANCHOR = "bottom";
const VIS = {
  rowFill: 0.92,        // row height as fraction of its pitch (hairline gap)
  minRowBars: 0.35,     // du mode: shortest visible row, in bar widths
  minRowPx: 3,          // px mode: shortest visible row, in pixels
  prevMaxBars: 180,     // du mode: longest prev-profile row (1-min bars)
  htfMaxBars: 150,      // du mode: longest HTF ghost row
  sessMaxBars: 110,     // du mode: longest per-session row
  accMaxBars: 110,      // du mode: longest ACCUM row (also capped by box)
  prevMaxPx: 160,       // px fallback widths (the v2 proven values)
  sessMaxPx: 110,
  accMaxPx: 90,
  labelGapPx: 15,       // de-collision stack pitch
  clusterATR: 0.25,     // labels closer than this (in ATR) share a stack
};

const COLORS = {
  profile: "rgba(64,158,186,0.26)",     // teal tails (Dale's look)
  profileVA: "rgba(96,204,236,0.50)",   // brighter inside the value area
  pocRow: "rgba(255,203,54,0.95)",      // gold POC row
  vaBand: "rgba(96,204,236,0.07)",      // whisper value-area band
  sess: "rgba(122,134,170,0.18)",       // historical sessions: muted slate
  sessVA: "rgba(152,164,205,0.32)",
  sessPoc: "rgba(206,213,240,0.72)",
  htfGhost: "rgba(201,150,43,0.22)",    // HTF mirror rows
  htfPocRow: "rgba(201,150,43,0.70)",
  poc: "#FFFFFF", va: "#62A8E8",
  htf: "#C9962B", accum: "#FFD54F", leg: "#26C6DA",
  naked: "#E53935", nakedTxt: "#EF9A9A",
  buy: "#00C853", sell: "#FF5252", tp: "#00C853", sl: "#FF5252",
  absorb: "#FFA500", conflu: "#FF8C00", warn: "#FFA500",
  status: "#E0E0E0", dim: "#9E9E9E",
  dayLine: "rgba(158,158,158,0.45)",
  test: "rgba(255,0,255,0.55)",
};
const FONT = { fontSize: 13, fontWeight: "bold" };
const FONT_SM = { fontSize: 11, fontWeight: "bold" };

// ---- primitive helpers ---------------------------------------------------
function ray(key, x0, price, color, width, dash) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [{ tag: "Line",
      a: { x: du(x0), y: du(price) }, b: { x: du(x0 + 1), y: du(price) },
      infiniteEnd: true }],
    lineStyle: { lineWidth: width, color, lineStyle: dash || 1 },
  };
}
function vline(key, x, pLo, pHi, color, dash) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [{ tag: "Line", a: { x: du(x), y: du(pLo) }, b: { x: du(x), y: du(pHi) } }],
    lineStyle: { lineWidth: 1, color, lineStyle: dash || 3 },
  };
}
function txt(key, x, price, s, color, dyPx, font, align) {
  return {
    tag: "Text", key, global: true,
    point: { x: du(x), y: dyPx ? op(du(price), "-", px(dyPx)) : du(price) },
    text: s,
    style: Object.assign({ fill: color }, font || FONT),
    // rightMiddle extends text to the RIGHT of the anchor (into the empty
    // margin). leftMiddle extends LEFT -- over the candles. Platform fact.
    textAlignment: align || "rightMiddle",
  };
}
function frameTxt(key, xPx, yPx, s, color, font) {
  return {
    tag: "Text", key, global: true,
    point: { x: px(xPx), y: px(yPx) },
    text: s,
    style: Object.assign({ fill: color }, font || FONT),
    textAlignment: "rightMiddle",
    origin: { cs: "frame", h: "left", v: "top" },
  };
}
// the ONLY places a Rectangle's y anchor is decided. pLo/pHi are prices.
function vrect(x, wDu, pLo, pHi) {
  return { tag: "Rectangle",
    position: { x: du(x), y: du(RECT_Y_ANCHOR === "bottom" ? pLo : pHi) },
    size: { width: du(wDu), height: du(pHi - pLo) } };
}
function pxrect(x, wPx, pLo, pHi) {
  return { tag: "Rectangle",
    position: { x: du(x), y: du(RECT_Y_ANCHOR === "bottom" ? pLo : pHi) },
    size: { width: px(wPx), height: du(pHi - pLo) } };
}

// ---- histogram -----------------------------------------------------------
// Shapes->Rectangle rows, the pattern PROVEN to render (Rectangle
// primitives, du heights, alpha baked into rgba colors, global:true under
// isLast()). Each row uses the EXACT pitch carried by the core (r.h) --
// never an estimate -- so rows tile the profile's true price span.
//   duMode=true : widths in bar units (scale with zoom); dir=-1 mirrors
//                 LEFT via left-anchored positive-width rects.
//   duMode=false: px widths (v2 proven mode); leftward growth is NOT
//                 expressible without negative widths (unproven), so
//                 dir=-1 callers must skip in px mode.
function histogram(keyBase, rows, x0, dir, colorMain, colorVA, colorPoc, maxW, duMode) {
  const groups = { main: [], va: [], poc: [] };
  for (const r of rows) {
    if (!(r.frac > 0)) continue;          // no phantom stubs on gap rows
    const h = (r.h || 0) * VIS.rowFill;
    if (!(h > 0)) continue;
    const pLo = r.price - h / 2, pHi = r.price + h / 2;
    let rect;
    if (duMode) {
      const w = Math.max(VIS.minRowBars, r.frac * maxW);
      rect = vrect(dir > 0 ? x0 : x0 - w, w, pLo, pHi);
    } else {
      if (dir < 0) continue;              // negative px widths are unproven
      rect = pxrect(x0, Math.max(VIS.minRowPx, Math.round(r.frac * maxW)), pLo, pHi);
    }
    if (r.isPoc) groups.poc.push(rect);
    else if (r.inVA) groups.va.push(rect);
    else groups.main.push(rect);
  }
  const items = [];
  if (groups.main.length) items.push({ tag: "Shapes", key: keyBase + "M",
    global: true, primitives: groups.main, fillStyle: { color: colorMain } });
  if (groups.va.length) items.push({ tag: "Shapes", key: keyBase + "V",
    global: true, primitives: groups.va, fillStyle: { color: colorVA } });
  if (groups.poc.length) items.push({ tag: "Shapes", key: keyBase + "P",
    global: true, primitives: groups.poc, fillStyle: { color: colorPoc } });
  return items;
}
function box(key, xA, xB, hi, lo, color) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [
      { tag: "Line", a: { x: du(xA), y: du(hi) }, b: { x: du(xB), y: du(hi) } },
      { tag: "Line", a: { x: du(xA), y: du(lo) }, b: { x: du(xB), y: du(lo) } },
      { tag: "Line", a: { x: du(xA), y: du(hi) }, b: { x: du(xA), y: du(lo) } },
      { tag: "Line", a: { x: du(xB), y: du(hi) }, b: { x: du(xB), y: du(lo) } },
    ],
    lineStyle: { lineWidth: 1, color, lineStyle: 3 },
  };
}

// ---- right-edge label column with de-collision -----------------------------
// Collect {key, price, text, color, font} entries, then lay them out top to
// bottom. Labels whose prices sit within clusterATR of each other are drawn
// as one stack fanned around the cluster midpoint at a fixed pixel pitch,
// ordered by price -- close levels can never overprint each other.
function layoutLabels(labels, lx, atr) {
  const eps = Math.max(atr * VIS.clusterATR, 1e-9);
  const sorted = labels.slice().sort((a, b) => b.price - a.price);
  const items = [];
  let c = 0;
  while (c < sorted.length) {
    let e = c;
    while (e + 1 < sorted.length && sorted[e].price - sorted[e + 1].price < eps) e++;
    const cluster = sorted.slice(c, e + 1);
    const mid = (cluster[0].price + cluster[cluster.length - 1].price) / 2;
    const n = cluster.length;
    for (let k = 0; k < n; k++) {
      const dy = ((n - 1) / 2 - k) * VIS.labelGapPx;  // +dy raises the label
      const L = cluster[k];
      items.push(txt(L.key, lx, n > 1 ? mid : L.price, L.text, L.color, dy, L.font));
    }
    c = e + 1;
  }
  return items;
}

class traderMachell {
  init() {
    let barMin = 1;
    const cd = this.chartDescription;
    this.timeBased = !cd || cd.underlyingType === "MinuteBar";
    if (cd && cd.underlyingType === "MinuteBar" && cd.elementSize > 0)
      barMin = cd.elementSize;
    this.barMin = barMin;
    const s = (mins, floor) => Math.max(floor || 5, Math.round(mins / barMin));
    this.core = new DaleCore({
      barMinutes: barMin,
      atrWindow: s(420, 30),
      accumLookback: s(2880, 60),
      accumMinBars: s(30, 5),
      legLookback: s(600, 50),
      legPivot: Math.max(3, Math.round(12 / barMin)),
      sigBars: Math.max(3, Math.round(15 / barMin)),
      initBars: Math.max(2, Math.round(5 / barMin)),
      htfSessions: (this.props && this.props.htfSessions) || 20,
    });
    const p = this.props || {};
    this.optScaled = p.scaledWidths === undefined ? true : !!p.scaledWidths;
    this.optAlignTest = !!p.alignTest;
    this.optHistory = !!p.showHistory;
    // du-mode row caps, rescaled so a "row bar-width" tracks real time when
    // the zoom buttons switch aggregation (Q1 resets the indicator anyway)
    const cap = (b) => Math.max(20, Math.round(b / barMin));
    this.wPrev = cap(VIS.prevMaxBars);
    this.wHtf = cap(VIS.htfMaxBars);
    this.wSess = cap(VIS.sessMaxBars);
    this.wAcc = cap(VIS.accMaxBars);
    this.lastPushedMs = 0;
    this.lastOut = null;
    this.marks = [];              // {tMs, price, day, ev} -- NO indexes stored:
    // the chart PREPENDS bars when older history loads, shifting every
    // absolute index; anchors are resolved from timestamps at draw time
    this.tmsList = [];            // pushed-bar timestamps, in order -- our
    // own mirror of the chart's tail, used to turn timestamps into indexes
    // by offset-from-the-end (immune to prepends AND to platform history
    // indexing quirks)
  }

  _pushEntity(e) {
    const tMs = e.timestamp().getTime();
    if (tMs <= this.lastPushedMs) return;
    this.lastPushedMs = tMs;
    const off = typeof e.offerVolume === "function" ? e.offerVolume() : 0;
    const bid = typeof e.bidVolume === "function" ? e.bidVolume() : 0;
    const bar = {
      tMs, o: e.open(), h: e.high(), l: e.low(), c: e.close(),
      vol: e.volume(), delta: off - bid,
    };
    this.tmsList.push(tMs);
    if (this.tmsList.length > 12000) this.tmsList.splice(0, 2000);
    const out = this.core.push(bar);
    this.lastOut = out;
    if (out.absorb)
      this.marks.push({ tMs, price: bar.c, day: out.day,
        ev: { kind: "absorb", long: this.core.poc.side } });
    if (out.signal)
      this.marks.push({ tMs, price: out.signal.entry, day: out.day, ev: out.signal });
    if (out.flowQuit)
      this.marks.push({ tMs, price: bar.c, day: out.day, ev: { kind: "flowquit" } });
    if (this.marks.length > 60) this.marks.shift();
  }

  map(d, i, history) {
    if (history && typeof history.get === "function" && i > 0) {
      let k = i - 1, backlog = [];
      while (k >= 0 && backlog.length < 500) {
        const e = history.get(k);
        if (!e || typeof e.timestamp !== "function") break;
        if (e.timestamp().getTime() <= this.lastPushedMs) break;
        backlog.push(e);
        k--;
      }
      for (let b = backlog.length - 1; b >= 0; b--)
        this._pushEntity(backlog[b]);
    }
    const complete = typeof d.isComplete === "function" ? d.isComplete() : !d.isLast();
    if (complete) this._pushEntity(d);

    if (!d.isLast()) return {};
    return { graphics: { items: this.buildItems(d, i, history) } };
  }

  // resolve a bar-start timestamp to its CURRENT chart index. The pushed
  // bars are exactly the chart's TAIL (one per closed chart bar, in
  // order), so a timestamp's offset from the end of tmsList equals its
  // offset from the end of the chart -- valid regardless of how many old
  // bars the chart prepends, and using no platform history APIs at all.
  _idxOf(tMs, endIdx, cache) {
    if (cache.has(tMs)) return cache.get(tMs);
    const L = this.tmsList;
    let res;
    if (!L.length || tMs < L[0]) res = undefined;   // older than our mirror
    else {
      let lo = 0, hi = L.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (L[mid] < tMs) lo = mid + 1; else hi = mid;
      }
      res = (L[lo] === tMs) ? endIdx - (L.length - 1 - lo) : undefined;
      if (res !== undefined && res < 0) res = undefined;
    }
    cache.set(tMs, res);
    return res;
  }

  buildItems(d, i, history) {
    const items = [];
    const out = this.lastOut;
    if (!this.timeBased) {
      items.push(frameTxt("tmWarn", 70, 20,
        "TraderMachell: use a time-based (minute) chart", COLORS.warn));
      return items;
    }
    if (!out) return items;
    const duMode = this.optScaled;
    const tcache = new Map();
    // index of the last PUSHED bar: i if the current bar is committed,
    // else i-1 (the developing bar is never pushed)
    const endIdx = this.lastPushedMs === d.timestamp().getTime() ? i : i - 1;
    const idx = t => this._idxOf(t, endIdx, tcache);
    let x0 = idx(out.dayStartTms);
    if (x0 === undefined) x0 = Math.max(0, i - 60);
    const lx = i + 4;                       // label column, right of last bar
    const labels = [];                      // -> layoutLabels at the end
    const lab = (key, price, text, color, font) =>
      labels.push({ key, price, text, color, font });
    const fmt = p => (this.contractInfo && this.contractInfo.tickSize < 0.01)
      ? p.toFixed(3) : p.toFixed(1);

    // ---- status banner, pinned to the viewport (fixed line slots) ----
    items.push(frameTxt("stat1", 70, 18,
      "TraderMachell  |  " + (out.status || ""), COLORS.status));
    if (out.prev)
      items.push(frameTxt("stat2", 70, 36,
        "PREV  POC " + fmt(out.prev.poc) + "   VAH " + fmt(out.prev.vah) +
        "   VAL " + fmt(out.prev.val) +
        (out.htf ? "      HTF POC " + fmt(out.htf.poc) : "      HTF: needs more history"),
        COLORS.dim, FONT_SM));
    const ctx = [];
    if (out.htf) {
      const pxNow = d.close();
      ctx.push("HTF: " + (pxNow > out.htf.vah ? "above value (info, not a gate)"
        : pxNow < out.htf.val ? "below value (info, not a gate)"
          : "inside value (balanced)"));
    }
    if (out.confluence) ctx.push("CONFLUENCE: ACCUM on prev POC [n=1 - untested]");
    if (this.barMin !== 1)
      ctx.push("CAUTION: " + this.barMin + "-min bars - grades measured on 1-min");
    if (ctx.length)
      items.push(frameTxt("stat3", 70, 54, ctx.join("   |   "),
        out.confluence ? COLORS.conflu : (this.barMin !== 1 ? COLORS.warn : COLORS.htf),
        FONT_SM));

    // ---- session start marker (verifies the time anchor at a glance) ----
    if (out.prevProf && out.prevProf.length) {
      let pLo = Infinity, pHi = -Infinity, ph = 0;
      for (const r of out.prevProf) {
        if (r.price < pLo) pLo = r.price;
        if (r.price > pHi) pHi = r.price;
        ph = r.h || ph;
      }
      items.push(vline("dayLn", x0, pLo - ph, pHi + ph, COLORS.dayLine, 3));
    }

    // ---- value-area band (VAL..VAH, whisper alpha, du mode only) ----
    if (duMode && out.prev && i > x0) {
      items.push({ tag: "Shapes", key: "vaB", global: true,
        primitives: [vrect(x0, (i - x0) + 2, out.prev.val, out.prev.vah)],
        fillStyle: { color: COLORS.vaBand } });
    }

    // ---- HTF composite (dark gold ghost, true mirror: grows LEFT) ----
    // px fallback cannot mirror left (negative widths are unproven), so the
    // ghost is du-mode only; rays + labels always draw.
    if (duMode && out.htfRows && x0 > 2) {
      items.push(...histogram("hpro", out.htfRows, x0, -1,
        COLORS.htfGhost, COLORS.htfGhost, COLORS.htfPocRow, this.wHtf, true));
    }

    // ---- per-session profiles (MarketProfile-style: one histogram per
    // day, anchored at each session's own start -- the MT5 look) ----
    if (out.sessionProfiles) {
      for (let s = 0; s < out.sessionProfiles.length; s++) {
        const sp = out.sessionProfiles[s];
        const six = idx(sp.start);
        if (six === undefined) continue;
        items.push(...histogram("sp" + s, sp.rows, six, 1,
          COLORS.sess, COLORS.sessVA, COLORS.sessPoc,
          duMode ? this.wSess : VIS.sessMaxPx, duMode));
      }
    }

    // ---- PREV-SESSION volume profile (teal, grows right from day start) ----
    if (out.prevProf) {
      items.push(...histogram("ppro", out.prevProf, x0, 1,
        COLORS.profile, COLORS.profileVA, COLORS.pocRow,
        duMode ? this.wPrev : VIS.prevMaxPx, duMode));
    }
    if (out.prev) {
      const thin = out.prev.liquid ? "" : "  [THIN - no signals]";
      items.push(ray("pocL", x0, out.prev.poc, COLORS.poc, 3, 1));
      lab("pocT", out.prev.poc, "PREV POC " + fmt(out.prev.poc) + thin, COLORS.poc);
      items.push(ray("vahL", x0, out.prev.vah, COLORS.va, 1, 3));
      lab("vahT", out.prev.vah, "VAH " + fmt(out.prev.vah), COLORS.va, FONT_SM);
      items.push(ray("valL", x0, out.prev.val, COLORS.va, 1, 3));
      lab("valT", out.prev.val, "VAL " + fmt(out.prev.val), COLORS.va, FONT_SM);
    }

    // ---- naked POC rays (Dale's signature: red, extended until tested) ----
    if (out.nakedPocs) {
      for (let n = 0; n < out.nakedPocs.length; n++) {
        const np = out.nakedPocs[n];
        if (out.prev && Math.abs(np.poc - out.prev.poc) < 1e-9) continue; // white ray owns it
        const ix = idx(np.endTms);
        // keyed by session end time, not list position: entries shift as
        // rays get tested, and positional keys would swap identities
        items.push(ray("nk" + np.endTms, ix !== undefined ? ix : Math.max(0, x0 - 200),
          np.poc, COLORS.naked, 1, 1));
        lab("nkT" + np.endTms, np.poc, "NPOC " + fmt(np.poc), COLORS.nakedTxt, FONT_SM);
      }
    }

    if (out.htf) {
      items.push(ray("hpocL", Math.max(0, x0 - 40), out.htf.poc, COLORS.htf, 3, 1));
      lab("hpocT", out.htf.poc,
        "HTF POC " + fmt(out.htf.poc) + " (" + out.htf.sessions + "s)", COLORS.htf);
      items.push(ray("hvahL", Math.max(0, x0 - 40), out.htf.vah, COLORS.htf, 1, 4));
      lab("hvahT", out.htf.vah, "HTF VAH " + fmt(out.htf.vah), COLORS.htf, FONT_SM);
      items.push(ray("hvalL", Math.max(0, x0 - 40), out.htf.val, COLORS.htf, 1, 4));
      lab("hvalT", out.htf.val, "HTF VAL " + fmt(out.htf.val), COLORS.htf, FONT_SM);
    }

    // ---- ACCUM rotation: box + gold histogram + level ray ----
    if (out.accum) {
      const ia = idx(out.accum.start);
      const ib = idx(out.accum.end);
      if (ia !== undefined && ib !== undefined && out.accum.winHi) {
        items.push(box("accB", ia, ib, out.accum.winHi, out.accum.winLo, COLORS.accum));
        if (out.accum.rows) {
          const wCap = duMode ? Math.min(this.wAcc, Math.max(10, ib - ia)) : VIS.accMaxPx;
          items.push(...histogram("apro", out.accum.rows, ia, 1,
            "rgba(255,213,79,0.28)", "rgba(255,213,79,0.28)",
            "rgba(255,255,255,0.85)", wCap, duMode));
        }
      }
      items.push(ray("accL", ia !== undefined ? ia : x0, out.accum.level, COLORS.accum, 2, 1));
      lab("accT", out.accum.level,
        "ACCUM " + fmt(out.accum.level) +
        (out.accum.short ? "  SELL retest" : "  BUY retest") +
        "  [+0.28R/75% n12]", COLORS.accum);
    }

    // ---- LEG cluster ----
    if (out.leg) {
      items.push(ray("legL", x0, out.leg.level, COLORS.leg, 1, 1));
      lab("legT", out.leg.level,
        "LEG " + fmt(out.leg.level) +
        (out.leg.down ? "  SELL retest" : "  BUY retest") + "  [untested]",
        COLORS.leg, FONT_SM);
    }

    // ---- marks: absorption, signals, flow-quit (noise-controlled) ----
    // Current session: full detail. Prior sessions: signals shrink to bare
    // arrows (showHistory=true restores short labels); absorption and
    // flow-quit stamps are current-session only.
    let lastSig = null, lastSigIdx, lastAbsorb = null, lastAbsorbIdx;
    for (let m = 0; m < this.marks.length; m++) {
      const mk = this.marks[m];
      const mi = idx(mk.tMs);
      if (mi === undefined) continue;
      const ev = mk.ev;
      const today = mk.day === out.day;
      if (ev.kind === "absorb") {
        if (!today) continue;
        items.push(txt("ab" + mk.tMs, mi, mk.price,
          "\u25C6", COLORS.absorb, ev.long ? 12 : -12, FONT_SM, "centerMiddle"));
        lastAbsorb = mk; lastAbsorbIdx = mi;
        continue;
      }
      if (ev.kind === "flowquit") {
        if (!today) continue;
        items.push(txt("fq" + mk.tMs, mi, mk.price,
          "FLOW QUIT", COLORS.conflu, 16, FONT, "centerMiddle"));
        continue;
      }
      const col = ev.long ? COLORS.buy : COLORS.sell;
      items.push(txt("sgA" + mk.tMs, mi, ev.entry,
        ev.long ? "\u25B2" : "\u25BC", col, ev.long ? -10 : 10,
        { fontSize: 16, fontWeight: "bold" }, "centerMiddle"));
      if (today)
        items.push(txt("sg" + mk.tMs, mi, ev.entry,
          (ev.long ? "  BUY " : "  SELL ") + ev.kind + " " + fmt(ev.entry) +
          "  " + ev.tag + (ev.htf ? "  " + ev.htf : ""), col,
          ev.long ? -26 : 26, FONT_SM, "centerMiddle"));
      else if (this.optHistory)
        items.push(txt("sg" + mk.tMs, mi, ev.entry,
          (ev.long ? "BUY " : "SELL ") + ev.kind, col,
          ev.long ? -24 : 24, FONT_SM, "centerMiddle"));
      if (today) { lastSig = mk; lastSigIdx = mi; }
    }
    // label the most recent absorption of the session (the diamonds carry
    // the rest without stamping text over every churn bar)
    if (lastAbsorb && lastAbsorbIdx !== undefined) {
      items.push(txt("abT", lastAbsorbIdx, lastAbsorb.price,
        "ABSORPTION", COLORS.absorb, lastAbsorb.ev.long ? 26 : -26,
        FONT_SM, "centerMiddle"));
    }
    if (lastSig && lastSigIdx !== undefined) {
      const ev = lastSig.ev;
      items.push(ray("tpL", lastSigIdx, ev.tp, COLORS.tp, 2, 3));
      lab("tpT", ev.tp, "TP " + fmt(ev.tp), COLORS.tp);
      items.push(ray("slL", lastSigIdx, ev.sl, COLORS.sl, 2, 2));
      lab("slT", ev.sl, "SL " + fmt(ev.sl), COLORS.sl);
    }

    // ---- alignment self-test (opt-in) ----
    // Draws one magenta row centered on PREV POC through the SAME vrect
    // path as every histogram row. The white PREV POC ray must bisect the
    // magenta row. Row entirely ABOVE the ray => platform anchors rects at
    // the TOP edge: set RECT_Y_ANCHOR = "top" and rebuild.
    if (this.optAlignTest && out.prev && out.prevProf && out.prevProf.length) {
      const h = out.prevProf[0].h || 0.5;
      const pLo = out.prev.poc - h / 2, pHi = out.prev.poc + h / 2;
      items.push({ tag: "Shapes", key: "alnR", global: true,
        primitives: [duMode ? vrect(x0, Math.max(10, Math.round((i - x0) / 3)), pLo, pHi)
          : pxrect(x0, 80, pLo, pHi)],
        fillStyle: { color: COLORS.test } });
      items.push(frameTxt("alnT", 70, 72,
        "ALIGN TEST: white POC ray must bisect the magenta row. Row ABOVE ray => set RECT_Y_ANCHOR='top'",
        COLORS.test, FONT_SM));
    }

    // ---- right-edge labels, de-collided ----
    items.push(...layoutLabels(labels, lx, out.atr || 0));
    return items;
  }

  filter() { return true; }
}

// paramSpecs.bool is not in the verified platform-facts list; degrade to a
// 0/1 number spec if this build of the platform lacks it.
const boolSpec = (predef.paramSpecs && typeof predef.paramSpecs.bool === "function")
  ? predef.paramSpecs.bool
  : (dflt) => predef.paramSpecs.number(dflt ? 1 : 0, 1, 0);

module.exports = {
  name: "traderMachell",
  description: "TraderMachell - Dale volume-profile model (tested grades)",
  calculator: traderMachell,
  inputType: meta.InputType.BARS,
  areaChoice: meta.AreaChoice.OVERLAY,
  tags: ["TraderMachell"],
  params: {
    htfSessions: predef.paramSpecs.period(20),
    scaledWidths: boolSpec(true),   // du-width rows (scale with zoom); off = proven px mode
    showHistory: boolSpec(false),   // label signals from prior sessions
    alignTest: boolSpec(false),     // one-time Rectangle y-anchor self-test
  },
};
```

---

## FILE: build.js (unchanged)

```javascript
/* build.js -- splice dale_core.js into wrapper.js -> TraderMachell.js,
 * the single file to paste into Tradovate's Indicator Editor.
 * dale_core.js stays the source of truth (it is what the regression test
 * proves against the Python harness). */

'use strict';
const fs = require('fs');
const path = require('path');

const core = fs.readFileSync(path.join(__dirname, 'dale_core.js'), 'utf8');
const wrapper = fs.readFileSync(path.join(__dirname, 'wrapper.js'), 'utf8');

// strip the Node-only export block from the core
const coreBody = core.replace(
  /\/\/ Node \+ Tradovate-module compatibility[\s\S]*$/,
  ''
).replace(/^'use strict';$/m, '');

const banner = `/*
 * TraderMachell -- Tradovate custom indicator
 * Dale volume-profile model with backtest-earned evidence tags.
 * Generated ${new Date().toISOString().slice(0, 10)} by build.js -- do not edit by hand;
 * edit dale_core.js / wrapper.js and rebuild.
 *
 * Core math is regression-verified: identical POC/VAH/VAL to the Python
 * research harness on all 205 GCQ6 sessions (test_core.js), and the
 * wrapper survived a 110k-bar platform simulation under both candidate
 * live-engine models (sim_tradovate.js).
 *
 * HONESTY BOX (provenance of the on-chart grade tags):
 *  - Delta here = offerVolume - bidVolume (all the indicator API exposes).
 *    The grades were measured on upVolume - downVolume: corr 0.87, exact
 *    match on 24% of bars. Signature + flow-quit timing may differ a
 *    little from the backtest; levels/profiles are delta-free.
 *  - Grades were measured with NO time-of-day gate; this indicator (like
 *    the MT5 version and the playbook) only signals 09:00-11:00 NY.
 *  - Signals require the prior session to pass the harness liquidity gate
 *    (>= 2000 contracts, >= 120 minutes) -- thin sessions draw levels
 *    flagged [THIN] and stand down, matching how the grades were measured.
 *  - 1-minute bars are the graded configuration; other minute sizes are
 *    scaled approximations and the chart says so.
 *  - Signature/flow-quit volume+range statistics use a trailing ~2-hour
 *    window (live-causal). The backtest used whole-session statistics,
 *    which are impossible without lookahead and, computed causally, made
 *    absorption undetectable in NY hours. Same concept, local calibration.
 *  - No alerts: Tradovate custom indicators cannot fire alerts. This tool
 *    draws; the playbook's alert-driven routine stays on MT5.
 *
 * INSTALL: Tradovate -> Charts module -> Indicators -> Indicator Editor
 * (Code Explorer) -> New Indicator -> replace the template with this whole
 * file -> Save. Add "TraderMachell" to a 1-MINUTE chart of the front-month
 * GC/MGC contract (modern Chart module, not Legacy Chart). Set the chart's
 * "Bars to Load" as high as it allows (the 20-session HTF composite needs
 * deep history; it degrades gracefully and simply omits HTF lines when
 * history is short).
 */
`;

const out = banner + wrapper.replace('/* __CORE_SPLICE__ */', coreBody);
fs.writeFileSync(path.join(__dirname, 'TraderMachell.js'), out);
console.log('wrote TraderMachell.js (' + out.length + ' bytes)');
```

---

## FILE: test_core.js (unchanged)

```javascript
/* Regression test: stream TV_GCQ6_1min.csv through DaleCore and compare
 * every finalized session's POC/VAH/VAL against the Python harness dump
 * (levels_py.json from harness/dump_levels.py). Also sanity-counts signals. */

'use strict';
const fs = require('fs');
const path = require('path');
const { DaleCore } = require('./dale_core.js');

function loadCsv(p) {
  const lines = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const idx = {};
  head.forEach((h, i) => { idx[h] = i; });
  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const ts = c[idx.timestamp];                     // 2026-08-06T22:00Z
    const tMs = Date.parse(ts.endsWith('Z') ? ts : ts + 'Z');
    const uv = parseFloat(c[idx.upVolume] || '0') || 0;
    const dv = parseFloat(c[idx.downVolume] || '0') || 0;
    bars.push({
      tMs,
      o: parseFloat(c[idx.open]), h: parseFloat(c[idx.high]),
      l: parseFloat(c[idx.low]), c: parseFloat(c[idx.close]),
      vol: uv + dv, delta: uv - dv,
    });
  }
  bars.sort((a, b) => a.tMs - b.tMs);
  return bars;
}

const recorded = [];
class RecCore extends DaleCore {
  _finalizeSession() {
    const d = this.day;
    super._finalizeSession();
    const last = this.sessions[this.sessions.length - 1];
    if (last && last.key === d && this.prev)
      recorded.push({ day: d, n: last.bars.length,
        poc: this.prev.poc, vah: this.prev.vah, val: this.prev.val });
  }
}

const bars = loadCsv(path.join(__dirname, '..', 'data_tv', 'TV_GCQ6_1min.csv'));
const core = new RecCore();
for (const b of bars) core.push(b);
core._finalizeSession();   // flush the last session

const py = JSON.parse(fs.readFileSync(path.join(__dirname, 'levels_py.json'), 'utf8'));
const jsBy = new Map(recorded.map(r => [r.day, r]));

let ok = 0, bad = 0, missing = 0;
const TOL = 1e-6;
for (const p of py) {
  const j = jsBy.get(p.day);
  if (!j) { missing++; console.log(`MISSING in JS: ${p.day} (py n=${p.n})`); continue; }
  const dPoc = Math.abs(j.poc - p.poc), dVah = Math.abs(j.vah - p.vah), dVal = Math.abs(j.val - p.val);
  if (dPoc < TOL && dVah < TOL && dVal < TOL && j.n === p.n) ok++;
  else {
    bad++;
    console.log(`MISMATCH ${p.day}: n ${j.n}/${p.n}  dPOC=${dPoc.toExponential(2)} `
      + `dVAH=${dVah.toExponential(2)} dVAL=${dVal.toExponential(2)}`);
  }
}
const extra = recorded.filter(r => !py.some(p => p.day === r.day));
for (const e of extra) console.log(`EXTRA in JS: ${e.day} (n=${e.n})`);

console.log(`\nsessions: py=${py.length} js=${recorded.length}  `
  + `MATCH=${ok}  MISMATCH=${bad}  MISSING=${missing}  EXTRA=${extra.length}`);

const kinds = {};
for (const e of core.events) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
console.log('signals fired while streaming:', JSON.stringify(kinds));
const fq = core.events.length;
console.log(ok === py.length && bad === 0 && missing === 0 && extra.length === 0
  ? 'RESULT: PASS -- JS core reproduces the Python profile math exactly'
  : 'RESULT: FAIL');
```

---

## FILE: sim_tradovate.js (unchanged)

```javascript
/* sim_tradovate.js -- simulate the Tradovate runtime around TraderMachell.js:
 * stream the full GCQ6 dataset through map() with mock bar entities, replay
 * the final bar as a developing bar several times (platform behavior), and
 * verify (a) no exceptions, (b) graphics output, (c) signal count matches a
 * direct DaleCore run, (d) no double-processing of bars. */

'use strict';
const fs = require('fs');
const path = require('path');
const { DaleCore } = require('./dale_core.js');
const mod = require('./TraderMachell.js');

function loadCsv(p) {
  const lines = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const idx = {};
  head.forEach((h, i) => { idx[h] = i; });
  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const ts = c[idx.timestamp];
    const tMs = Date.parse(ts.endsWith('Z') ? ts : ts + 'Z');
    const uv = parseFloat(c[idx.upVolume] || '0') || 0;
    const dv = parseFloat(c[idx.downVolume] || '0') || 0;
    const bv = parseFloat(c[idx.bidVolume] || '0') || 0;
    const ov = parseFloat(c[idx.offerVolume] || '0') || 0;
    bars.push({
      tMs, o: parseFloat(c[idx.open]), h: parseFloat(c[idx.high]),
      l: parseFloat(c[idx.low]), c: parseFloat(c[idx.close]),
      vol: uv + dv, delta: uv - dv, bidv: bv, offv: ov,
    });
  }
  bars.sort((a, b) => a.tMs - b.tMs);
  return bars;
}

function entity(b, isLast, isComplete) {
  return {
    timestamp: () => new Date(b.tMs),
    open: () => b.o, high: () => b.h, low: () => b.l, close: () => b.c,
    value: () => b.c, volume: () => b.vol,
    // platform delta = offerVolume - bidVolume; our CSV's up/down mirrors it
    offerVolume: () => b.offv || Math.max(0, (b.vol + b.delta) / 2),
    bidVolume: () => b.bidv || Math.max(0, (b.vol - b.delta) / 2),
    isLast: () => isLast, isComplete: () => isComplete,
    index: () => -1, tradeDate: () => 0, ticks: () => 0, profile: () => undefined,
  };
}

const bars = loadCsv(path.join(__dirname, '..', 'data_tv', 'TV_GCQ6_1min.csv'));

// ---- reference: direct core run with the wrapper's scaled config ----
// NOTE: fed with the PLATFORM's delta definition (offerVolume - bidVolume),
// which is what the deployed indicator will see. The backtest used
// upVolume - downVolume; on this dataset the two correlate 0.87 and match
// exactly on only 24% of bars -- a documented caveat, not a code issue.
const ref = new DaleCore({ htfSessions: 20 });
for (const b of bars) ref.push(Object.assign({}, b, {
  delta: (b.offv || Math.max(0, (b.vol + b.delta) / 2)) -
         (b.bidv || Math.max(0, (b.vol - b.delta) / 2)),
}));
const refKinds = {};
for (const e of ref.events) refKinds[e.kind] = (refKinds[e.kind] || 0) + 1;

// ---- simulated platform runs, under BOTH candidate live-engine models ----
// Model A: when a bar closes the engine re-maps it once with isComplete=true.
// Model B (the freeze risk the review flagged): closed bars are NEVER
// re-mapped; the engine just starts calling map() for the new developing
// bar. The wrapper's history walk-back must keep the core advancing.
const Calc = mod.calculator;

function makeHistory(entities) {
  return {
    data: entities,
    get: k => entities[k],
    size: () => entities.length,
    prior: () => entities[entities.length - 2],
    back: nn => entities[entities.length - 1 - nn],
    first: () => entities[0],
    last: () => entities[entities.length - 1],
  };
}

function runModel(model, liveTail) {
  const inst = new Calc();
  inst.props = { htfSessions: 20 };
  inst.contractInfo = { contract: 'GCQ6', product: 'GC', tickSize: 0.1 };
  inst.chartDescription = {
    underlyingType: 'MinuteBar', elementSize: 1,
    elementSizeUnit: 'UnderlyingUnits', withHistogram: false,
  };
  inst.init();
  const n = bars.length;
  const histSplit = n - liveTail;      // bars before this arrive as history
  let lastResult = null, threw = 0;
  const ents = [];
  try {
    // initial historical pass: all closed, last one developing
    for (let i = 0; i < histSplit; i++)
      ents.push(entity(bars[i], i === histSplit - 1, i < histSplit - 1));
    for (let i = 0; i < histSplit; i++)
      lastResult = inst.map(ents[i], i, makeHistory(ents.slice(0, i + 1)));
    // live phase: one bar at a time
    for (let i = histSplit; i < n; i++) {
      // previous bar closes
      if (model === 'A') {
        ents[i - 1] = entity(bars[i - 1], false, true);
        lastResult = inst.map(ents[i - 1], i - 1, makeHistory(ents.slice(0, i)));
      } else {
        ents[i - 1] = entity(bars[i - 1], false, true);  // closed in history only
      }
      // new developing bar maps repeatedly, never complete under model B
      ents.push(entity(bars[i], true, false));
      const h = makeHistory(ents.slice(0, i + 1));
      for (let r = 0; r < 2; r++) lastResult = inst.map(ents[i], i, h);
    }
    // final bar completes (model A only)
    if (model === 'A') {
      ents[n - 1] = entity(bars[n - 1], true, true);
      lastResult = inst.map(ents[n - 1], n - 1, makeHistory(ents));
    }
  } catch (e) {
    threw++;
    console.log(`model ${model} THREW: ${e.stack.split('\n').slice(0, 2).join(' | ')}`);
  }
  return { inst, lastResult, threw };
}

const A = runModel('A', 3000);
const B = runModel('B', 3000);
const inst = A.inst;
const lastResult = A.lastResult;
const threw = A.threw + B.threw;
const n = bars.length;

const kindsOf = c => {
  const k = {};
  for (const e of c.events) k[e.kind] = (k[e.kind] || 0) + 1;
  return JSON.stringify(k);
};
console.log('model A signals:', kindsOf(A.inst.core), ' model B signals:', kindsOf(B.inst.core));
console.log('model B froze?  ', B.inst.lastPushedMs === bars[n - 1 - 1].tMs
  ? 'no - core advanced to the final closed bar' : 'YES - FROZEN at ' + B.inst.lastPushedMs);

const simKinds = {};
for (const m of inst.marks) if (m.ev.kind !== 'flowquit')
  simKinds[m.ev.kind] = (simKinds[m.ev.kind] || 0) + 1;
const coreKinds = {};
for (const e of inst.core.events) coreKinds[e.kind] = (coreKinds[e.kind] || 0) + 1;

const items = lastResult && lastResult.graphics ? lastResult.graphics.items : [];
const keys = items.map(x => x.key);
const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
const badItems = items.filter(x => x.tag === 'Text'
  ? !(x.style && x.style.fontSize && x.style.fill) : false);

console.log('bars streamed:            ', n);
console.log('exceptions:               ', threw);
console.log('reference core signals:   ', JSON.stringify(refKinds));
console.log('model A wrapper signals:  ', JSON.stringify(coreKinds));
console.log('graphics items on last bar:', items.length,
  ' tags:', JSON.stringify([...new Set(items.map(x => x.tag))]));
console.log('duplicate keys:           ', dupKeys.length ? dupKeys : 'none');
console.log('Text items missing style: ', badItems.length);

const bFroze = B.inst.lastPushedMs !== bars[n - 2].tMs;
const pass = threw === 0 &&
  JSON.stringify(refKinds) === JSON.stringify(coreKinds) &&
  kindsOf(A.inst.core) === kindsOf(B.inst.core) &&
  !bFroze && items.length > 0 && dupKeys.length === 0 && badItems.length === 0;
console.log(pass ? '\nRESULT: PASS (both engine models)' : '\nRESULT: FAIL');
```

---

## FILE: sim_synth.js (NEW — CSV-free rendering-invariant sim)

```javascript
/* sim_synth.js -- CSV-free platform simulation for the VISUAL layer.
 *
 * test_core.js / sim_tradovate.js need the owner's GCQ6 dataset; this sim
 * generates deterministic synthetic GC-like sessions instead, so anyone can
 * run the wrapper's rendering invariants after a display change:
 *
 *   node build.js && node sim_synth.js
 *
 * Streams ~12 sessions of 1-min bars through the BUILT TraderMachell.js
 * under BOTH candidate live-engine models (A: closed bars re-mapped once
 * with isComplete=true; B: closed bars never re-mapped), then asserts:
 *   1. no exceptions, model B core not frozen;
 *   2. graphics on the last bar: unique keys, Text items all styled
 *      (fontSize+fill), no mixed-unit op() on any X coordinate;
 *   3. rectangle rows: positive du widths/heights only (negative-width
 *      rects are not in the proven-to-render set);
 *   4. VERTICAL ALIGNMENT: the prev-profile POC row straddles the core's
 *      exact POC price; every prev-profile row lies inside the profile's
 *      true price span; the value-area band spans exactly VAL..VAH;
 *   5. HTF ghost rows anchor at x0 - width (true left mirror);
 *   6. right-edge labels: no two occupy the same (price, dy) slot --
 *      the de-collision layout did its job.
 *
 * Uses the ./tools dev stubs (Node-only). NOT a substitute for
 * test_core.js / sim_tradovate.js on the real dataset. */

'use strict';
const mod = require('./TraderMachell.js');

// ---- deterministic synthetic GCQ6-like 1-min sessions -------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function synthBars() {
  const rnd = mulberry32(20260809);
  const bars = [];
  // sessions open 17:00 ET (21:00 UTC in August DST) and run 23h
  let t = Date.parse('2026-07-19T21:00:00Z');
  let price = 3390;
  for (let s = 0; s < 12; s++) {
    const sessionDrift = (rnd() - 0.5) * 4;
    for (let m = 0; m < 1380; m++) {
      const hourUTC = new Date(t).getUTCHours();
      const ny = hourUTC >= 13 && hourUTC < 17;        // NY morning-ish
      const volBase = ny ? 120 : 25;
      const amp = ny ? 0.5 : 0.2;
      const o = price;
      const c = price + (rnd() - 0.5) * amp + sessionDrift / 1380;
      const h = Math.max(o, c) + rnd() * amp * 0.6;
      const l = Math.min(o, c) - rnd() * amp * 0.6;
      const vol = Math.round(volBase * (0.5 + rnd()));
      const dlt = Math.round((rnd() - 0.5) * vol * 0.6);
      bars.push({ tMs: t, o, h, l, c,
        vol, offv: Math.max(0, (vol + dlt) / 2), bidv: Math.max(0, (vol - dlt) / 2) });
      price = c;
      t += 60e3;
    }
    t += 60 * 60e3;                                    // 1h maintenance halt
  }
  return bars;
}

function entity(b, isLast, isComplete) {
  return {
    timestamp: () => new Date(b.tMs),
    open: () => b.o, high: () => b.h, low: () => b.l, close: () => b.c,
    value: () => b.c, volume: () => b.vol,
    offerVolume: () => b.offv, bidVolume: () => b.bidv,
    isLast: () => isLast, isComplete: () => isComplete,
    index: () => -1, tradeDate: () => 0, ticks: () => 0, profile: () => undefined,
  };
}
function makeHistory(entities) {
  return {
    data: entities,
    get: k => entities[k],
    size: () => entities.length,
    prior: () => entities[entities.length - 2],
    back: nn => entities[entities.length - 1 - nn],
    first: () => entities[0],
    last: () => entities[entities.length - 1],
  };
}

const bars = synthBars();
const Calc = mod.calculator;

function runModel(model, liveTail, props) {
  const inst = new Calc();
  inst.props = props || { htfSessions: 20, alignTest: 1 };
  inst.contractInfo = { contract: 'GCQ6', product: 'GC', tickSize: 0.1 };
  inst.chartDescription = {
    underlyingType: 'MinuteBar', elementSize: 1,
    elementSizeUnit: 'UnderlyingUnits', withHistogram: false,
  };
  inst.init();
  const n = bars.length;
  const histSplit = n - liveTail;
  let lastResult = null, threw = 0;
  const ents = [];
  try {
    for (let i = 0; i < histSplit; i++)
      ents.push(entity(bars[i], i === histSplit - 1, i < histSplit - 1));
    for (let i = 0; i < histSplit; i++)
      lastResult = inst.map(ents[i], i, makeHistory(ents.slice(0, i + 1)));
    for (let i = histSplit; i < n; i++) {
      if (model === 'A') {
        ents[i - 1] = entity(bars[i - 1], false, true);
        lastResult = inst.map(ents[i - 1], i - 1, makeHistory(ents.slice(0, i)));
      } else {
        ents[i - 1] = entity(bars[i - 1], false, true);
      }
      ents.push(entity(bars[i], true, false));
      const h = makeHistory(ents.slice(0, i + 1));
      for (let r = 0; r < 2; r++) lastResult = inst.map(ents[i], i, h);
    }
    if (model === 'A') {
      ents[n - 1] = entity(bars[n - 1], true, true);
      lastResult = inst.map(ents[n - 1], n - 1, makeHistory(ents));
    }
  } catch (e) {
    threw++;
    console.log(`model ${model} THREW: ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
  }
  return { inst, lastResult, threw };
}

const A = runModel('A', 2000);
const B = runModel('B', 2000);
const n = bars.length;
const items = A.lastResult && A.lastResult.graphics ? A.lastResult.graphics.items : [];
const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };

check(A.threw === 0 && B.threw === 0, 'exceptions thrown');
check(B.inst.lastPushedMs === bars[n - 2].tMs, 'model B core froze');
check(items.length > 0, 'no graphics items on last bar');

// -- key/style hygiene + no mixed-unit X coords --
const keys = items.map(x => x.key);
check(new Set(keys).size === keys.length,
  'duplicate keys: ' + keys.filter((k, i) => keys.indexOf(k) !== i).join(','));
check(items.filter(x => x.tag === 'Text' &&
  !(x.style && x.style.fontSize && x.style.fill)).length === 0,
  'Text items missing style');
const xOfPoint = p => p && p.x;
for (const it of items) {
  const pts = [];
  if (it.tag === 'Text') pts.push(xOfPoint(it.point));
  if (it.tag === 'LineSegments')
    for (const ln of it.lines) { pts.push(xOfPoint(ln.a), xOfPoint(ln.b)); }
  if (it.tag === 'Shapes')
    for (const pr of it.primitives) pts.push(xOfPoint(pr.position));
  for (const p of pts)
    check(!p || p.unit !== 'op', 'mixed-unit op() on an X coordinate: ' + it.key);
  check(!(it.lineStyle && 'opacity' in it.lineStyle), 'lineStyle.opacity used: ' + it.key);
}

// -- rectangles: positive sizes only --
const rectsOf = key => {
  const it = items.find(x => x.key === key);
  return it ? it.primitives : [];
};
for (const it of items) {
  if (it.tag !== 'Shapes') continue;
  for (const pr of it.primitives) {
    check(pr.size.width.v > 0, 'non-positive rect width in ' + it.key);
    check(pr.size.height.v > 0, 'non-positive rect height in ' + it.key);
  }
}

// -- vertical alignment: prev-profile POC row must straddle the exact POC --
const core = A.inst.core;
const span = pr => {
  const lo = pr.position.y.v;             // RECT_Y_ANCHOR === 'bottom'
  return [lo, lo + pr.size.height.v];
};
const pocRects = rectsOf('pproP');
check(pocRects.length > 0, 'no POC row in prev profile');
if (pocRects.length) {
  const [lo, hi] = span(pocRects[0]);
  check(lo <= core.prev.poc && core.prev.poc <= hi,
    `POC row [${lo.toFixed(2)},${hi.toFixed(2)}] misses POC ${core.prev.poc.toFixed(2)}`);
}
const profLo = core.prev.lo;
let profHi = -Infinity;
for (const k of core.prev.vol.keys())
  profHi = Math.max(profHi, core.prev.lo + (k + 1) * core.prev.step);
for (const k of ['pproM', 'pproV', 'pproP'])
  for (const pr of rectsOf(k)) {
    const [lo, hi] = span(pr);
    check(lo >= profLo - core.prev.step && hi <= profHi + core.prev.step,
      `prev row [${lo.toFixed(2)},${hi.toFixed(2)}] outside profile span`);
  }

// -- value-area band spans exactly VAL..VAH --
const vaB = rectsOf('vaB');
check(vaB.length === 1, 'value-area band missing');
if (vaB.length) {
  const [lo, hi] = span(vaB[0]);
  check(Math.abs(lo - core.prev.val) < 1e-9 && Math.abs(hi - core.prev.vah) < 1e-9,
    'value-area band does not span VAL..VAH');
}

// -- HTF ghost: left-anchored mirror, x + width never crosses right of x0 --
const dayItem = items.find(x => x.key === 'pocL');
const x0 = dayItem ? dayItem.lines[0].a.x.v : null;
for (const k of ['hproM', 'hproV', 'hproP'])
  for (const pr of rectsOf(k))
    check(pr.position.x.v + pr.size.width.v <= x0 + 1e-9,
      'HTF ghost row crosses right of the session start');

// -- labels: no two share the same (price, dy) slot --
const lxItems = items.filter(x => x.tag === 'Text' && !x.origin &&
  x.textAlignment === 'rightMiddle');
check(lxItems.length > 0, 'no right-edge labels');
const slots = new Set();
for (const t of lxItems) {
  const y = t.point.y;
  const slot = y.unit === 'op' ? `${y.a.v}@${y.b.v}` : `${y.v}@0`;
  check(!slots.has(slot), 'label collision at slot ' + slot + ' (' + t.key + ')');
  slots.add(slot);
}

// -- alignment self-test row present and centered on PREV POC --
const aln = rectsOf('alnR');
check(aln.length === 1, 'alignTest row missing');
if (aln.length) {
  const [lo, hi] = span(aln[0]);
  check(Math.abs((lo + hi) / 2 - core.prev.poc) < 1e-9,
    'alignTest row not centered on PREV POC');
}

// -- part 2: forced-worst-case frame -----------------------------------
// The random walk rarely fires the signal machines or packs levels close
// enough to collide, so fabricate both on the surviving instance and
// rebuild the frame: levels within fractions of an ATR of each other,
// plus signal/absorption/flow-quit marks in the current session.
{
  const inst = A.inst;
  const out = inst.lastOut;
  const atr = out.atr || 1;
  const poc = out.prev.poc;
  out.prev = { poc, vah: poc + 0.1 * atr, val: poc - 0.1 * atr, liquid: true };
  out.htf = { poc: poc + 0.05 * atr, vah: poc + 0.15 * atr,
    val: poc - 0.15 * atr, sessions: 12 };
  out.nakedPocs = [
    { poc: poc + 0.02 * atr, endTms: inst.tmsList[inst.tmsList.length - 300] },
    { poc: poc - 0.03 * atr, endTms: inst.tmsList[inst.tmsList.length - 600] },
  ];
  out.leg = { level: poc + 0.07 * atr, down: false };
  const sigT = inst.tmsList[inst.tmsList.length - 50];
  const abT = inst.tmsList[inst.tmsList.length - 80];
  inst.marks.push(
    { tMs: abT, price: poc, day: out.day, ev: { kind: 'absorb', long: true } },
    { tMs: sigT, price: poc, day: out.day,
      ev: { kind: 'prior-poc', tMs: sigT, day: out.day, long: true,
        entry: poc, sl: poc - 0.12 * atr, tp: poc + 0.08 * atr, level: poc,
        tag: '[stack tested +0.40R/80% n10]', htf: '[HTF aligned]' } },
    { tMs: inst.tmsList[inst.tmsList.length - 20], price: poc, day: out.day,
      ev: { kind: 'flowquit' } });
  const lastEnt = entity(bars[n - 1], true, true);
  const items2 = inst.buildItems(lastEnt, n - 1, null);
  const keys2 = items2.map(x => x.key);
  check(new Set(keys2).size === keys2.length, 'part2: duplicate keys');
  check(items2.filter(x => x.tag === 'Text' &&
    !(x.style && x.style.fontSize && x.style.fill)).length === 0,
    'part2: Text items missing style');
  const lab2 = items2.filter(x => x.tag === 'Text' && !x.origin &&
    x.textAlignment === 'rightMiddle');
  // 11 clustered labels: PREV POC/VAH/VAL, 2 NPOC, HTF POC/VAH/VAL, LEG, TP, SL
  check(lab2.length === 11, 'part2: expected 11 labels, got ' + lab2.length);
  const slots2 = new Set();
  let stacked = 0;
  for (const t of lab2) {
    const y = t.point.y;
    const slot = y.unit === 'op' ? `${y.a.v}@${y.b.v}` : `${y.v}@0`;
    check(!slots2.has(slot), 'part2: label collision at ' + slot + ' (' + t.key + ')');
    slots2.add(slot);
    if (y.unit === 'op') stacked++;
  }
  check(stacked >= 10, 'part2: clustered labels were not fanned apart');
  check(items2.some(x => x.key.startsWith('sgA')), 'part2: signal arrow missing');
  check(items2.some(x => x.key === 'abT'), 'part2: absorption label missing');
  check(items2.some(x => x.key === 'tpL') && items2.some(x => x.key === 'slL'),
    'part2: TP/SL rays missing');
  console.log('part2 forced frame:         ' + items2.length + ' items, ' +
    lab2.length + ' labels, ' + stacked + ' fanned');
}

// -- part 3: px fallback mode (scaledWidths=0, the v2 proven path) ------
{
  const P = runModel('A', 500, { htfSessions: 20, scaledWidths: 0 });
  const it3 = P.lastResult && P.lastResult.graphics ? P.lastResult.graphics.items : [];
  check(P.threw === 0, 'part3: px mode threw');
  check(it3.length > 0, 'part3: px mode drew nothing');
  for (const it of it3) {
    if (it.tag !== 'Shapes') continue;
    check(!it.key.startsWith('hpro'),
      'part3: HTF ghost drawn in px mode (needs unproven negative widths)');
    check(it.key !== 'vaB', 'part3: du-width VA band drawn in px mode');
    for (const pr of it.primitives) {
      check(pr.size.width.unit === 'px' && pr.size.width.v > 0,
        'part3: non-px or non-positive row width in ' + it.key);
      check(pr.size.height.v > 0, 'part3: non-positive rect height in ' + it.key);
    }
  }
  console.log('part3 px-fallback frame:    ' + it3.length + ' items');
}

const kindsOf = c => {
  const k = {};
  for (const e of c.events) k[e.kind] = (k[e.kind] || 0) + 1;
  return JSON.stringify(k);
};
console.log('bars streamed:             ', n);
console.log('model A signals:           ', kindsOf(A.inst.core));
console.log('model B signals:           ', kindsOf(B.inst.core));
check(kindsOf(A.inst.core) === kindsOf(B.inst.core), 'A/B signal mismatch');
console.log('graphics items on last bar:', items.length,
  ' tags:', JSON.stringify([...new Set(items.map(x => x.tag))]));
console.log('right-edge labels:         ', lxItems.length);

if (fails.length) {
  for (const f of fails) console.log('FAIL:', f);
  console.log('\nRESULT: FAIL');
  process.exit(1);
}
console.log('\nRESULT: PASS (rendering invariants, both engine models)');
```

---

## FILE: tools/predef.js (NEW — Node dev stub, never pasted into Tradovate)

```javascript
/* DEV STUB (Node only -- never pasted into Tradovate). */
'use strict';
module.exports = {
  paramSpecs: {
    period: n => ({ type: 'period', def: n }),
    number: (d, step, min) => ({ type: 'number', def: d, step, min }),
    bool: d => ({ type: 'bool', def: d }),
  },
};
```

---

## FILE: tools/meta.js (NEW — Node dev stub, never pasted into Tradovate)

```javascript
/* DEV STUB (Node only -- never pasted into Tradovate). */
'use strict';
module.exports = {
  InputType: { BARS: 'bars' },
  AreaChoice: { OVERLAY: 'overlay' },
};
```

---

## FILE: tools/graphics.js (NEW — Node dev stub, never pasted into Tradovate)

```javascript
/* DEV STUB (Node only -- never pasted into Tradovate). Mirrors the shape of
 * the platform's ./tools/graphics helpers just enough for the Node sims to
 * construct and inspect graphics items. */
'use strict';
module.exports = {
  du: v => ({ unit: 'du', v }),
  px: v => ({ unit: 'px', v }),
  op: (a, o, b) => ({ unit: 'op', op: o, a, b }),
};
```

---

## FILE: TraderMachell.js (BUILT ARTIFACT — regenerated, paste this into Tradovate)

```javascript
/*
 * TraderMachell -- Tradovate custom indicator
 * Dale volume-profile model with backtest-earned evidence tags.
 * Generated 2026-08-09 by build.js -- do not edit by hand;
 * edit dale_core.js / wrapper.js and rebuild.
 *
 * Core math is regression-verified: identical POC/VAH/VAL to the Python
 * research harness on all 205 GCQ6 sessions (test_core.js), and the
 * wrapper survived a 110k-bar platform simulation under both candidate
 * live-engine models (sim_tradovate.js).
 *
 * HONESTY BOX (provenance of the on-chart grade tags):
 *  - Delta here = offerVolume - bidVolume (all the indicator API exposes).
 *    The grades were measured on upVolume - downVolume: corr 0.87, exact
 *    match on 24% of bars. Signature + flow-quit timing may differ a
 *    little from the backtest; levels/profiles are delta-free.
 *  - Grades were measured with NO time-of-day gate; this indicator (like
 *    the MT5 version and the playbook) only signals 09:00-11:00 NY.
 *  - Signals require the prior session to pass the harness liquidity gate
 *    (>= 2000 contracts, >= 120 minutes) -- thin sessions draw levels
 *    flagged [THIN] and stand down, matching how the grades were measured.
 *  - 1-minute bars are the graded configuration; other minute sizes are
 *    scaled approximations and the chart says so.
 *  - Signature/flow-quit volume+range statistics use a trailing ~2-hour
 *    window (live-causal). The backtest used whole-session statistics,
 *    which are impossible without lookahead and, computed causally, made
 *    absorption undetectable in NY hours. Same concept, local calibration.
 *  - No alerts: Tradovate custom indicators cannot fire alerts. This tool
 *    draws; the playbook's alert-driven routine stays on MT5.
 *
 * INSTALL: Tradovate -> Charts module -> Indicators -> Indicator Editor
 * (Code Explorer) -> New Indicator -> replace the template with this whole
 * file -> Save. Add "TraderMachell" to a 1-MINUTE chart of the front-month
 * GC/MGC contract (modern Chart module, not Legacy Chart). Set the chart's
 * "Bars to Load" as high as it allows (the 20-session HTF composite needs
 * deep history; it degrades gracefully and simply omits HTF lines when
 * history is short).
 */
/*
 * wrapper.js -- the Tradovate custom-indicator shell around DaleCore.
 * NOT used directly: build.js splices dale_core.js + this file into
 * TraderMachell.js (the single module you paste into Tradovate's
 * Indicator Editor).
 *
 * VISUAL SUITE (v3 -- alignment + legibility overhaul, modeled on Trader
 * Dale's software look):
 *  - PREV-SESSION VOLUME PROFILE: teal horizontal histogram growing right
 *    from the session start; rows sit exactly on their price span (the
 *    exact row pitch carried by the core is used -- no re-estimation);
 *    value-area rows brighter; POC row gold; whisper-alpha VALUE-AREA BAND
 *    from VAL to VAH across the session so value reads at a glance.
 *  - HTF COMPOSITE PROFILE: dark-gold ghost histogram growing LEFT from
 *    the session start (true mirror -- left-anchored positive-width rects,
 *    never negative widths), + thick POC ray, dashed VAH/VAL.
 *  - ZOOM-SCALING WIDTHS: histogram rows are sized in du (bar-index)
 *    units by default so profiles scale with the chart like the reference
 *    software. `scaledWidths=false` falls back to the px-width mode that
 *    is empirically PROVEN to render (see fallback notes below).
 *  - RIGHT-EDGE LABEL COLUMN: labels extend RIGHT of the last bar into
 *    empty margin (rightMiddle -- the platform's leftMiddle extends text
 *    LEFT, over the candles: that was v2's biggest legibility bug), and
 *    run through a de-collision pass that stacks labels of nearby levels
 *    at a fixed pixel pitch so they can never sit on each other.
 *  - ACCUM rotation: gold box outline + gold histogram + level ray.
 *  - LEG cluster ray (untested tag).
 *  - MARKS with noise control: absorption/flow-quit stamps only for the
 *    CURRENT session; older signals shrink to bare arrows (set
 *    showHistory=true to label them again). Evidence tags are verbatim.
 *  - SESSION START marker: subtle dashed vertical line at the day anchor,
 *    so a wrong time anchor is visible immediately.
 *  - ALIGNMENT SELF-TEST (alignTest=true): draws a magenta test row
 *    centered on PREV POC through the same code path as every histogram
 *    row. The white POC ray must bisect it. If the row sits entirely
 *    ABOVE the ray, the platform's Rectangle y-anchor is top-left: set
 *    RECT_Y_ANCHOR to "top" below (one line) and every row is fixed.
 *  - STATUS BANNER pinned to the viewport top-left (always visible),
 *    fixed line slots (no jumping), second line of key level numbers.
 *
 * Platform facts (verified): graphics via map() return on d.isLast();
 * LineSegments (+infiniteEnd rays), Text (needs fontSize+fill), du/px/op
 * coordinate helpers, origin{cs:'frame'} pins to viewport; leftMiddle
 * extends text LEFT of the point, rightMiddle extends RIGHT; mixed-unit
 * op() on the X axis of Line endpoints does not render; lineStyle.opacity
 * kills the group (alpha lives inside rgba strings); graphics do not
 * stretch autoscale; intra-bar state rolls back to last closed bar, so
 * bars are committed once via the lastPushedMs guard + history walk-back
 * (correct under both candidate live-engine models).
 */

/*
 * dale_core.js -- platform-independent core of the TraderDalePOC model,
 * ported from TraderDalePOC.mq5 v5.11 + the Python research harness
 * (dale_tv.py / dale_of2.py / dale_v5.py).
 *
 * Everything here is pure JS with no Tradovate API dependency, so the exact
 * same code can be (a) regression-tested in Node against the Python harness
 * on the GCQ6 dataset, and (b) wrapped in a Tradovate custom-indicator
 * module. Bars stream in one at a time (no lookahead).
 *
 * Bar shape: { tMs, o, h, l, c, vol, delta }
 *   tMs   = bar START time, UTC milliseconds
 *   vol   = real traded volume (d.volume() on Tradovate)
 *   delta = on Tradovate: offerVolume() - bidVolume(). DISCLOSURE: the
 *           backtest grades below were measured on upVolume - downVolume
 *           (the market-data API's uptick/downtick split), which the
 *           indicator runtime does not expose. On the test data the two
 *           correlate 0.87 and match exactly on 24% of bars -- a close
 *           cousin, not the same number. Only the prior-POC signature and
 *           flow-quit consume delta; profiles/levels are delta-free.
 *
 * Grades carried from the backtests (GCQ6 real volume, 86 sessions):
 *   prior-POC + signature + reaction stop : +0.40R, 80% win, n=10  [tested]
 *   ACCUM rotation retest                 : +0.28R, 75% win, n=12  [tested]
 *   LEG cluster retest                    : 0 completions          [untested]
 *   HTF alignment                         : contradictory -> tag only
 */



// ---- defaults (mirror the v5.11 inputs) ---------------------------------
const CFG = {
  rows: 80,            // price rows per profile
  vaPct: 0.70,         // value area
  priorDays: 10,       // prior POCs scanned for targets
  moveAwayATR: 1.0,    // arming distance
  flipBufATR: 0.15,    // close beyond POC = side flip
  lvnFrac: 0.30,       // LVN threshold vs POC row volume
  tpFrontATR: 0.15,    // front-run the target
  sigBars: 15,         // bars after touch to find the signature
  initBars: 5,         // initiative must follow absorption within N bars
  htfSessions: 20,     // sessions merged into the big picture
  legPivot: 12,        // pivot strength
  legMinATR: 0.75,     // min leg size (2.0 was unreachable in backtest)
  legLookback: 600,    // bars scanned for the leg
  accumLookback: 2880, // bars scanned for rotations (2 days)
  accumMinBars: 30,    // min rotation length
  accumMaxRangeATR: 1.5,
  accumBreakATR: 1.0,
  atrWindow: 420,      // 1-min bars ~ ATR(M30,14) horizon
  nyStartHour: 9,      // signal window, New York
  nyEndHour: 11,
  barMinutes: 1,       // chart bar size; scales the ATR factor + session mins
  liquidMinVol: 2000,  // prior session must have traded this to be trusted
  liquidMinBars: 120,  // ...and have this many bars (harness liquidity gate)
  sigStatWindow: 120,  // trailing bars for signature/flow-quit vol+range stats.
  // CALIBRATION NOTE: the backtest computed these medians over the whole
  // session (overnight included). Live+causal that made absorption
  // undetectable during NY hours (overnight medians are tiny), so the port
  // measures churn against the trailing ~2 hours instead -- same concept,
  // locally adaptive, consistent with the MT5 proxy. Disclosed in the banner.
};

// ---- New York time (US DST rule, no Intl dependency) --------------------
// DST: second Sunday of March 07:00 UTC -> first Sunday of November 06:00 UTC.
function nthSundayUtcMs(year, monthIdx, nth) {
  const first = Date.UTC(year, monthIdx, 1);
  const dow = new Date(first).getUTCDay();
  const firstSunday = 1 + ((7 - dow) % 7);
  return Date.UTC(year, monthIdx, firstSunday + 7 * (nth - 1));
}
function nyOffsetHours(tMs) {
  const y = new Date(tMs).getUTCFullYear();
  const dstStart = nthSundayUtcMs(y, 2, 2) + 7 * 3600e3;  // 2nd Sun Mar, 07:00 UTC
  const dstEnd = nthSundayUtcMs(y, 10, 1) + 6 * 3600e3;   // 1st Sun Nov, 06:00 UTC
  return (tMs >= dstStart && tMs < dstEnd) ? -4 : -5;
}
function nyParts(tMs) {
  const off = nyOffsetHours(tMs);
  const d = new Date(tMs + off * 3600e3);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    hour: d.getUTCHours(), dayMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  };
}
// CME session day: rolls at 17:00 New York. Returns "YYYY-MM-DD".
function sessionKey(tMs) {
  const p = nyParts(tMs);
  let dayMs = p.dayMs;
  if (p.hour >= 17) dayMs += 86400e3;
  const d = new Date(dayMs);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}
function inNyWindow(tMs, cfg) {
  const h = nyParts(tMs).hour;
  return h >= cfg.nyStartHour && h < cfg.nyEndHour;
}

// exact floor division matching CPython's float `//` (float_divmod), so bin
// boundaries land identically to the research harness. The final half-step
// correction is CPython's: (x - fmod) / y is mathematically an exact
// multiple of y, so if float rounding left div just under the integer,
// snap up to it.
function floorDiv(x, y) {
  let mod = x % y;                      // JS % on doubles = C fmod (exact)
  let div = (x - mod) / y;
  if (mod !== 0 && ((y < 0) !== (mod < 0))) { mod += y; div -= 1.0; }
  if (div !== 0) {
    const fl = Math.floor(div);
    return (div - fl > 0.5) ? fl + 1 : fl;
  }
  return 0;
}

// ---- volume profile (exact mirror of dale_tv.build_profile) -------------
function buildProfile(bars, step) {
  if (!bars.length || step <= 0 || !Number.isFinite(step)) return null;
  let lo = Infinity, hiAll = -Infinity;
  for (const b of bars) { if (b.l < lo) lo = b.l; if (b.h > hiAll) hiAll = b.h; }
  // degenerate-step guard: a near-zero ATR (flat overnight bars) can make the
  // grid explode; a real profile is ~80-160 rows, so thousands = garbage in
  if ((hiAll - lo) / step > 5000) return null;
  const gridLo = lo - 40 * step;
  const vol = new Map();
  let total = 0;
  for (const b of bars) {
    const a = floorDiv(b.l - gridLo, step);
    const z = floorDiv(b.h - gridLo, step);
    const share = z >= a ? b.vol / (z - a + 1) : b.vol;
    for (let k = a; k <= z; k++) vol.set(k, (vol.get(k) || 0) + share);
    total += b.vol;
  }
  if (!vol.size || total <= 0) return null;
  let pocRow = null, pocV = -1;
  for (const [k, v] of vol) if (v > pocV) { pocV = v; pocRow = k; }
  const poc = gridLo + (pocRow + 0.5) * step;
  const need = total * CFG.vaPct;
  let acc = vol.get(pocRow), up = pocRow, dn = pocRow;
  while (acc < need) {
    const a = vol.get(up + 1) || 0, b = vol.get(dn - 1) || 0;
    if (a <= 0 && b <= 0) break;
    if (a >= b) { up += 1; acc += a; } else { dn -= 1; acc += b; }
  }
  return {
    lo: gridLo, step, poc, pocRow,
    vah: gridLo + (up + 1) * step, val: gridLo + dn * step, vol,
  };
}

function stopBehindLVN(prof, forLong, atr) {
  const pv = prof.vol.get(prof.pocRow) || 0;
  const { lo, step, vol } = prof;
  if (forLong) {
    const k0 = floorDiv(prof.val - lo, step);
    for (let k = k0 - 1; k > k0 - 60; k--)
      if ((vol.get(k) || 0) < CFG.lvnFrac * pv) return lo + k * step - 0.10 * atr;
    return prof.val - 0.60 * atr;
  }
  // audit fix: start at k0 (the first bin above the VAH). The graded
  // harness carried a one-bin skip here (short stops one bin farther);
  // corrected for live use -- difference is at most one profile row.
  const k0 = floorDiv(prof.vah - lo, step);
  for (let k = k0; k < k0 + 60; k++)
    if ((vol.get(k) || 0) < CFG.lvnFrac * pv) return lo + (k + 1) * step + 0.10 * atr;
  return prof.vah + 0.60 * atr;
}

// ---- display helper: downsample a profile into <=N drawable rows --------
// Each row: { price, frac (0..1 of max volume), inVA, isPoc }
function displayRows(prof, N, maxPrice) {
  const keys = [...prof.vol.keys()].sort((a, b) => a - b);
  if (!keys.length) return null;
  const kLo = keys[0], kHi = keys[keys.length - 1];
  const span = kHi - kLo + 1;
  const group = Math.max(1, Math.ceil(span / N));
  const out = [];
  let vmax = 0;
  for (let g = kLo; g <= kHi; g += group) {
    // audit fix: clip the final (possibly partial) group before centering
    const kEnd = Math.min(g + group - 1, kHi);
    let v = 0;
    for (let k = g; k <= kEnd; k++) v += prof.vol.get(k) || 0;
    const price = prof.lo + ((g + kEnd + 1) / 2) * prof.step;
    // audit fix: skip the exact-edge overhang bin above the session high
    // (buildProfile parity with the graded harness is preserved; the clamp
    // is display-only)
    if (maxPrice !== undefined && prof.lo + g * prof.step >= maxPrice) continue;
    const isPoc = prof.pocRow >= g && prof.pocRow <= kEnd;
    const inVA = price >= prof.val && price <= prof.vah;
    out.push({ price, v, inVA, isPoc, h: group * prof.step });
    if (v > vmax) vmax = v;
  }
  if (vmax <= 0) return null;
  for (const r of out) { r.frac = r.v / vmax; delete r.v; }
  return out;
}

// ---- small helpers ------------------------------------------------------
function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pctile(a, p) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

// ---- the streaming core -------------------------------------------------
class DaleCore {
  constructor(cfg) {
    this.cfg = Object.assign({}, CFG, cfg || {});
    this.day = null;          // current session key
    this.dayBars = [];        // bars of the current session
    this.recent = [];         // rolling window (accumLookback) across sessions
    this.sessions = [];       // finalized sessions: {key, bars} (last htfSessions kept)
    this.prev = null;         // prior-session profile
    this.prevLiquid = false;  // prior session passed the harness liquidity gate
    this.priorPocs = [];      // recent prior POCs (targets)
    this.naked = [];          // untested session POCs (Dale's naked-POC rays)
    this.htf = null;          // composite profile {poc, vah, val}
    this.atr = 0;
    this._resetDayState();
    this.events = [];         // signal events accumulated over the run
  }

  _resetDayState() {
    // prior-POC machine (v5.11 FireSignal + SignatureScan semantics)
    this.poc = {
      side: null, wasOut: false, armed: false, maxd: 0, flipped: false,
      touchedAt: -1, reactExt: null, absorbAt: -1, done: false, fired: false,
    };
    // ACCUM machine (signed retest)
    this.acc = { level: null, prof: null, short: false, key: null,
      wasOut: false, maxd: 0, done: false, indep: false, start: null, end: null };
    // LEG machine (signed retest, v5.11 guards)
    this.leg = { level: null, prof: null, down: false, key: null,
      wasOut: false, maxd: 0, done: false, firedToday: false };
    this.sigLive = null;      // open signal being tracked for flow-quit
  }

  // ---- session roll ----
  _finalizeSession() {
    const minBars = Math.max(10, Math.round(30 / this.cfg.barMinutes));
    if (this.dayBars.length >= minBars) {
      let vol = 0, lo = Infinity, hi = -Infinity;
      for (const b of this.dayBars) { vol += b.vol; if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
      if (vol > 0) {
        const step = Math.max((hi - lo) / this.cfg.rows, 1e-9);
        const prof = buildProfile(this.dayBars, step);
        if (prof) {
          this.prev = prof;
          this._prevRows = displayRows(prof, 40, hi);
          // harness graded signals only when the prior session was liquid;
          // thin sessions still draw levels but are flagged + not traded
          this.prevLiquid = vol >= this.cfg.liquidMinVol &&
            this.dayBars.length >= Math.round(this.cfg.liquidMinBars / this.cfg.barMinutes);
          this.priorPocs.push(prof.poc);
          if (this.priorPocs.length > 50) this.priorPocs.shift();
          this.naked.push({ poc: prof.poc,
            endTms: this.dayBars[this.dayBars.length - 1].tMs, tested: false });
          if (this.naked.length > 12) this.naked.shift();
        }
        this.sessions.push({ key: this.day, bars: this.dayBars,
          startTms: this.dayBars[0].tMs,
          rows: prof ? displayRows(prof, 30, hi) : null });
        if (this.sessions.length > this.cfg.htfSessions) this.sessions.shift();
        this._rebuildHTF();
      }
    }
    this.dayBars = [];
    this._resetDayState();
  }

  _rebuildHTF() {
    if (this.sessions.length < 5) { this.htf = null; this._htfRows = null; return; }
    const all = [];
    for (const s of this.sessions) for (const b of s.bars) all.push(b);
    let lo = Infinity, hi = -Infinity;
    for (const b of all) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
    const step = Math.max((hi - lo) / this.cfg.rows, 1e-9);
    const p = buildProfile(all, step);
    this.htf = p ? { poc: p.poc, vah: p.vah, val: p.val, sessions: this.sessions.length } : null;
    this._htfRows = p ? displayRows(p, 40, hi) : null;
  }

  _updateATR() {
    const w = this.cfg.atrWindow;
    const src = this.recent.length > w ? this.recent.slice(-w) : this.recent;
    if (!src.length) { this.atr = 0; return; }
    let s = 0;
    for (const b of src) s += b.h - b.l;
    // harness definition: mean 1-min range x30. On k-minute bars the
    // equivalent linear scale is x(30/k). Grades were measured on 1-min.
    this.atr = (s / src.length) * (30 / this.cfg.barMinutes);
  }

  htfAligned(isLong, px) {
    if (!this.htf) return null;
    return isLong ? px >= this.htf.poc : px <= this.htf.poc;
  }

  _emit(ev) {
    this.events.push(ev);
    if (this.events.length > 200) this.events.shift();
    return ev;
  }

  // ---- ACCUM detection (mirror of DetectAccumulation / find_rotations) ----
  _detectAccum() {
    const cfg = this.cfg, atr = this.atr;
    const src = this.recent.length > cfg.accumLookback
      ? this.recent.slice(-cfg.accumLookback) : this.recent;
    const n = src.length, L = cfg.accumMinBars;
    if (n < L + 10 || atr <= 0) { this.acc.level = null; return; }
    const thresh = cfg.accumMaxRangeATR * atr, brk = cfg.accumBreakATR * atr;
    let e = n - 1 - L;
    while (e >= L) {
      let wHi = -Infinity, wLo = Infinity;
      for (let i = e - L + 1; i <= e; i++) { if (src[i].h > wHi) wHi = src[i].h; if (src[i].l < wLo) wLo = src[i].l; }
      if (wHi - wLo > thresh) { e -= 5; continue; }
      let s = e - L + 1;
      while (s > 0) {
        const nh = Math.max(wHi, src[s - 1].h), nl = Math.min(wLo, src[s - 1].l);
        if (nh - nl > thresh) break;
        wHi = nh; wLo = nl; s -= 1;
      }
      let up = false, dn = false, ext = 0, comp = -1, dead = false;
      for (let j = e + 1; j < n; j++) {
        const c = src[j].c;
        if (!up && !dn) {
          if (c > wHi + 0.2 * atr) up = true;
          else if (c < wLo - 0.2 * atr) dn = true;
          continue;
        }
        if (up) {
          if (src[j].h - wHi > ext) ext = src[j].h - wHi;
          if (c < wLo - 0.2 * atr) { dead = true; break; }
        } else {
          if (wLo - src[j].l > ext) ext = wLo - src[j].l;
          if (c > wHi + 0.2 * atr) { dead = true; break; }
        }
        if (ext >= brk && comp < 0) comp = j;
      }
      if (comp > 0 && !dead) {
        const step = Math.max((wHi - wLo + 2 * atr) / cfg.rows, 1e-9);
        const prof = buildProfile(src.slice(s, e + 1), step);
        if (prof) {
          const key = src[e].tMs;
          if (key !== this.acc.key) {
            this.acc = { level: prof.poc, prof, short: dn, key,
              wasOut: false, maxd: 0, done: false,
              start: src[s].tMs, end: src[e].tMs, indep: false,
              winHi: wHi, winLo: wLo, rows: displayRows(prof, 30) };
          } else {
            this.acc.level = prof.poc; this.acc.prof = prof; this.acc.short = dn;
            this.acc.winHi = wHi; this.acc.winLo = wLo;
            // audit fix: keep the display state in sync with the level
            this.acc.rows = displayRows(prof, 30);
            this.acc.start = src[s].tMs;
          }
          return;
        }
      }
      e = s - 5;
    }
    this.acc.level = null;
  }

  // ---- LEG detection (mirror of Leg2Update discovery, v5.11 guards) ----
  _detectLeg() {
    const cfg = this.cfg, atr = this.atr;
    const src = this.recent.length > cfg.legLookback
      ? this.recent.slice(-cfg.legLookback) : this.recent;
    const n = src.length, k = cfg.legPivot;
    if (n < 100 || atr <= 0) { this.leg.level = null; return; }
    let lastPH = -1, lastPL = -1;
    for (let i = n - 1 - k; i >= k && (lastPH < 0 || lastPL < 0); i--) {
      let ph = true, pl = true;
      for (let j = i - k; j <= i + k && (ph || pl); j++) {
        if (j === i) continue;
        if (src[j].h >= src[i].h) ph = false;
        if (src[j].l <= src[i].l) pl = false;
      }
      if (ph && lastPH < 0) lastPH = i;
      if (pl && lastPL < 0) lastPL = i;
    }
    if (lastPH < 0 || lastPL < 0) { this.leg.level = null; return; }
    const a = Math.min(lastPH, lastPL), b = Math.max(lastPH, lastPL);
    if (b - a < 15) { this.leg.level = null; return; }
    if (Math.abs(src[lastPH].h - src[lastPL].l) < cfg.legMinATR * atr) { this.leg.level = null; return; }
    const step = Math.max((src[lastPH].h - src[lastPL].l + atr) / cfg.rows, 1e-9);
    const prof = buildProfile(src.slice(a, b + 1), step);
    if (!prof) { this.leg.level = null; return; }
    // never duplicate the ACCUM level
    if (this.acc.level !== null && Math.abs(prof.poc - this.acc.level) < 0.30 * atr) {
      this.leg.level = null; return;
    }
    const key = src[b].tMs;
    if (key !== this.leg.key) {
      const fired = this.leg.firedToday;
      this.leg = { level: prof.poc, prof, down: lastPH < lastPL, key,
        wasOut: false, maxd: 0, done: false, firedToday: fired };
    } else {
      this.leg.level = prof.poc; this.leg.prof = prof;
    }
  }

  _target(entry, dirn, atr, rr) {
    let tp;
    const cand = this.priorPocs.slice(-this.cfg.priorDays)
      .filter(p => (p - entry) * dirn > 0.05 * atr);
    if (cand.length) {
      let best = cand[0];
      for (const p of cand) if (Math.abs(p - entry) < Math.abs(best - entry)) best = p;
      tp = best - dirn * this.cfg.tpFrontATR * atr;
    } else {
      tp = entry + dirn * 0.8 * atr;
    }
    // MT5 v5.11 sanity clamp (postdates the dale_of2 grade): never quote a
    // target closer than half the risk
    if (rr > 0 && Math.abs(tp - entry) < 0.5 * rr) tp = entry + dirn * rr;
    return tp;
  }

  _fastApproach(atr) {
    const n = this.dayBars.length;
    if (n < 6 || atr <= 0) return false;
    return Math.abs(this.dayBars[n - 1].c - this.dayBars[n - 6].c) > 0.8 * atr;
  }

  // ---- per-bar update. Call once per CLOSED bar, oldest first. ----
  push(bar) {
    const cfg = this.cfg;
    const key = sessionKey(bar.tMs);
    if (this.day !== null && key !== this.day) this._finalizeSession();
    this.day = key;
    this.dayBars.push(bar);
    this.recent.push(bar);
    if (this.recent.length > cfg.accumLookback + 200) this.recent.shift();
    this._updateATR();

    const out = {
      tMs: bar.tMs, day: key, atr: this.atr,
      dayStartTms: this.dayBars[0].tMs,
      prev: this.prev ? { poc: this.prev.poc, vah: this.prev.vah, val: this.prev.val,
        liquid: this.prevLiquid } : null,
      htf: this.htf, accum: null, leg: null, signal: null, flowQuit: false,
      confluence: false, status: '',
      prevProf: this._prevRows || null, htfRows: this._htfRows || null,
      absorb: false, nakedPocs: null,
      // per-session profiles for the MarketProfile-style display (each
      // session's histogram drawn at its own start, like the MT5 chart)
      sessionProfiles: this.sessions.slice(-6)
        .filter(s => s.rows)
        .map(s => ({ start: s.startTms, rows: s.rows })),
    };
    // Dale's naked-POC rule: a session POC stays drawn (extended right)
    // until price trades back through it
    for (const np of this.naked)
      if (!np.tested && bar.l <= np.poc && bar.h >= np.poc) np.tested = true;
    const nk = this.naked.filter(n => !n.tested);
    if (nk.length) out.nakedPocs = nk.map(n => ({ poc: n.poc, endTms: n.endTms }));
    const atr = this.atr;
    if (atr <= 0) return out;

    this._detectAccum();
    this._detectLeg();
    if (this.acc.level !== null)
      out.accum = { level: this.acc.level, short: this.acc.short,
        start: this.acc.start, end: this.acc.end,
        winHi: this.acc.winHi, winLo: this.acc.winLo, rows: this.acc.rows };
    if (this.leg.level !== null)
      out.leg = { level: this.leg.level, down: this.leg.down };

    // confluence (v5.11 guards: independence + info only)
    if (this.acc.level !== null && this.prev &&
        Math.abs(this.acc.level - this.prev.poc) < 0.30 * atr) {
      const dayStartMs = this.dayBars[0].tMs;
      const indep = this.acc.start >= dayStartMs ||
        (dayStartMs - this.acc.start) * 2 < (this.acc.end - this.acc.start);
      out.confluence = !!indep;
    }

    const px = bar.c;
    const inWin = inNyWindow(bar.tMs, cfg);
    const i = this.dayBars.length - 1;

    // ------- prior-POC machine: touch -> signature -> fire -------
    // gated on prior-session liquidity, matching how the grade was measured
    const P = this.poc;
    if (this.prev && this.prevLiquid && !P.done && this.dayBars.length >= 5) {
      const lvl = this.prev.poc;
      const above = px > lvl;
      if (P.side === null) P.side = above;
      else if (P.side !== above && P.touchedAt < 0) {
        const beyond = P.side ? lvl - px : px - lvl;
        if (!P.flipped && beyond >= cfg.flipBufATR * atr) {
          P.flipped = true; P.side = above;
          P.armed = false; P.wasOut = false; P.maxd = 0;
        }
        // NOTE: MT5 (tick-driven) additionally tracks the side after a flip;
        // in a bar-close-driven port that inverts the approach direction at
        // the touch bar. The GRADED machine (dale_of2, the +0.40R source)
        // takes direction from the PREVIOUS bar's close -- done below.
      }
      if (P.touchedAt < 0) {
        const d = Math.abs(px - lvl);
        if (d > P.maxd) P.maxd = d;
        if (d > 0.10 * atr) P.wasOut = true;
        if (!P.armed && P.maxd >= cfg.moveAwayATR * atr) P.armed = true;
        if (P.armed && P.wasOut && inWin) {
          // graded-exact touch: the bar spans the level; direction = side of
          // the previous bar's close (dale_of2: long = cl[i0-1] > poc)
          const touch = bar.l <= lvl && bar.h >= lvl;
          if (touch && this.dayBars.length >= 2) {
            const sideLong = this.dayBars[this.dayBars.length - 2].c > lvl;
            P.side = sideLong;
            P.touchedAt = i;
            P.reactExt = sideLong ? bar.l : bar.h;
          }
        }
      } else {
        // signature scan on REAL delta (dale_of2 semantics, causal medians)
        P.reactExt = P.side ? Math.min(P.reactExt, bar.l) : Math.max(P.reactExt, bar.h);
        const since = i - P.touchedAt;
        if (since > cfg.sigBars) { P.done = true; }
        else {
          const w = this.dayBars.slice(-cfg.sigStatWindow);
          const vols = w.map(b => b.vol);
          const rngs = w.map(b => b.h - b.l);
          const dmags = w.map(b => Math.abs(b.delta));
          const vmed = median(vols), rmed = median(rngs), d75 = pctile(dmags, 75);
          const long = P.side;
          if (P.absorbAt < 0) {
            const holds = long ? bar.l > lvl - 0.30 * atr : bar.h < lvl + 0.30 * atr;
            if (bar.vol >= 1.3 * vmed && (bar.h - bar.l) <= 0.9 * rmed && holds) {
              P.absorbAt = i;
              out.absorb = true;   // visual: churn/absorption bar at the level
              this._emit({ kind: 'absorb', tMs: bar.tMs, day: key,
                price: long ? bar.l : bar.h, long });
            }
          } else if (i - P.absorbAt > cfg.initBars) {
            P.absorbAt = -1; // absorption expired; keep looking within sigBars
          } else {
            const init = Math.abs(bar.delta) >= d75 &&
              (long ? bar.delta > 0 : bar.delta < 0);
            if (init) {
              P.done = true;
              const entry = bar.c;
              const sl = long ? P.reactExt - 0.10 * atr : P.reactExt + 0.10 * atr;
              const ok = long ? sl < entry : sl > entry;
              if (ok) {
                const dirn = long ? 1 : -1;
                const tp = this._target(lvl, dirn, atr, Math.abs(entry - sl));
                const al = this.htfAligned(long, entry);
                P.fired = true;
                this.sigLive = { long, entry, r: Math.abs(entry - sl), maxFav: 0 };
                out.signal = this._emit({
                  kind: 'prior-poc', tMs: bar.tMs, day: key, long,
                  entry, sl, tp, level: lvl,
                  tag: '[stack tested +0.40R/80% n10]',
                  htf: al === null ? '' : (al ? '[HTF aligned]' : '[HTF against]'),
                  flipped: P.flipped,
                });
              }
            }
          }
        }
      }
    }

    // ------- ACCUM retest (graded semantics: unsigned arming, no kill --
    // this is the machine the [+0.28R/75% n12] grade was measured on and
    // what MT5 v5.11 ships. The proximity + SL sanity guards below postdate
    // the grade; they exist only for bar-close granularity.) -------
    const A = this.acc;
    if (A.level !== null && !A.done) {
      const dAbs = Math.abs(px - A.level);
      if (dAbs > A.maxd) A.maxd = dAbs;
      if (dAbs > 0.10 * atr) A.wasOut = true;
      if (A.maxd >= cfg.moveAwayATR * atr && A.wasOut && inWin) {
        const touch = A.short ? bar.h >= A.level : bar.l <= A.level;
        if (touch) {
          A.done = true;
          if (Math.abs(px - A.level) <= 0.30 * atr) {
            const long = !A.short;
            const sl = stopBehindLVN(A.prof, long, atr);
            const entry = A.level;
            if ((long ? sl < entry : sl > entry) && (long ? px > sl : px < sl)) {
              const dirn = long ? 1 : -1;
              const tp = this._target(entry, dirn, atr, Math.abs(entry - sl));
              const al = this.htfAligned(long, entry);
              out.signal = out.signal || this._emit({
                kind: 'accum', tMs: bar.tMs, day: key, long,
                entry, sl, tp, level: A.level,
                tag: '[tested +0.28R/75% n12]' +
                  (this._fastApproach(atr) ? ' [fast approach - caution]' : ''),
                htf: al === null ? '' : (al ? '[HTF aligned]' : '[HTF against]'),
              });
            }
          }
        }
      }
    }

    // ------- LEG retest (signed, v5.11 guards, untested arm) -------
    const L = this.leg;
    if (L.level !== null && !L.done && !L.firedToday) {
      const dTrend = L.down ? L.level - px : px - L.level;
      if (dTrend > L.maxd) L.maxd = dTrend;
      if (dTrend > 0.10 * atr) L.wasOut = true;
      if (-dTrend > 0.50 * atr) { L.done = true; }
      else if (L.maxd >= cfg.moveAwayATR * atr && L.wasOut && inWin) {
        const touch = L.down ? bar.h >= L.level : bar.l <= L.level;
        if (touch) {
          L.done = true;
          const nearPrior = this.prev && Math.abs(L.level - this.prev.poc) < 0.30 * atr;
          if (Math.abs(px - L.level) <= 0.30 * atr && !nearPrior) {
            const long = !L.down;
            const sl = stopBehindLVN(L.prof, long, atr);
            const entry = L.level;
            if ((long ? sl < entry : sl > entry) && (long ? px > sl : px < sl)) {
              const dirn = long ? 1 : -1;
              const tp = this._target(entry, dirn, atr, Math.abs(entry - sl));
              L.firedToday = true;
              out.signal = out.signal || this._emit({
                kind: 'leg', tMs: bar.tMs, day: key, long,
                entry, sl, tp, level: L.level,
                tag: '[UNTESTED - inert in backtest]' +
                  (this._fastApproach(atr) ? ' [fast approach - caution]' : ''),
                htf: '',
              });
            }
          }
        }
      }
    }

    // ------- status line (mirrors the MT5 status text) -------
    if (!this.prev) out.status = 'waiting: no prior-session profile yet';
    else if (!this.prevLiquid) out.status = 'stand down: prior session too thin to trust';
    else if (this.sigLive) out.status = 'signal live - manage per playbook';
    else if (P.done && P.fired) out.status = 'signal complete for the session';
    else if (P.done && P.touchedAt >= 0)
      out.status = 'stood down: touch had no absorption-initiative signature';
    else if (P.done) out.status = 'done for the session';
    else if (P.touchedAt >= 0) out.status = 'TOUCHED - waiting for absorption-initiative';
    else if (P.armed && inWin)
      out.status = P.side ? 'armed: buy the retest from above' : 'armed: sell the retest from below';
    else if (P.armed) out.status = 'armed - outside the 09:00-11:00 NY window';
    else out.status = 'waiting: price has not moved 1 ATR from the level';

    // ------- flow-quit alert on the open prior-POC signal -------
    if (this.sigLive) {
      const S = this.sigLive;
      const fav = (S.long ? px - S.entry : S.entry - px) / S.r;
      if (fav > S.maxFav) S.maxFav = fav;
      if (fav <= -1 || S.maxFav >= 3) this.sigLive = null;
      else if (S.maxFav >= 0.3) {
        const w = this.dayBars.slice(-cfg.sigStatWindow);
        const vols = w.map(b => b.vol);
        const dmags = w.map(b => Math.abs(b.delta));
        const vmed = median(vols), d90 = pctile(dmags, 90);
        const opp = Math.abs(bar.delta) >= d90 && bar.vol >= 2 * vmed &&
          (S.long ? bar.delta < 0 : bar.delta > 0);
        if (opp) { out.flowQuit = true; this.sigLive = null; }
      }
    }

    return out;
  }
}



const predef = require("./tools/predef");
const meta = require("./tools/meta");
const { px, du, op } = require("./tools/graphics");

// ---- render configuration ------------------------------------------------
// RECT_Y_ANCHOR: which edge of a Rectangle `position.y` names. "bottom"
// matches the one community indicator proven to render (it passes
// priceTop - binSize). If the alignTest row draws ABOVE its ray, the
// platform is top-anchored: flip this to "top". Single source of truth --
// every rectangle in the file goes through vrect()/hrect().
const RECT_Y_ANCHOR = "bottom";
const VIS = {
  rowFill: 0.92,        // row height as fraction of its pitch (hairline gap)
  minRowBars: 0.35,     // du mode: shortest visible row, in bar widths
  minRowPx: 3,          // px mode: shortest visible row, in pixels
  prevMaxBars: 180,     // du mode: longest prev-profile row (1-min bars)
  htfMaxBars: 150,      // du mode: longest HTF ghost row
  sessMaxBars: 110,     // du mode: longest per-session row
  accMaxBars: 110,      // du mode: longest ACCUM row (also capped by box)
  prevMaxPx: 160,       // px fallback widths (the v2 proven values)
  sessMaxPx: 110,
  accMaxPx: 90,
  labelGapPx: 15,       // de-collision stack pitch
  clusterATR: 0.25,     // labels closer than this (in ATR) share a stack
};

const COLORS = {
  profile: "rgba(64,158,186,0.26)",     // teal tails (Dale's look)
  profileVA: "rgba(96,204,236,0.50)",   // brighter inside the value area
  pocRow: "rgba(255,203,54,0.95)",      // gold POC row
  vaBand: "rgba(96,204,236,0.07)",      // whisper value-area band
  sess: "rgba(122,134,170,0.18)",       // historical sessions: muted slate
  sessVA: "rgba(152,164,205,0.32)",
  sessPoc: "rgba(206,213,240,0.72)",
  htfGhost: "rgba(201,150,43,0.22)",    // HTF mirror rows
  htfPocRow: "rgba(201,150,43,0.70)",
  poc: "#FFFFFF", va: "#62A8E8",
  htf: "#C9962B", accum: "#FFD54F", leg: "#26C6DA",
  naked: "#E53935", nakedTxt: "#EF9A9A",
  buy: "#00C853", sell: "#FF5252", tp: "#00C853", sl: "#FF5252",
  absorb: "#FFA500", conflu: "#FF8C00", warn: "#FFA500",
  status: "#E0E0E0", dim: "#9E9E9E",
  dayLine: "rgba(158,158,158,0.45)",
  test: "rgba(255,0,255,0.55)",
};
const FONT = { fontSize: 13, fontWeight: "bold" };
const FONT_SM = { fontSize: 11, fontWeight: "bold" };

// ---- primitive helpers ---------------------------------------------------
function ray(key, x0, price, color, width, dash) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [{ tag: "Line",
      a: { x: du(x0), y: du(price) }, b: { x: du(x0 + 1), y: du(price) },
      infiniteEnd: true }],
    lineStyle: { lineWidth: width, color, lineStyle: dash || 1 },
  };
}
function vline(key, x, pLo, pHi, color, dash) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [{ tag: "Line", a: { x: du(x), y: du(pLo) }, b: { x: du(x), y: du(pHi) } }],
    lineStyle: { lineWidth: 1, color, lineStyle: dash || 3 },
  };
}
function txt(key, x, price, s, color, dyPx, font, align) {
  return {
    tag: "Text", key, global: true,
    point: { x: du(x), y: dyPx ? op(du(price), "-", px(dyPx)) : du(price) },
    text: s,
    style: Object.assign({ fill: color }, font || FONT),
    // rightMiddle extends text to the RIGHT of the anchor (into the empty
    // margin). leftMiddle extends LEFT -- over the candles. Platform fact.
    textAlignment: align || "rightMiddle",
  };
}
function frameTxt(key, xPx, yPx, s, color, font) {
  return {
    tag: "Text", key, global: true,
    point: { x: px(xPx), y: px(yPx) },
    text: s,
    style: Object.assign({ fill: color }, font || FONT),
    textAlignment: "rightMiddle",
    origin: { cs: "frame", h: "left", v: "top" },
  };
}
// the ONLY places a Rectangle's y anchor is decided. pLo/pHi are prices.
function vrect(x, wDu, pLo, pHi) {
  return { tag: "Rectangle",
    position: { x: du(x), y: du(RECT_Y_ANCHOR === "bottom" ? pLo : pHi) },
    size: { width: du(wDu), height: du(pHi - pLo) } };
}
function pxrect(x, wPx, pLo, pHi) {
  return { tag: "Rectangle",
    position: { x: du(x), y: du(RECT_Y_ANCHOR === "bottom" ? pLo : pHi) },
    size: { width: px(wPx), height: du(pHi - pLo) } };
}

// ---- histogram -----------------------------------------------------------
// Shapes->Rectangle rows, the pattern PROVEN to render (Rectangle
// primitives, du heights, alpha baked into rgba colors, global:true under
// isLast()). Each row uses the EXACT pitch carried by the core (r.h) --
// never an estimate -- so rows tile the profile's true price span.
//   duMode=true : widths in bar units (scale with zoom); dir=-1 mirrors
//                 LEFT via left-anchored positive-width rects.
//   duMode=false: px widths (v2 proven mode); leftward growth is NOT
//                 expressible without negative widths (unproven), so
//                 dir=-1 callers must skip in px mode.
function histogram(keyBase, rows, x0, dir, colorMain, colorVA, colorPoc, maxW, duMode) {
  const groups = { main: [], va: [], poc: [] };
  for (const r of rows) {
    if (!(r.frac > 0)) continue;          // no phantom stubs on gap rows
    const h = (r.h || 0) * VIS.rowFill;
    if (!(h > 0)) continue;
    const pLo = r.price - h / 2, pHi = r.price + h / 2;
    let rect;
    if (duMode) {
      const w = Math.max(VIS.minRowBars, r.frac * maxW);
      rect = vrect(dir > 0 ? x0 : x0 - w, w, pLo, pHi);
    } else {
      if (dir < 0) continue;              // negative px widths are unproven
      rect = pxrect(x0, Math.max(VIS.minRowPx, Math.round(r.frac * maxW)), pLo, pHi);
    }
    if (r.isPoc) groups.poc.push(rect);
    else if (r.inVA) groups.va.push(rect);
    else groups.main.push(rect);
  }
  const items = [];
  if (groups.main.length) items.push({ tag: "Shapes", key: keyBase + "M",
    global: true, primitives: groups.main, fillStyle: { color: colorMain } });
  if (groups.va.length) items.push({ tag: "Shapes", key: keyBase + "V",
    global: true, primitives: groups.va, fillStyle: { color: colorVA } });
  if (groups.poc.length) items.push({ tag: "Shapes", key: keyBase + "P",
    global: true, primitives: groups.poc, fillStyle: { color: colorPoc } });
  return items;
}
function box(key, xA, xB, hi, lo, color) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [
      { tag: "Line", a: { x: du(xA), y: du(hi) }, b: { x: du(xB), y: du(hi) } },
      { tag: "Line", a: { x: du(xA), y: du(lo) }, b: { x: du(xB), y: du(lo) } },
      { tag: "Line", a: { x: du(xA), y: du(hi) }, b: { x: du(xA), y: du(lo) } },
      { tag: "Line", a: { x: du(xB), y: du(hi) }, b: { x: du(xB), y: du(lo) } },
    ],
    lineStyle: { lineWidth: 1, color, lineStyle: 3 },
  };
}

// ---- right-edge label column with de-collision -----------------------------
// Collect {key, price, text, color, font} entries, then lay them out top to
// bottom. Labels whose prices sit within clusterATR of each other are drawn
// as one stack fanned around the cluster midpoint at a fixed pixel pitch,
// ordered by price -- close levels can never overprint each other.
function layoutLabels(labels, lx, atr) {
  const eps = Math.max(atr * VIS.clusterATR, 1e-9);
  const sorted = labels.slice().sort((a, b) => b.price - a.price);
  const items = [];
  let c = 0;
  while (c < sorted.length) {
    let e = c;
    while (e + 1 < sorted.length && sorted[e].price - sorted[e + 1].price < eps) e++;
    const cluster = sorted.slice(c, e + 1);
    const mid = (cluster[0].price + cluster[cluster.length - 1].price) / 2;
    const n = cluster.length;
    for (let k = 0; k < n; k++) {
      const dy = ((n - 1) / 2 - k) * VIS.labelGapPx;  // +dy raises the label
      const L = cluster[k];
      items.push(txt(L.key, lx, n > 1 ? mid : L.price, L.text, L.color, dy, L.font));
    }
    c = e + 1;
  }
  return items;
}

class traderMachell {
  init() {
    let barMin = 1;
    const cd = this.chartDescription;
    this.timeBased = !cd || cd.underlyingType === "MinuteBar";
    if (cd && cd.underlyingType === "MinuteBar" && cd.elementSize > 0)
      barMin = cd.elementSize;
    this.barMin = barMin;
    const s = (mins, floor) => Math.max(floor || 5, Math.round(mins / barMin));
    this.core = new DaleCore({
      barMinutes: barMin,
      atrWindow: s(420, 30),
      accumLookback: s(2880, 60),
      accumMinBars: s(30, 5),
      legLookback: s(600, 50),
      legPivot: Math.max(3, Math.round(12 / barMin)),
      sigBars: Math.max(3, Math.round(15 / barMin)),
      initBars: Math.max(2, Math.round(5 / barMin)),
      htfSessions: (this.props && this.props.htfSessions) || 20,
    });
    const p = this.props || {};
    this.optScaled = p.scaledWidths === undefined ? true : !!p.scaledWidths;
    this.optAlignTest = !!p.alignTest;
    this.optHistory = !!p.showHistory;
    // du-mode row caps, rescaled so a "row bar-width" tracks real time when
    // the zoom buttons switch aggregation (Q1 resets the indicator anyway)
    const cap = (b) => Math.max(20, Math.round(b / barMin));
    this.wPrev = cap(VIS.prevMaxBars);
    this.wHtf = cap(VIS.htfMaxBars);
    this.wSess = cap(VIS.sessMaxBars);
    this.wAcc = cap(VIS.accMaxBars);
    this.lastPushedMs = 0;
    this.lastOut = null;
    this.marks = [];              // {tMs, price, day, ev} -- NO indexes stored:
    // the chart PREPENDS bars when older history loads, shifting every
    // absolute index; anchors are resolved from timestamps at draw time
    this.tmsList = [];            // pushed-bar timestamps, in order -- our
    // own mirror of the chart's tail, used to turn timestamps into indexes
    // by offset-from-the-end (immune to prepends AND to platform history
    // indexing quirks)
  }

  _pushEntity(e) {
    const tMs = e.timestamp().getTime();
    if (tMs <= this.lastPushedMs) return;
    this.lastPushedMs = tMs;
    const off = typeof e.offerVolume === "function" ? e.offerVolume() : 0;
    const bid = typeof e.bidVolume === "function" ? e.bidVolume() : 0;
    const bar = {
      tMs, o: e.open(), h: e.high(), l: e.low(), c: e.close(),
      vol: e.volume(), delta: off - bid,
    };
    this.tmsList.push(tMs);
    if (this.tmsList.length > 12000) this.tmsList.splice(0, 2000);
    const out = this.core.push(bar);
    this.lastOut = out;
    if (out.absorb)
      this.marks.push({ tMs, price: bar.c, day: out.day,
        ev: { kind: "absorb", long: this.core.poc.side } });
    if (out.signal)
      this.marks.push({ tMs, price: out.signal.entry, day: out.day, ev: out.signal });
    if (out.flowQuit)
      this.marks.push({ tMs, price: bar.c, day: out.day, ev: { kind: "flowquit" } });
    if (this.marks.length > 60) this.marks.shift();
  }

  map(d, i, history) {
    if (history && typeof history.get === "function" && i > 0) {
      let k = i - 1, backlog = [];
      while (k >= 0 && backlog.length < 500) {
        const e = history.get(k);
        if (!e || typeof e.timestamp !== "function") break;
        if (e.timestamp().getTime() <= this.lastPushedMs) break;
        backlog.push(e);
        k--;
      }
      for (let b = backlog.length - 1; b >= 0; b--)
        this._pushEntity(backlog[b]);
    }
    const complete = typeof d.isComplete === "function" ? d.isComplete() : !d.isLast();
    if (complete) this._pushEntity(d);

    if (!d.isLast()) return {};
    return { graphics: { items: this.buildItems(d, i, history) } };
  }

  // resolve a bar-start timestamp to its CURRENT chart index. The pushed
  // bars are exactly the chart's TAIL (one per closed chart bar, in
  // order), so a timestamp's offset from the end of tmsList equals its
  // offset from the end of the chart -- valid regardless of how many old
  // bars the chart prepends, and using no platform history APIs at all.
  _idxOf(tMs, endIdx, cache) {
    if (cache.has(tMs)) return cache.get(tMs);
    const L = this.tmsList;
    let res;
    if (!L.length || tMs < L[0]) res = undefined;   // older than our mirror
    else {
      let lo = 0, hi = L.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (L[mid] < tMs) lo = mid + 1; else hi = mid;
      }
      res = (L[lo] === tMs) ? endIdx - (L.length - 1 - lo) : undefined;
      if (res !== undefined && res < 0) res = undefined;
    }
    cache.set(tMs, res);
    return res;
  }

  buildItems(d, i, history) {
    const items = [];
    const out = this.lastOut;
    if (!this.timeBased) {
      items.push(frameTxt("tmWarn", 70, 20,
        "TraderMachell: use a time-based (minute) chart", COLORS.warn));
      return items;
    }
    if (!out) return items;
    const duMode = this.optScaled;
    const tcache = new Map();
    // index of the last PUSHED bar: i if the current bar is committed,
    // else i-1 (the developing bar is never pushed)
    const endIdx = this.lastPushedMs === d.timestamp().getTime() ? i : i - 1;
    const idx = t => this._idxOf(t, endIdx, tcache);
    let x0 = idx(out.dayStartTms);
    if (x0 === undefined) x0 = Math.max(0, i - 60);
    const lx = i + 4;                       // label column, right of last bar
    const labels = [];                      // -> layoutLabels at the end
    const lab = (key, price, text, color, font) =>
      labels.push({ key, price, text, color, font });
    const fmt = p => (this.contractInfo && this.contractInfo.tickSize < 0.01)
      ? p.toFixed(3) : p.toFixed(1);

    // ---- status banner, pinned to the viewport (fixed line slots) ----
    items.push(frameTxt("stat1", 70, 18,
      "TraderMachell  |  " + (out.status || ""), COLORS.status));
    if (out.prev)
      items.push(frameTxt("stat2", 70, 36,
        "PREV  POC " + fmt(out.prev.poc) + "   VAH " + fmt(out.prev.vah) +
        "   VAL " + fmt(out.prev.val) +
        (out.htf ? "      HTF POC " + fmt(out.htf.poc) : "      HTF: needs more history"),
        COLORS.dim, FONT_SM));
    const ctx = [];
    if (out.htf) {
      const pxNow = d.close();
      ctx.push("HTF: " + (pxNow > out.htf.vah ? "above value (info, not a gate)"
        : pxNow < out.htf.val ? "below value (info, not a gate)"
          : "inside value (balanced)"));
    }
    if (out.confluence) ctx.push("CONFLUENCE: ACCUM on prev POC [n=1 - untested]");
    if (this.barMin !== 1)
      ctx.push("CAUTION: " + this.barMin + "-min bars - grades measured on 1-min");
    if (ctx.length)
      items.push(frameTxt("stat3", 70, 54, ctx.join("   |   "),
        out.confluence ? COLORS.conflu : (this.barMin !== 1 ? COLORS.warn : COLORS.htf),
        FONT_SM));

    // ---- session start marker (verifies the time anchor at a glance) ----
    if (out.prevProf && out.prevProf.length) {
      let pLo = Infinity, pHi = -Infinity, ph = 0;
      for (const r of out.prevProf) {
        if (r.price < pLo) pLo = r.price;
        if (r.price > pHi) pHi = r.price;
        ph = r.h || ph;
      }
      items.push(vline("dayLn", x0, pLo - ph, pHi + ph, COLORS.dayLine, 3));
    }

    // ---- value-area band (VAL..VAH, whisper alpha, du mode only) ----
    if (duMode && out.prev && i > x0) {
      items.push({ tag: "Shapes", key: "vaB", global: true,
        primitives: [vrect(x0, (i - x0) + 2, out.prev.val, out.prev.vah)],
        fillStyle: { color: COLORS.vaBand } });
    }

    // ---- HTF composite (dark gold ghost, true mirror: grows LEFT) ----
    // px fallback cannot mirror left (negative widths are unproven), so the
    // ghost is du-mode only; rays + labels always draw.
    if (duMode && out.htfRows && x0 > 2) {
      items.push(...histogram("hpro", out.htfRows, x0, -1,
        COLORS.htfGhost, COLORS.htfGhost, COLORS.htfPocRow, this.wHtf, true));
    }

    // ---- per-session profiles (MarketProfile-style: one histogram per
    // day, anchored at each session's own start -- the MT5 look) ----
    if (out.sessionProfiles) {
      for (let s = 0; s < out.sessionProfiles.length; s++) {
        const sp = out.sessionProfiles[s];
        const six = idx(sp.start);
        if (six === undefined) continue;
        items.push(...histogram("sp" + s, sp.rows, six, 1,
          COLORS.sess, COLORS.sessVA, COLORS.sessPoc,
          duMode ? this.wSess : VIS.sessMaxPx, duMode));
      }
    }

    // ---- PREV-SESSION volume profile (teal, grows right from day start) ----
    if (out.prevProf) {
      items.push(...histogram("ppro", out.prevProf, x0, 1,
        COLORS.profile, COLORS.profileVA, COLORS.pocRow,
        duMode ? this.wPrev : VIS.prevMaxPx, duMode));
    }
    if (out.prev) {
      const thin = out.prev.liquid ? "" : "  [THIN - no signals]";
      items.push(ray("pocL", x0, out.prev.poc, COLORS.poc, 3, 1));
      lab("pocT", out.prev.poc, "PREV POC " + fmt(out.prev.poc) + thin, COLORS.poc);
      items.push(ray("vahL", x0, out.prev.vah, COLORS.va, 1, 3));
      lab("vahT", out.prev.vah, "VAH " + fmt(out.prev.vah), COLORS.va, FONT_SM);
      items.push(ray("valL", x0, out.prev.val, COLORS.va, 1, 3));
      lab("valT", out.prev.val, "VAL " + fmt(out.prev.val), COLORS.va, FONT_SM);
    }

    // ---- naked POC rays (Dale's signature: red, extended until tested) ----
    if (out.nakedPocs) {
      for (let n = 0; n < out.nakedPocs.length; n++) {
        const np = out.nakedPocs[n];
        if (out.prev && Math.abs(np.poc - out.prev.poc) < 1e-9) continue; // white ray owns it
        const ix = idx(np.endTms);
        // keyed by session end time, not list position: entries shift as
        // rays get tested, and positional keys would swap identities
        items.push(ray("nk" + np.endTms, ix !== undefined ? ix : Math.max(0, x0 - 200),
          np.poc, COLORS.naked, 1, 1));
        lab("nkT" + np.endTms, np.poc, "NPOC " + fmt(np.poc), COLORS.nakedTxt, FONT_SM);
      }
    }

    if (out.htf) {
      items.push(ray("hpocL", Math.max(0, x0 - 40), out.htf.poc, COLORS.htf, 3, 1));
      lab("hpocT", out.htf.poc,
        "HTF POC " + fmt(out.htf.poc) + " (" + out.htf.sessions + "s)", COLORS.htf);
      items.push(ray("hvahL", Math.max(0, x0 - 40), out.htf.vah, COLORS.htf, 1, 4));
      lab("hvahT", out.htf.vah, "HTF VAH " + fmt(out.htf.vah), COLORS.htf, FONT_SM);
      items.push(ray("hvalL", Math.max(0, x0 - 40), out.htf.val, COLORS.htf, 1, 4));
      lab("hvalT", out.htf.val, "HTF VAL " + fmt(out.htf.val), COLORS.htf, FONT_SM);
    }

    // ---- ACCUM rotation: box + gold histogram + level ray ----
    if (out.accum) {
      const ia = idx(out.accum.start);
      const ib = idx(out.accum.end);
      if (ia !== undefined && ib !== undefined && out.accum.winHi) {
        items.push(box("accB", ia, ib, out.accum.winHi, out.accum.winLo, COLORS.accum));
        if (out.accum.rows) {
          const wCap = duMode ? Math.min(this.wAcc, Math.max(10, ib - ia)) : VIS.accMaxPx;
          items.push(...histogram("apro", out.accum.rows, ia, 1,
            "rgba(255,213,79,0.28)", "rgba(255,213,79,0.28)",
            "rgba(255,255,255,0.85)", wCap, duMode));
        }
      }
      items.push(ray("accL", ia !== undefined ? ia : x0, out.accum.level, COLORS.accum, 2, 1));
      lab("accT", out.accum.level,
        "ACCUM " + fmt(out.accum.level) +
        (out.accum.short ? "  SELL retest" : "  BUY retest") +
        "  [+0.28R/75% n12]", COLORS.accum);
    }

    // ---- LEG cluster ----
    if (out.leg) {
      items.push(ray("legL", x0, out.leg.level, COLORS.leg, 1, 1));
      lab("legT", out.leg.level,
        "LEG " + fmt(out.leg.level) +
        (out.leg.down ? "  SELL retest" : "  BUY retest") + "  [untested]",
        COLORS.leg, FONT_SM);
    }

    // ---- marks: absorption, signals, flow-quit (noise-controlled) ----
    // Current session: full detail. Prior sessions: signals shrink to bare
    // arrows (showHistory=true restores short labels); absorption and
    // flow-quit stamps are current-session only.
    let lastSig = null, lastSigIdx, lastAbsorb = null, lastAbsorbIdx;
    for (let m = 0; m < this.marks.length; m++) {
      const mk = this.marks[m];
      const mi = idx(mk.tMs);
      if (mi === undefined) continue;
      const ev = mk.ev;
      const today = mk.day === out.day;
      if (ev.kind === "absorb") {
        if (!today) continue;
        items.push(txt("ab" + mk.tMs, mi, mk.price,
          "\u25C6", COLORS.absorb, ev.long ? 12 : -12, FONT_SM, "centerMiddle"));
        lastAbsorb = mk; lastAbsorbIdx = mi;
        continue;
      }
      if (ev.kind === "flowquit") {
        if (!today) continue;
        items.push(txt("fq" + mk.tMs, mi, mk.price,
          "FLOW QUIT", COLORS.conflu, 16, FONT, "centerMiddle"));
        continue;
      }
      const col = ev.long ? COLORS.buy : COLORS.sell;
      items.push(txt("sgA" + mk.tMs, mi, ev.entry,
        ev.long ? "\u25B2" : "\u25BC", col, ev.long ? -10 : 10,
        { fontSize: 16, fontWeight: "bold" }, "centerMiddle"));
      if (today)
        items.push(txt("sg" + mk.tMs, mi, ev.entry,
          (ev.long ? "  BUY " : "  SELL ") + ev.kind + " " + fmt(ev.entry) +
          "  " + ev.tag + (ev.htf ? "  " + ev.htf : ""), col,
          ev.long ? -26 : 26, FONT_SM, "centerMiddle"));
      else if (this.optHistory)
        items.push(txt("sg" + mk.tMs, mi, ev.entry,
          (ev.long ? "BUY " : "SELL ") + ev.kind, col,
          ev.long ? -24 : 24, FONT_SM, "centerMiddle"));
      if (today) { lastSig = mk; lastSigIdx = mi; }
    }
    // label the most recent absorption of the session (the diamonds carry
    // the rest without stamping text over every churn bar)
    if (lastAbsorb && lastAbsorbIdx !== undefined) {
      items.push(txt("abT", lastAbsorbIdx, lastAbsorb.price,
        "ABSORPTION", COLORS.absorb, lastAbsorb.ev.long ? 26 : -26,
        FONT_SM, "centerMiddle"));
    }
    if (lastSig && lastSigIdx !== undefined) {
      const ev = lastSig.ev;
      items.push(ray("tpL", lastSigIdx, ev.tp, COLORS.tp, 2, 3));
      lab("tpT", ev.tp, "TP " + fmt(ev.tp), COLORS.tp);
      items.push(ray("slL", lastSigIdx, ev.sl, COLORS.sl, 2, 2));
      lab("slT", ev.sl, "SL " + fmt(ev.sl), COLORS.sl);
    }

    // ---- alignment self-test (opt-in) ----
    // Draws one magenta row centered on PREV POC through the SAME vrect
    // path as every histogram row. The white PREV POC ray must bisect the
    // magenta row. Row entirely ABOVE the ray => platform anchors rects at
    // the TOP edge: set RECT_Y_ANCHOR = "top" and rebuild.
    if (this.optAlignTest && out.prev && out.prevProf && out.prevProf.length) {
      const h = out.prevProf[0].h || 0.5;
      const pLo = out.prev.poc - h / 2, pHi = out.prev.poc + h / 2;
      items.push({ tag: "Shapes", key: "alnR", global: true,
        primitives: [duMode ? vrect(x0, Math.max(10, Math.round((i - x0) / 3)), pLo, pHi)
          : pxrect(x0, 80, pLo, pHi)],
        fillStyle: { color: COLORS.test } });
      items.push(frameTxt("alnT", 70, 72,
        "ALIGN TEST: white POC ray must bisect the magenta row. Row ABOVE ray => set RECT_Y_ANCHOR='top'",
        COLORS.test, FONT_SM));
    }

    // ---- right-edge labels, de-collided ----
    items.push(...layoutLabels(labels, lx, out.atr || 0));
    return items;
  }

  filter() { return true; }
}

// paramSpecs.bool is not in the verified platform-facts list; degrade to a
// 0/1 number spec if this build of the platform lacks it.
const boolSpec = (predef.paramSpecs && typeof predef.paramSpecs.bool === "function")
  ? predef.paramSpecs.bool
  : (dflt) => predef.paramSpecs.number(dflt ? 1 : 0, 1, 0);

module.exports = {
  name: "traderMachell",
  description: "TraderMachell - Dale volume-profile model (tested grades)",
  calculator: traderMachell,
  inputType: meta.InputType.BARS,
  areaChoice: meta.AreaChoice.OVERLAY,
  tags: ["TraderMachell"],
  params: {
    htfSessions: predef.paramSpecs.period(20),
    scaledWidths: boolSpec(true),   // du-width rows (scale with zoom); off = proven px mode
    showHistory: boolSpec(false),   // label signals from prior sessions
    alignTest: boolSpec(false),     // one-time Rectangle y-anchor self-test
  },
};
```
