# VISUAL v4 — response to FIELD_REPORT.md (2026-08-09 live session)

**Scope:** `indicator/wrapper.js` (display layer) + `indicator/sim_synth.js`
(rendering-invariant tests). **`dale_core.js` untouched — `node
indicator/test_core.js` verified `205/205 MATCH` on this revision.**
The platform-facts registry (`TraderMachell_Review_v2.md` §4) has been updated
with the live findings below.

---

## 1. Root causes of the two live bugs

### Bug A — opaque VA band

Confirmed from the screenshot: the v3 band was `rgba(96,204,236,0.07)`, drawn
*under* the histogram rows (z-order was correct). It rendered fully opaque,
and since the VA rows are near the same hue, band + rows fused into the solid
cyan slab. **Conclusion: alpha in `fillStyle.color` is not honored for
Rectangle fills.** The report's instruction to treat translucent fills as
unproven is adopted as a hard rule.

### Bug B — mode flip (`scaledWidths=false` yet duMode ran)

This is now fully explained, with no remaining contradiction:

- The deployed wrapper's param spec default was flipped to `boolSpec(false)`
  (§3 of the field report), **but the `init()` fallback still read
  `p.scaledWidths === undefined ? true : !!p.scaledWidths`.**
- The settings dialog displayed `(20, false, false, false)` — so the bool
  param specs *registered* — yet duMode ran. If the props had arrived as
  actual `false`, duMode would have been off. If they had arrived as the
  *string* `"false"`, then `alignTest` (`!!"false"` → true) would have drawn
  the magenta row — and it did not.
- The only delivery model consistent with **both** observations:
  **bool param VALUES never reach `this.props` (they arrive `undefined`)**,
  while the dialog renders the spec defaults. `scaledWidths` then fell back
  to its code default `true` (duMode on → band drew), and `alignTest` read
  `!!undefined` → false (no magenta row). Exactly what the screenshot shows.

**Corollary (the silver lining, now a proven fact):** the VA band is strictly
duMode-gated, so duMode provably ran — which means the cleanly tiled rows in
the screenshot are **du-width rows. du-unit Rectangle widths render correctly
on live**, and the zoom-scaling profile mode is promoted to the proven
default.

## 2. What v4 changes

| Area | Change |
|---|---|
| **Props** | Toggles moved from `bool` to `number` (0/1) param specs. Every prop passes through defensive coercion (`pBool`/`pNum`, accepting `true/'true'/1/'1'/'on'…`), effective values are **re-derived on every draw** (`_opts()`), and code defaults are the intended shipping behavior for undelivered props: `scaledWidths=1`, `showHistory=0`, `alignTest=0`, `diag=0`. |
| **Instrumentation** | Banner line 3 always shows the effective width mode (`[du]`/`[px]`). New `diag=1` param prints raw prop delivery (`scaledWidths=undefined:undefined …`) on a fourth banner line — prop behavior is now observable on the live chart, never assumed. |
| **VA zone** | The filled band is gone. Value now reads through: (a) VA rows a clearly brighter teal than the tails, (b) a **dashed outline zone** (proven line primitives) from session start to the current bar spanning VAL→VAH — Dale's zone from `dale_poc/item4` — and (c) the dashed blue VAH/VAL rays with labels. Zero reliance on fill alpha. |
| **Palette** | Every color in the file is a solid `#RRGGBB` tuned for the dark theme at full opacity: dark-teal tails that recede, brighter VA step, gold POC row, near-background slate for historical sessions, dark gold-brown HTF ghost. `sim_synth.js` fails on any non-hex color, so alpha reliance cannot regress. |
| **Width modes** | du widths (live-proven) stay the default and now gate correctly; `scaledWidths=0` restores the px path. HTF mirror remains du-only (px cannot mirror left without unproven negative widths). |
| **Everything else** | v3 behavior preserved: exact row pitch from the core (the screenshot rows "are the standard" — that code path is unchanged), label de-collision + right extension, naked-POC stable keys, marks noise control, session-start marker, alignTest self-test, banner slots, commit pipeline. |

## 3. Verification on this revision

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — including new invariants:
  - value-area zone outline spans exactly VAL..VAH; no filled band exists
  - every fill/line/text color is solid #RRGGBB (opaque-safe)
  - banner carries the effective [du]/[px] marker
  - prop-coercion torture: 11 delivery variants (bool/string/number/
    undefined/garbage) all gate duMode and alignTest identically;
    htfSessions coerces from strings and defaults on garbage
  - carried from v3: exact POC-row alignment, label de-collision under
    an 11-label pile-up, both engine models, px fallback frame
```

## 4. First-session checklist (v4)

1. Paste the rebuilt `TraderMachell.js`, save, **F5**.
2. Banner line 3 must show **`[du]`**. Set `scaledWidths=0` in the dialog,
   F5: if the banner flips to `[px]`, number-prop delivery works; if it
   stays `[du]`, set `diag=1` and read the raw prop line — either way we
   learn the delivery model in one glance.
3. The VA zone must be a dashed outline; rows inside it must stay
   individually visible (Bug A fixed).
4. `alignTest=1`: the white PREV POC ray must bisect the magenta row (the
   2026-08-09 frame already showed the gold POC row exactly at 4324.9, so
   "bottom" anchoring is corroborated; this is the formal confirmation).
   Row entirely above the ray → set `RECT_Y_ANCHOR="top"`, rebuild.
5. Dashed session-start line on the first bar at/after 17:00 New York.
6. With levels bunched, right-edge labels must fan vertically, extending
   right of the last bar.
