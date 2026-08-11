# VISUAL v12 — right-edge pinned live-session profile (HANDOFF_v12)

**Scope:** `indicator/wrapper.js` (edge-profile family + params + one
carried cosmetic), `sim_synth.js` part 22. **Engine untouched —
`node indicator/test_core.js` verified `205/205 MATCH`.** Branched from
current main (d611068); all four gates run, `sim_tradovate` included.

## 1. What shipped

The trader-approved additive family: the CURRENT session's volume
profile pinned to the pane's right edge, rows growing left in the empty
future grid, reusing `dev.rows` (no second profile computed, core
untouched). POC row highlighted (dev teal-green — evidence-honesty:
graded gold stays reserved), VA rows brighter, VAH/POC/VAL price labels
with the coarse-bin `*` convention. Opaque by design per the spec's
rationale. Params: `edgeProfile` (default ON), `edgeWidth` (140px),
`edgeOffset` (170px).

**Time-axis independence is enforced structurally, not promised:** the
family never calls `duX()`; every X coordinate and width is px. Sim
part 22 asserts px-only X across every primitive, that a `duTime` change
produces a byte-identical container, that the emitted-geometry scan
passes it untouched (no du X to trip on; `MAX_ROW_SLOTS` checks du
widths only), that keys are session-tms'd (A8), and that toggling it off
leaves every other layer's key set identical (purely additive).

## 2. One stated push-back on the spec (as invited)

Shipped as **`cs:'grid', h:'right'`**, not `cs:'frame'`. Same structural
property — viewport-pinned, zero time information — but grid-right with
px X and price-space du Y is the exact combination the community VZO
profile provably renders (the spec's own precedent for the px(0)/negative-
width idiom); `frame` is only live-proven here for px/px banner text.
If the first live frame shows the container mis-pinned, `frame` is the
one-line fallback.

And one interpretation made explicit: "no du coordinate whatsoever" is
enforced as **no du on any X coordinate or width**. Y must remain
price-space `du(price)` — the rows ride the shared price scale, exactly
as the VZO does — and `duTime` cannot move it because the transform only
exists inside `duX()`, which this family never calls (sim-proven).

## 3. The three open questions — decided and stated

1. **Narrow-band zoom: it CLIPS.** Rows land at their true prices and
   the platform clips what is outside the visible band. Compressing to
   fit would fake the price scale; showing an in-view slice requires
   viewport data the platform does not expose. On the ~11-point 1M
   window, the in-view slice of the profile is exactly what shows.
2. **VZO collision: `edgeOffset` default 170px** seats this profile
   inboard (left) of the trader's `VZOProfile_Customizable` at 150px,
   with the key-row labels extending further left into empty grid.
   One knob if his VZO width changes.
3. **The developing profile STAYS in-chart, both default ON —
   recommended, not just implemented.** They serve different reads: the
   in-chart copy is the MP look verified against candles; the edge copy
   is the un-mis-anchorable execution reference — and during the
   daily-break AUTO-flip hour it is the trustworthy one. Redundancy is
   the point of insurance. The duplicate-label compounding is addressed
   at its actual source (below); if the trader finds two copies noisy,
   `devProfile=0` thins the in-chart one without touching this family.

**Carried cosmetic 1 (folded in):** the NEWEST finalized session's
key-value stack IS the main column's PREV levels — that one stack is now
suppressed, removing the adjacent `POC 4393.2*`/`PREV POC 4393.2*`
duplication at its source. **Carried cosmetic 2 (not folded):** the
ACCUM label right-edge clipping has no cheap safe fix (left-extending
text re-creates the v3 over-candles bug; shortening the text touches the
evidence tag). Noted as open.

## 4. Insurance, not a fix — unchanged and restated

The daily-break AUTO flip still mis-places the du-anchored layers
(labels, session vline, VA zone, ACCUM box) for ~an hour a day; at 1M
the freshness threshold is 3 minutes + one bar period. **Deleting AUTO
mode remains the real fix and remains open**, pending the `calib=1`
measurement during a 16:00–17:00 CT break to determine which space the
axis is in during the halt. v12 gives the trader a live-session read
that is correct THROUGH that hour; it does not make the hour correct.

## 5. Verification

```
node indicator/build.js         wrote TraderMachell.js
node indicator/test_core.js     205/205 MATCH — PASS (engine untouched)
node indicator/sim_tradovate.js PASS (both engine models — not skipped,
                                per the spec's v11 lesson)
node indicator/sim_synth.js     PASS — new part 22 (see section 1);
                                parts 1–21 all still pass
```

## 6. First live look

1. A compact opaque profile hugging the right pane edge, 170px in,
   left of the VZO — POC/VAH/VAL labels at its left tips.
2. Scroll/pan/zoom: it must not move relative to the pane edge.
3. During tonight's 16:00–17:00 CT break: the in-chart layers may do
   their known hour-long drift — the edge profile must hold. That
   side-by-side is the whole point; a screenshot of it also advances
   the AUTO-mode measurement.
