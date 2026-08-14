# VISUAL v13 — level absorption overlay (Rapid Daily / Asian)

**Scope:** `indicator/wrapper.js` (overlay + params + banner), `dale_core.js`
(midnight-wrapping signal window only — profile math untouched),
`sim_synth.js` part 23, playbook Rapid Daily / Asian addendum.
**Engine:** `node indicator/test_core.js` must stay `205/205 MATCH`.

## Why this layer

The previous absorption visual was an orange ◆ diamond plus one
`"ABSORPTION"` word-stamp on the latest churn bar. That does not show
*where* size was absorbed, *which side* ate it, or *how much*. The
trader asked for accumulation / order-flow at levels, translucent red or
green, varying size, with the absorbed amount — on a FundedNext Rapid
Daily account, trading mostly the Asian session.

## Order-flow source (honesty)

Tradovate **chart indicators cannot read the SuperDOM**. Forum-confirmed:
resting book is their code, not ours. The sandbox *does* expose executed
order flow at price:

- `requirements: { profile: true }` → `d.profile()` →
  `{ price, vol, bidVol, askVol }[]` per bar
- Fallback: `d.bidVolume()` / `d.offerVolume()` when `profile()` is
  missing (Node sims, older builds)

`bidVol` = aggressive sells hitting bids. `askVol` = aggressive buys
hitting offers. That is the closest thing to "order book data they
provide" inside this indicator. The banner says
`ABS = executed bid/ask at price (not resting DOM)`. Keep the DOM open
beside the chart for resting size — that read is still discretionary.

## What the overlay draws

At each structural level (prev POC / VAH / VAL, ACCUM, naked POCs,
developing POC / VAH / VAL) the wrapper accumulates bid vs ask while
price holds within 0.30 ATR. A cloud publishes when one side dominates
(≥ 1.15× the other) and volume clears a median gate:

| Side | Color | Meaning |
|---|---|---|
| bid dominant | translucent green `#00C853` | bids absorbing sells — support |
| ask dominant | translucent red `#FF5252` | offers absorbing buys — resistance |

Size:

- **width** = bars the level was traded (padded to ≥ 3, cap 48)
- **height** = tick × (2 + 10 × vol-scale)
- **opacity** = 0.18–0.48 on the custom-plotter path (the only live-proven
  translucency; graphics fill alpha is Bug A)

Label (items path — canvas has no text): `POC BID ABS 1.2k`. Cap 8
clouds, largest first, current session only.

The graded signature diamond stays. The `"ABSORPTION"` word-stamp is
suppressed when a cloud sits on that price.

## Session window

`inNyWindow` now wraps midnight (`start > end` → `[start, 24) ∪ [0, end)`).
Multiple windows are OR'd via `cfg.windows`.

| `sessionMode` | Window | Grade |
|---|---|---|
| 0 | 09:00–11:00 NY | graded original |
| **1 (default)** | **18:00–03:00 NY** | **ungraded** |
| 2 | both | ungraded for the Asian leg |

Status text uses `cfg.windowLabel`. The banner flags
`ASIAN window ungraded (grades = 09:00-11:00 NY)`.

## Rapid Daily card (display-only)

`acctSize` 25 / 50 / 100. Banner line `statR`:

`Rapid Daily 50K  DLL $1000  MLL $2000  max 4 mini / 40 micro  Asian 18:00-03:00 NY  FLAT 15:10 CT`

No auto-flatten, no order placement. DLL is a soft breach; MLL is the
account-killer. FundedNext auto-closes at 15:10 CT.

## Params

- `sessionMode` (default 1)
- `acctSize` (default 50)
- `absorbViz` (default 1)

## What did not change

`buildProfile` / `displayRows` / `stopBehindLVN` / liquidity gate /
signature math. Core CFG defaults remain 09:00–11:00 so a bare
`new DaleCore()` matches the Python harness. The wrapper applies Asian
hours on init and on every `map()` so a dialog change does not need F5.
