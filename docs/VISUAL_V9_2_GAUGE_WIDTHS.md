# VISUAL v9.2 — the 30M slab + label density (spec §7)

**Scope:** `indicator/wrapper.js` (gauge row widths, session-element
alignment, telemetry, oversize guard, label rules), `sim_synth.js`
part 17. **Engine untouched — `node indicator/test_core.js` verified
`205/205 MATCH`.**

## 1. BROKEN 1 — root cause of the slab (your "window length" reading was
the right scent)

The v8 minute-slot transform converts rectangle widths by ENDPOINTS
(`T(x+w) − T(x)`) so structural spans stay time-true across gaps. That is
correct for the session box and median span — but **histogram row widths
are visual gauges (volume magnitude), not time spans.** A row whose
index span [x, x+w] happens to cross a weekend/overnight boundary gets
widened by the gap's wall-clock minutes: at 30M, `wAcc = 20` bars
starting shortly before the weekend becomes 20 bars + ~2,900 gap minutes
≈ 100+ slots — and with the ACCUM window reaching back 3.5 days, rows
tiled into the full-height, ~4-day dark-olive slab over the rally. At 1M
a 20-bar row never crosses a gap, which is why nothing showed until 30M.
The caps were never exceeded in *bar* units — the stretch happened at
emission, precisely between your `20-bar cap` arithmetic and the ~190-bar
render.

**Fix — gauge semantics:** every histogram row (sessions, dev, prev
projection, HTF mirror, ACCUM, alignTest) now transforms its ANCHOR once
and emits its width as a raw slot count equal to its bar count. The
session median, VA bracket, median-ray anchor and key values moved into
the same gauge space so they hug the rows exactly (an endpoint-
transformed median would stretch past gauge rows across a gap). The
ACCUM **box** keeps endpoint semantics on purpose — it marks the
rotation's true time window.

## 2. Your two §7 asks, delivered

- **Telemetry:** diag now prints `emit … hpro@<x>w<w> apro@<x>w<w>` and
  `accB@<ia>-<ib>` (span, not just anchor) alongside `sp@…` — one 30M
  frame names any oversized family and by how much.
- **Guard:** the emitted-geometry scan now also prunes any filled rect
  wider than 1,500 slots (no legitimate row exceeds a full 1M session's
  ~1,173-slot fill) and names it on the banner: **`[oversize item:
  <keys>]`** — the slab class dies at the last line of defense whatever
  produces it.

## 3. BROKEN 2 — label density

- **Per-profile key values drop at multi-session density:** sessions
  shorter than 150 bars (15M/30M) no longer print VAH/POC/VAL stacks at
  their profile edges — adjacent stacks were overprinting (`POC 4130.1*`
  over `VAH 4130.9*` is two *different sessions'* values at the same
  price). The right-edge column still carries all tradeable levels; 1M/5M
  keep per-profile values.
- **Coarse cluster pitch:** at `barMin ≥ 15` the global column's cluster
  width gains an HTF-span term (8% of composite VA), so labels many
  points apart — which still overlap on a weeks-wide viewport — fan
  correctly (`ACCUM 4100.4*` vs `NPOC 4117.3*`, 16.9 pts apart, now
  clusters). Heuristic, tunable against the next 30M screenshot.

## 4. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models, 110,128 real bars)
node indicator/sim_synth.js     PASS — new part 17:
  17a  weekend-gap frame in slot mode with an ACCUM window crossing the
       gap: every du rect's width <= its family cap; the gap-crossing
       ACCUM row is EXACTLY bar-width (v8 would have added ~2,940
       minutes); median/bracket hug the rows; hpro/apro/accB telemetry
       present
  17b  runaway rect (fake 2,600-bar session): pruned + [oversize item]
       named
  17c  30M density: per-profile key values dropped, 1M keeps them;
       17-pt-apart global labels fan under the coarse pitch
  parts 1–16 all still pass
```

## 5. Next live reading (the 30M re-check)

1. The rally region must be candles again — no slab. `diag=1`:
   `hpro@…w20 apro@…w20` (or `-` when the layer is absent) confirms the
   families at their caps.
2. Key-value stacks absent at 30M (levels still in the right-edge
   column); the 4100–4140 cluster should now fan.
3. If any slab ever reappears, the banner will name it (`[oversize
   item: …]`) and the emit line will show which family and width.

Also acknowledged from §7: the order-bubble process note — chart-canvas
clicks off-limits during testing, Elements-panel route only. Position 0
and equity unchanged throughout remains the record.
