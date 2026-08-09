# FIELD REPORT — v3 live deployment, first bug, and full build context

**Date:** 2026-08-09 (Sunday, pre-open — GC reopens 18:00 ET)
**Deployed build:** `indicator/TraderMachell.js` (your v3 wrapper + regression-locked core, rebuilt after one safety edit — see §3)
**Platform:** Tradovate web (trader.tradovate.com), MGCZ6 1-minute chart, live funded-eval account
**Mandate from the trader:** *"I want to see a perfectly aligned histogram with levels, well-labeled areas so it's easy to read at a glance. I need my indicator to be professional looking."* You now have everything: full sources, real trade data, the live bug screenshot, and Trader Dale's own teaching material. **Attempt the correct build.**

---

## 1. What's new in this delivery

| Path | What it is |
|---|---|
| `FIELD_REPORT.md` | This document |
| `docs/bug/live_bug_opaque_va_band_2026-08-09.png` | Screenshot of v3 running live — shows the bug (§2) |
| `docs/reference/dale_poc/` (7 images) | Trader Dale's POC-strategy education: method, long scenario, zone-edge entry, SL/TP placement, when NOT to trade (ranging), POC-fails reversal |
| `docs/reference/dale_orderflow/` (14 images) | Dale's order-flow course: accumulation definition + chart example, short entry at POC line, take-profit before support, position management, all three confirmations (passive/aggressive absorption, high-volume node, trapped imbalance), core-strategy recap, four practical tips |
| `docs/PLAYBOOK.md` | The trader's operating playbook — the strategy as actually traded, with evidence grades |
| `data_tv/TV_GCQ6_1min.csv` (6.3 MB) | GCQ6 1-min bars w/ bid/offer volume — the backtest dataset |
| `data_tv/overlap/TV_GCZ6_1min.csv`, `TV_MGCZ6_1min.csv` (1.3 + 3.3 MB) | GCZ6/MGCZ6 overlap data used for contract-roll checks |
| `indicator/levels_py.json` | Python-harness golden levels — the 205-checkpoint parity target |

With this layout, **`node indicator/test_core.js` now runs out of the box** (it reads `../data_tv/TV_GCQ6_1min.csv` and `./levels_py.json`). The gate is 205/205 MATCH. It must stay 205/205 — `dale_core.js` is regression-locked; visual-layer changes only unless you have a proven engine defect.

## 2. THE BUG — first live session of v3

See `docs/bug/live_bug_opaque_va_band_2026-08-09.png`. What the chart shows:

- **Correct:** histogram rows tile cleanly with proper pitch from 4335–4365 and below 4295; the gold POC row sits exactly at PREV POC 4324.9; naked-POC rays (4359.8 purple, 4298.6 cyan, 4287.2 red) and the status line all render correctly.
- **Bug A — opaque VA band:** the value-area band (VAL 4295.3 → VAH 4333.7) renders as a **solid opaque cyan slab** that swallows every histogram row inside it. Your code sets `rgba(…, 0.07)`. Two candidate causes: (a) the platform ignores the alpha channel in `fillStyle.color` for Rectangles, or (b) the band rect is drawn over the rows at full alpha for another reason. Note our earlier px-mode empirical results also never confirmed alpha compositing — **treat translucent fills as unproven on this platform.**
- **Bug B — mode flip:** the VA band is a **duMode-only** feature in your v3, and the deployed props were `traderMachell(20, false, false, false)` — `scaledWidths` was **false**. The band drew anyway ⇒ duMode was ON. Strongest hypothesis: **Tradovate passes props to the calculator as strings** (`"false"` is truthy in JS), so every `boolean`-typed prop read as a bare truthy check flips on. This would also explain why `alignTest` magenta row appeared… it did **not** appear, which weakens the pure-strings theory — so verify: it may be that only *defaulted* (untouched-in-dialog) props arrive as strings, or that `boolSpec` defaults behave differently between dialog-set and default paths. **Instrument, don't assume.**
- **Silver lining:** if duMode was actually active, then **du-unit rectangle WIDTHS render correctly live** — the tiled rows in the screenshot are du-width rows. Your zoom-scaling upgrade works. Keep it, fix the gating.

### Required fixes (minimum bar)
1. **Coerce every prop defensively:** `const b = v === true || v === 'true'` (and `Number(v)` for numerics) at the top of `map()`. Never trust platform prop types.
2. **Never depend on fill alpha.** Redesign the VA band so it reads as a *zone* without translucency: e.g. VAH/VAL dotted boundary lines (already proven in px mode) + optional thin edge ticks, or a hollow outline rectangle — anything that stays legible if fills are 100% opaque.
3. Keep the histogram rows above (z-order) any band/backdrop if you keep one.

## 3. One change I made to your v3 before deploying

`indicator/wrapper.js`: `scaledWidths` default flipped `true → false` (px widths are the only empirically proven mode; du was to be a live A/B toggle). Ironically the bug made duMode run anyway — see §2. `TraderMachell.js` was rebuilt from that wrapper (banner + core splice unchanged). Everything else in your PR was adopted as-is, including your `tools/graphics.js` stub and `sim_synth.js`.

## 4. How to read the Dale reference material (why it's here)

The trader wants the chart to *teach itself* — like Dale's annotated charts do. When you design the visual layer, match these references:

- `dale_poc/item1_2_3_method_1130.png` — the core method: volume histogram beside price, POC as the standout level.
- `dale_poc/item4_zone_edge_entry_1339.png` — entries happen at the *edge* of the volume zone: the zone must be visually crisp.
- `dale_poc/item5_6_SL_TP_2210.png`, `item5_stoploss_RES_2138.png` — SL/TP drawn relative to volume structure; our stopBehindLVN mirrors this.
- `dale_poc/item7_ranging_when_not_1910.png` — when NOT to trade; our status line carries this state ("armed - outside the 09:00-11:00 NY window" in the bug screenshot).
- `dale_poc/item8_POC_fails_reversal_3214.png` — failure mode; naked-POC rays exist for this.
- `dale_orderflow/01–02` — what ACCUM (absorption) means; our ACCUM signal (+0.28R/75%/n=12) implements the graded version.
- `dale_orderflow/06–09` — the three confirmations (passive/aggressive absorption, HVN, trapped imbalance) — candidates for future signal work; visually these are *annotations at price levels*, which is the display language to aim for.
- `dale_orderflow/10` — core-strategy recap in one slide: the target reading experience at a glance.

`docs/PLAYBOOK.md` states the strategy exactly as traded, with honest evidence grades. **Hard rule: on-chart text may never claim more than the graded evidence** — prior-POC stack +0.40R/80%/n=10; ACCUM +0.28R/75%/n=12; LEG untested (tag-only); HTF tag-only. Delta caveat: platform `offerVolume−bidVolume` vs graded `upVolume−downVolume` correlate 0.87 and are identical only 24% of the time — never present platform delta as graded delta.

## 5. Definition of done

1. `node indicator/test_core.js` → 205/205 MATCH (unchanged engine).
2. `node indicator/sim_tradovate.js` + `node indicator/sim_synth.js` pass under both engine models.
3. All props robust to string-typed values.
4. VA band legible with zero reliance on fill alpha; histogram never occluded.
5. Rows perfectly tiled and aligned to price (the bug screenshot's rows outside the band are the standard); POC row exact at POC price.
6. Labels de-collided, readable at a glance, professional — judged against the Dale references and the MT5 build the trader already trusts.
7. `TraderMachell.js` rebuilt via `node indicator/build.js`, single paste-able file, platform constraints respected (`./tools/*` + lodash only, no network/storage/alerts, CommonJS).

Deliver as a PR to this repo, as before. Platform facts and known-broken primitives are documented in `TraderMachell_Review_v2.md` §4–5 — everything there was verified in-browser and still holds.
