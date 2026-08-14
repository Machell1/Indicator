# Asian Order-Flow Upgrade (v13)

## What changed

- The Tradovate indicator now defaults to the New York-time window
  `18:00-02:00`, covering the requested Asian-session workflow. Presets also
  include NY morning, London, all-session, and a custom midnight-safe window.
- `requirements: { volumeProfiles: true }` enables `d.profile()` rows with
  executed `bidVol`, `askVol`, and total volume at price.
- High-volume, one-sided execution at the lower or upper part of a completed
  bar produces a bullish green or bearish red absorption candidate.
- Candidate zones are translucent, scale in width/height with strength, and
  show an estimated executed amount, for example `BID ABS ~75  5.0x`.
- A Rapid-account advisory card converts structural stop distance to planned
  dollar risk using user-entered point value, risk budget, contract cap, and
  maximum signals per session.

## Critical data limitation

Tradovate custom indicators do not expose the resting DOM/order book. They
cannot observe queued size, additions, cancellations, replenishment, or
icebergs. `d.profile()` is executed order flow (footprint data), not resting
market depth. The red/green zones are therefore **absorption candidates**:

- `BID ABS` at a bar's lower edge: aggressive selling executed while the low
  held, a bullish demand candidate (green).
- `ASK ABS` at a bar's upper edge: aggressive buying executed while the high
  held, a bearish supply candidate (red).

The displayed `~amount` is dominant aggressive executed volume at that price.
It is not a measured passive order size. If `d.profile()` is unavailable, the
indicator retains the legacy bar-volume/range churn marker and says so in the
HUD.

## Defaults

| Parameter | Default | Meaning |
|---|---:|---|
| `sessionPreset` | 1 | Asia, 18:00-02:00 New York |
| `orderFlow` | 1 | Enable footprint candidates |
| `absOpacity` | 26 | Zone opacity |
| `absMinVol` | 20 | Minimum executed row volume |
| `absRelativeVol` | 1.5 | Row volume vs bar-profile median |
| `absImbalance` | 2.0 | Dominant/opposing aggressor ratio |
| `absMaxLabels` | 8 | Numeric labels per visible session |
| `riskBudgetUsd` | 200 | Planned risk budget |
| `pointValue` | 10 | MGC dollars per point |
| `maxContracts` | 2 | Advisory size cap |
| `maxSignalsPerSession` | 2 | Advisory session budget |

These are starting values, not a performance claim. The new Asian window and
footprint detector are ungraded. Existing profile math remains unchanged.

## Funded-account limitation

The risk card is advisory. A chart indicator cannot read account equity,
realized/unrealized P&L, trailing drawdown, fills, positions, or current prop
firm rules, and it cannot block orders. Confirm current My Funded Futures
rules independently and enter limits that match the exact account.

## Verification

Run:

```bash
cd indicator
node build.js
node test_orderflow.js
node test_core.js
node sim_tradovate.js
node sim_synth.js
```
