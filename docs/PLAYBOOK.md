# Gold POC Confluence Playbook — v4 (v5 elements backtested)

**Instrument:** XAUUSD (FundedNext MT5, manual execution) with GC/MGC futures order flow (Tradovate) as the execution screen.
**Session:** signals armed 09:00–11:00 New York only. Flat by choice, no overnight adds.
**Tools:** TraderMachell v5.11 (formerly TraderDalePOC) + MarketProfile (POC rays) + NY/Jamaica clock on MT5; Tradovate DOM/chart beside it.

Every rule below carries its evidence grade:
**[E]** = tested and survived (real-delta futures study or replicated MT5 backtest) · **[L]** = tested, leans right, underpowered · **[D]** = Dale's teaching, untested or untestable mechanically · **[R]** = risk discipline, not edge.

---

## Tier 0 — The big picture (read FIRST, before any setup)

Dale's method runs three profile legs; the indicator (v5.11) now draws all of them:

| Leg | On the chart | Role |
|---|---|---|
| **HTF composite** (20 sessions merged) | Thick dark-gold **HTF POC** + dash-dot **HTF VAH/VAL** + context label | The big picture: *"HTF: above value (bullish)"* / *"inside value (balanced)"* / *"below value (bearish)"*. Signals are tagged **[HTF aligned]** / **[HTF against]** — **now tested, and the evidence is contradictory**: on the prior-POC execution stack, aligned trades crushed against trades (+0.81R vs +0.13R — but only 4 vs 6 trades); on the accumulation setup it *reversed* (+0.05R aligned vs +0.45R against, 5 vs 7). Two signal types, opposite answers, tiny samples = noise. **Keep it as information, do NOT gate** (`InpRequireHTFAlign` stays false). **[D — first data in, inconclusive]** |
| **Fixed daily** (prior session) | White POC + blue VAH/VAL + zone | The tradeable level — Tier 1 below **[L]** |
| **Flexible: ACCUM** (rotation, multi-day scan) | Gold **ACCUM** line | **Backtested for the first time: the best structural lean in the system.** Retest of the rotation's POC after a confirmed ≥1 ATR breakout, traded with the breakout: **+0.282R/trade, 75% win, n=12, bootstrap CI +0.07…+0.49** — the only structural arm ever tested here whose CI excludes zero. Caveat: first half +0.49, second half +0.07 (decays), 12 trades in 5 months (~1 per 7 sessions). Trade it like Tier 1: LVN stop from the rotation profile, target the nearest prior POC. **[L — strongest lean, not proof]** |
| **Flexible: LEG CLUSTER** (Setup 2, impulse leg) | Aqua line | **Inert as built — fired 0 times in 86 sessions.** The latest pivot-pair leg (k=12) maxed at 1.51 ATR all spring/summer vs the 2.0 ATR requirement (median 0.24); even loosened to 0.75 ATR, the move-away-then-retest sequence never completed within a session. The aqua line is informational if it ever appears; the setup needs a redesign (multi-swing legs, not adjacent pivots) before it can earn a grade. **[D — inert, do not wait for it]** |

When two legs put a level at the same price (ACCUM within ~0.3 ATR of the prior POC, or sitting on the HTF POC), that is the highest-confluence trade available — but it is rare: it happened **once** in 86 sessions, so it cannot be a requirement.

## Tier 1 — The setup (all required)

1. **Static prior-session POC** — the white line from the indicator. The only structure with positive OOS expectancy across eleven tested arms (+0.033R, 54.8% win). **[L]**
2. **Break-away happened** — price travelled ≥1 ATR(M30) from the level earlier in the day (indicator won't arm otherwise). **[D]**
3. **First retest, inside the window** — first touch only; consumed is consumed. **[D]**
4. **Level = the POC itself**, not the zone edge — reversed Dale's stated preference in the static-level model. **[L]**

## Tier 2 — Stand-down filters (any one kills the trade)

- **Ranging day**: last 3–4 session POC rays stacked at current price → POC is a magnet, not S/R. No trade. **[D]**
- **Red news ±15 min** (CPI, NFP, FOMC). **[R]**
- ~~Fast approach~~ → moved into Tier 3: the answer to a hot approach is *demand the signature*, not stand down. **[E]**

## Tier 3 — Execution layer (THE EVIDENCE-BACKED CORE — updated)

Measured on GCQ6 real aggressor delta, 86 liquid sessions, 57 POC touches:

### 3a. Entry: wait for **absorption → initiative** — do not hit the raw touch
Raw-touch entries ran −0.236R at 53% win. Waiting for a **churn bar** (volume ≥ ~1.3× median, compressed range, level holds) followed by an **initiative bar** (strong close in the reversal direction) improved to −0.082R at **70% win** — and only fired on 18% of touches. *Selectivity is part of the edge: most touches never earn an entry.* **[E — n=10, lean]**
- On the futures screen: absorption = big prints, price stops progressing; initiative = aggressors stepping in your way (delta column flips).
- On MT5: v4 does the proxy version automatically — status line shows *"touched – waiting for absorption→initiative"*, then fires with `[signature]` tagged, or stands down.

### 3b. Stop: at the **reaction point**, not the LVN
The largest single improvement found all week: same entries, same target — LVN stop −0.082R, fixed-ATR stop +0.198R, **reaction-point stop +0.324R** (CI −0.02…+0.67). The reaction point = the extreme price printed between the touch and your entry — the level the flow actually defended. **[E — the change that turned the trade positive]**
- v4 places the drawn SL there automatically (`InpStopAtReaction=true`).

### 3c. Exit: **quit on opposing flow**
Once ≥ +0.3R in profit, an opposing high-volume push means leave — improved expectancy +0.07R and win 53%→61% across all 57 touches. **[E — both CIs negative but consistent]**
- On the futures screen: a heavy delta spike against you.
- On MT5: v4 fires a **FLOW QUIT** alert (orange label) — alert only, the exit click is yours.
- Also retained: scale half at ~50% to target + breakeven (30/30 paired comparisons **[E]**), final target front-runs the next prior POC (10/10 slices **[E]**).

### 3d. Futures-screen confirmations (discretionary, before entry)
- **Big resting limit at the level** (Tradovate DOM) — Dale's #1, best read on the DOM. **[D]**
- Trapped-imbalance flip (needs footprint / NT8 Order Flow+). **[D]**
- Single-bar delta sign at the touch predicts nothing — do NOT use "green delta = go". Tested, null-to-negative. **[E — killed]**

## Bonus confluences (note, don't require)

- ACCUM line (gold) coinciding with the POC — two structures, one price. **[D]**
- 08:00-range sweep (CR indicator) resolving in your direction. **[L — filter beats naive, absolute edge unproven]**
- `[FLIPPED]` tag = trading Dale's reversal protocol. **[D]**

---

## The daily run

**08:30 NY** — five minutes: confirm the level and which session made it (thin Sunday profile → discount it); note GC-minus-spot offset; news check; RuleCommandCenter green; account rules match the plan card.

**09:00–11:00 NY** — alert-driven:
1. Indicator alerts the touch → *do nothing yet*
2. Watch for the signature (MT5 will tag it; the futures screen shows the real thing) — no signature ≈ 80% of days = **no trade, correctly**
3. Enter on the signature; stop where the indicator drew it (reaction point); half off mid-way, breakeven; balance to the drawn TP
4. FLOW QUIT alert while in profit → take it
5. Stopped and level accepted through → one reversal on the retest from the other side, then done

**Hard limits [R]:** risk ≤ 0.5%/trade; max 2 trades/day; self-stop −$1,000/day; flat at 11:00 NY; verify the account's own rule card (accounts have changed plans twice — RuleCommandCenter inputs must match the account you're actually on).

---

## Standing honesty box

- Best full-stack result: **+0.324R/trade, 70% win — on 10 trades** (dale_v5 replication with same-session profile step: +0.403R, 80% — same 10 trades, binning convention moves the number; treat ~+0.3–0.4R as the honest range). A strong lean, not proof.
- The accumulation retest (+0.282R, n=12, CI excludes zero) is the first structural arm to clear zero — but its parameters were designed once from Dale's spec and tested once on one instrument/regime, and the second chronological half decays to +0.07. Lean, not proof.
- The HTF-alignment tag gave opposite answers on the two signal types (n=10 and n=12). Anyone claiming a +0.68R separation off 4-vs-6 trades is selling something. It stays a tag.
- **Tradovate port (tradovate/TraderMachell.js)**: same model, REAL futures volume, drawn on the GC chart. Its caveats: delta there is offer−bid (the grades used up−down; corr 0.87), signature stats are trailing-2h windows, and with the full playbook discipline (09:00–11:00 window + 1 ATR arming + liquidity gate) the flagship prior-POC signal fired ~once in 5 months of replay and ACCUM once — the gates are tighter than what the grades were measured on. It cannot alert (platform limit): it is the confluence screen, MT5 remains the alert machine. One instrument, one ~5-month regime, one threshold-loosening pass.
- The base strategy without the execution layer is ~zero-to-negative everywhere it was tested. The execution layer *is* the candidate edge.
- Treat the first 20–30 live signals as paid validation at minimum size; demo first is smarter.
- Data accrues free: every futures contract roll adds a liquid window — re-run `dale_of2.py` after each roll and update the grades above.

*Updated 2026-08-08 after the GCQ6 real-delta execution study (harness: dale_tv.py, dale_delta.py, dale_of2.py; data: data_tv/).*
*v3 update, same date: indicator v5.00 completes all three of Dale's profile legs — HTF composite big picture, Setup 2 trend-leg cluster (flexible profile over the current impulse), multi-day ACCUM scan.*
*v4 update, 2026-08-08: the v5 elements got their backtest (harness: dale_v5.py, same GCQ6 data). Answers: HTF alignment → contradictory across signal types, keep as tag, no gate. ACCUM retest → +0.282R, 75% win, n=12, CI +0.07…+0.49 — upgraded to [L], the strongest structural lean in the system. LEG CLUSTER → inert as built (0 fires in 86 sessions, threshold unreachable), needs redesign. Next data point: re-run dale_v5.py + dale_of2.py after the contract roll adds sessions.*
