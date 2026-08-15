# LuxAlgo Refinement — Adversarial Audit & Improvement Plan

Purpose: a structured plan to improve the ACCURACY and VISUAL DISPLAY of the
LuxAlgo-refined TraderMachell Pine script. Each work item ends in a
copy-paste prompt you can hand to LuxAlgo verbatim.

Audit basis: the repo's measured evidence (backtests, live delta
measurement, cross-instrument tests) — facts that constrain ANY refinement
of this indicator, whoever writes the code. Line-level audit of the LuxAlgo
script itself is pending: commit `dc36f24` is local-only (remote main ends
at `0039c08`); push it and the audit can be re-run against real code.

---

## PART A — Adversarial audit: where this indicator can lie to you

### A1. The delta edge is statistically fragile (measured, not opinion)

- The +0.40R/80% prior-POC stack grade was measured on `upVolume −
  downVolume`. Live platforms expose different deltas. Measured on the live
  offer−bid delta: signature fire rate drops 18% → 11% of touches and **no
  configuration's confidence interval excludes zero**.
- TradingView's intrabar delta (lower-TF up/down candles) is a third,
  different number. Correlation to the graded delta ≈ 0.87, exact match on
  only ~24% of bars.
- ACCUM retest (+0.28R, 75%, n=12) has **no delta term** — it survives any
  delta substitution. The stack does not.

**Adversarial conclusion:** any UI that presents stack signals with the same
confidence as ACCUM signals is overstating the evidence. Delta-dependent
signals must carry a visible "delta-proxy" caveat on TradingView.

### A2. Timeframe fragility (measured)

Signature count collapses 17 → 2 → 0 going 1m → 5m → 15m. Aggregation
destroys the high-volume/small-range contrast the absorption test needs.

**Adversarial conclusion:** the indicator must hard-guard the timeframe. On
anything above 1m it should visibly downgrade itself (banner: "signals
ungraded at this TF"), not silently emit the same arrows.

### A3. Instrument fragility (measured)

Gold-only grades. NQ/ES pull: not gradeable (n=5/6/7/1), and the only
directional read on ES stack was **negative (−0.373R)**. A prior audit also
flagged: evidence tags are hardcoded with no instrument guard, so gold
grades render on any symbol.

**Adversarial conclusion:** the script must check `syminfo.root` (GC/MGC)
before printing graded win-rates. On other symbols: signals allowed, grades
suppressed, banner says "ungraded instrument".

### A4. Session-window paradox (measured)

The stack fired **0/17 inside the 09:00–11:00 NY window** in the 86-session
backtest — the window the account rules favor is where the stack signature
never completed. Asian-session trading was added later and is ungraded.

**Adversarial conclusion:** window filters change the effective strategy.
The UI must show per-window fire counts (touches / signatures / fires) so
the trader sees when a window is starving the signal, instead of assuming
the backtest grade transfers into the window.

### A5. Pine-port repaint and state risks (structural)

1. **Repaint:** any signal computed before `barstate.isconfirmed` will
   repaint intrabar. Alerts must fire on confirmed bars only.
2. **`request.security_lower_tf`:** realtime bars deliver a *partial*
   intrabar array vs history — live delta ≠ historical delta on the same
   bar. This biases live signature fires relative to backtest.
3. **Session state:** all state machines (arming, touch, absorption,
   activity) must reset exactly at the CME 17:00 NY roll, not calendar
   midnight, or levels silently shift one session.
4. **Drawing limits:** >500 boxes, drawings >9,999 bars back, or lines >500
   bars forward silently vanish or error. A refactor that draws freely will
   break on large histories.

### A6. Known failure modes of LuxAlgo-style rebuilds (check these first)

1. **Two-engines problem:** LuxAlgo templates ship their own volume-profile
   engine (different binning, VA algorithm, allocation). If the refinement
   swapped in their engine, its POC/VAH/VAL will NOT match the graded
   engine — every level on the chart drifts from the numbers the grades
   were measured on. The graded binning (fixed grid, `lo − 40·step`, equal
   share across spanned rows, VA grown from POC taking the larger
   neighbor) must be preserved bit-for-bit.
2. **Confidence cosmetics:** gradient "strength" bars, score dials, or
   percentage badges imply probabilities nobody measured. Anything shown as
   a number must trace to a measured statistic or be labeled heuristic.
3. **Smoothing shifts entries:** moving-average smoothing of triggers moves
   the entry bar; the measured hold times (30–75 min) and stops (12–21 pts)
   no longer apply.
4. **Default alert freq:** `alert.freq_all` on unconfirmed bars spams and
   front-runs the confirmed signal.

---

## PART B — Improvement plan (each item = one LuxAlgo prompt)

### Phase 1 — Accuracy hardening

**1.1 No-repaint contract**
> Ensure every signal, alert, and state transition in this script evaluates
> only on `barstate.isconfirmed`. Alerts must use confirmed-bar firing.
> Add a settings toggle "Preview unconfirmed signal" (default OFF) that,
> when on, shows a hollow arrow for the forming bar clearly distinct from
> confirmed arrows. List every place the script previously read an
> unconfirmed value.

**1.2 Instrument & timeframe guard**
> Add a guard: graded evidence text (win rates, R multiples) renders only
> when `syminfo.root` is "GC" or "MGC" AND the chart timeframe is 1 minute.
> On any other symbol or TF, keep the signals but replace evidence text
> with "UNGRADED — measured on GC 1m only" in the status area. Do not
> remove the guard behind a user setting.

**1.3 Delta disclosure**
> The bar delta here is a proxy (intrabar up/down volume, or range-position
> when unavailable), not the graded up/down tick volume. Add a one-line
> status field showing which delta source is live right now, and suffix
> every delta-dependent signal label (the prior-POC stack) with "Δproxy".
> The ACCUM signal has no delta term — do not tag it.

**1.4 Profile-engine parity**
> Do not replace the volume-profile math. Required semantics: step =
> max(range/rows, mintick); grid low = sessionLow − 40·step; each bar's
> volume split equally across all rows its H–L range spans; POC = densest
> row; VA grown from the POC row taking the larger neighbor until 70% of
> volume enclosed; session boundary = 17:00 America/New_York (CME roll),
> DST-aware, not calendar midnight. If your current build uses a different
> engine, port these semantics exactly and verify POC/VAH/VAL match the
> previous values on the same chart data.

**1.5 Walk-forward counters (honesty instrumentation)**
> Add a compact stats block (toggleable): per current session and per
> window (Asian / NY), show counts of level TOUCHES, ABSORPTION signatures,
> INITIATIVE confirms, and SIGNALS fired, plus the same totals over the
> loaded history. No win-rate extrapolation — raw counts only. Purpose:
> reveal when a session window is starving the signal.

### Phase 2 — Signal quality

**2.1 Adaptive absorption thresholds**
> Absorption test: volume ≥ 1.3× and range ≤ 0.9× the rolling 120-bar
> medians. Make both multipliers inputs, and compute the medians over a
> trailing window (not full-session) so overnight bars don't depress the
> baseline. Add an option to require 2 consecutive qualifying bars for a
> stronger signature (default off — the graded setting is 1 bar).

**2.2 Stop and target integrity**
> Stops must stay structural: prior-POC stack uses the reaction extreme ±
> 0.10 ATR; ACCUM uses the LVN behind the profile (first row < 30% of POC
> volume) with a 0.60 ATR fallback. Targets come from the prior-POC stack
> (nearest prior session POC beyond entry, front-run by 0.15 ATR), with a
> 0.8 ATR fallback and a floor of 0.5× risk. Do not substitute fixed R
> multiples or ATR trailing stops — the measured hold profile (30–75 min,
> 12–21 pt stops) depends on structural exits. Expose tpFrontATR and the
> LVN fraction as inputs.

**2.3 Session logic**
> Trade windows: Asian 18:00–03:00 NY and NY morning 09:00–11:00, both on
> the America/New_York clock with DST handled, selectable (Asian / NY /
> both). Blackout 02:00–03:00 NY (pre-London). Signals outside the enabled
> windows: suppressed, but still counted in the stats block so the trader
> sees what the filter is discarding.

### Phase 3 — Visual display

**3.1 Layer hierarchy**
> Implement three density presets. MINIMAL: signals + PREV POC line only.
> BALANCED (default): + prior/developing VA fills at ≤15% opacity, PREV
> POC/VAH/VAL and DEV POC lines with right-edge price tags. DETAILED: + both
> session histograms, dVAH/dVAL tags, ACCUM box, absorbed-volume bands, and
> per-signal risk figures. Every layer independently toggleable underneath
> the preset.

**3.2 Label de-collision**
> Right-edge price tags (PREV POC/VAH/VAL, DEV POC, ACCUM, SL/TP/ENTRY)
> must never overprint: cluster labels whose prices sit within 0.25 ATR,
> then fan each cluster vertically around its midpoint in fixed pixel
> steps, ordered by price. One shared dark tag background (#111827-style),
> colored text per level class, price always shown to mintick.

**3.3 Trade bracket rendering**
> On each signal: solid setup badge (BUY/SELL + setup name) at the entry
> bar; entry/SL/TP rays extended to the live edge while the trade idea is
> active; translucent risk band (entry↔SL, red family ≤20% opacity) and
> reward band (entry↔TP, green family); right-edge tags "BUY MKT ENTRY
> price", "SELL STOP SL price", "SELL LIMIT TP price" (mirrored for
> shorts; ACCUM entries are LIMIT). Only the most recent signal keeps
> extended rays; older signals collapse to badge + small tags.

**3.4 Absorption visualization**
> Absorption bubbles: dot at the absorbing wick, diameter scaled by
> absorbed volume relative to the 50-bar median (3 size steps), green =
> bid absorption (lower wick, negative delta), red = ask absorption (upper
> wick, positive delta), tooltip with absorbed volume and price. Level
> bands: horizontal translucent strips at POC/ACCUM where absorption
> accumulated, width ∝ cumulated absorbed volume, capped to the last 120
> bars. Cap bubbles at 80 and prune oldest.

**3.5 Drawing budget & history safety**
> Audit every box/line/label creation: total boxes ≤ 500, lines ≤ 500,
> labels ≤ 500 at worst case (Detailed preset, full history). Clamp all
> x-anchors to within 4,500 bars of the live bar. Delete-and-redraw
> last-bar layers must reuse object handles where possible instead of
> churning IDs every tick.

### Phase 4 — Validation (ask LuxAlgo to demonstrate, not assert)

**4.1 Replay test**
> Run bar replay across at least 3 full sessions of MGC 1m including a
> session roll at 17:00 NY. Confirm: no signal appears/disappears after
> bar close (no repaint), levels swap exactly at the roll, stats counters
> reset per session, and the same bars produce the same signals in replay
> as in a fresh chart load.

**4.2 Degradation test**
> Load the script on ES 1m and on MGC 15m. Confirm the ungraded banners
> appear, graded evidence text is suppressed, and nothing errors. Load on
> a symbol with no volume (some CFDs) and confirm a clear "no volume data"
> notice instead of silent zeros.

**4.3 Budget test**
> Load on 20,000+ bars of 1m history with the Detailed preset. Confirm no
> runtime error (drawing limits), no missing layers, and chart remains
> responsive.

---

## Priority order

| # | Item | Why first |
|---|------|-----------|
| 1 | 1.1 No-repaint + 1.2 guards | Wrong signals are worse than no signals |
| 2 | 1.4 Engine parity | Every level depends on it |
| 3 | 1.3 + 1.5 Disclosure & counters | Restores the honesty contract |
| 4 | 2.2 Stops/targets | Protects the measured R profile |
| 5 | 3.1–3.3 Visual hierarchy | Professional display |
| 6 | 3.4–3.5 + Phase 4 | Polish and proof |

## One-paragraph master prompt (if you want a single message to LuxAlgo)

> Harden this indicator without changing its measured behavior: evaluate
> everything on confirmed bars only; keep the exact volume-profile math
> (fixed grid lo−40·step, equal-share binning, VA grown from POC, 17:00 NY
> session roll); render graded win-rate text only on GC/MGC 1m and mark
> delta-dependent signals "Δproxy"; keep structural stops (reaction extreme
> / LVN) and prior-POC targets, no fixed R multiples; add per-window
> touch/signature/fire counters; then rebuild the visual layer with three
> density presets, de-collided right-edge price tags, entry/SL/TP brackets
> with translucent risk/reward bands and order-type labels, and
> volume-scaled absorption bubbles — all within Pine's 500-object and
> 9,999-bar drawing limits, verified by bar replay across a session roll.
