# v13 — Asian-session tailoring, absorption zones, Rapid Daily risk line

**Trader mandate (2026-08-14):** tailor the tool for a FundedNext Futures
**Rapid Daily** funded account traded mostly in the **Asian session**, use
the accumulation/order-flow data Tradovate provides, and fix the poor
visual representation of absorption: *"absorption at levels shown in a
translucent red or green with vary size and the amount absorbed."*

Everything below is display/config-layer work. `dale_core.js` received one
behavior-neutral extension (section 2); the 205/205 Python parity gate is
unchanged and green.

---

## 1. What the platform actually provides (honesty first)

- The custom-indicator API exposes **executed** order flow per bar:
  `offerVolume()` (contracts traded at the ask = buy aggression) and
  `bidVolume()` (contracts traded at the bid = sell aggression). This is
  the "order flow data" the zones consume.
- The **resting order book (DOM depth) is NOT exposed** to custom
  indicators. The playbook's 3d confirmation ("big resting limit at the
  level") stays a manual read on the Tradovate DOM panel beside the
  chart. The chart never pretends otherwise.
- The delta caveat stands: platform delta = offer − bid; the grades were
  measured on up − down volume (corr 0.87). Already on the banner.

## 2. Session window (core extension, engine-safe)

- `inNyWindow` now supports **midnight wrap**: `start > end` means an
  overnight window (`18 → 3` = 18:00 NY through 02:59 NY); `start < end`
  is byte-identical to the old behavior; `start === end` = always-on.
  Engine defaults stay `9/11`, so the regression lock is untouched
  (`test_core.js` 205/205 MATCH after the change).
- New wrapper params `winStart`/`winEnd` (NY hours 0–23, defensively
  coerced; 0 = midnight is a legal edge) feed the core config. **Default
  = 18 → 3, the Asian session** (Globex open through the London handoff).
- Disclosure: the banner always prints `win HH-HH NY`; `18-03` adds
  `(ASIA)`, `09-11` prints `(playbook)`, anything but 09-11 carries
  `[window ungraded]` — the grades were measured with no time gate, and
  the 09-11 discipline is what the playbook validated.
- Measured side-effect worth knowing: on the real GCQ6 dataset the Asian
  window fires MORE setups than the NY window (prior-POC 4 vs 1, ACCUM
  3 vs 1, LEG 4 vs 2 over the 110k-bar replay) — gold's Asian hours are
  genuinely active. Those extra signals ride the same graded machines,
  but the time-of-day mix is new; treat early live signals as validation
  size per the playbook.

## 3. Absorption zones (the visual-layer fix)

Tracker (wrapper-side, display-only, rebuilt from the committed-bar
stream on any reset — never feeds the signal machines; the engine's
graded signature churn bar is untouched):

- **Detection**: volume ≥ `absVolX` × trailing ~2h median (default 2.0 —
  deliberately stricter than the engine's 1.3× because zones fire at any
  price, not only at an armed level), range ≤ 0.75 × median range, and
  the losing aggressor fails to move price (close holds ≥ 40% off the
  rejected extreme).
- **Side + amount**: heavy sell aggression (delta ≤ 0) that closes off
  the lows = sellers absorbed → **GREEN demand zone**, amount =
  `bidVolume`. Heavy buy aggression that closes off the highs = buyers
  absorbed → **RED supply zone**, amount = `offerVolume`.
- **Life cycle**: same-side zones stacked within 0.35 ATR **merge**
  (amounts accumulate — repeated absorption at one level reads as one
  strong zone); a **close** through the level ± 0.15 ATR kills the zone;
  zones untouched for a full session expire; the active set caps at 8
  (weakest absorbed amount drops first).

Rendering ("translucent red or green with vary size and the amount
absorbed"):

- Fill rides the **live-verified canvas-plotter alpha path** (v10) —
  never Rectangle fill alpha (live Bug A). One bar-wide strip per column
  from the zone's birth bar to the live edge, drawn FIRST so profiles
  and candles paint over the backdrop.
- **Varying size/intensity**: strip opacity = `absOpacity` (default 30)
  × a per-zone multiplier `0.35 + 0.65 × (amt / maxAmt)` — the heaviest
  zone on screen is at full policy opacity, light ones recede. The
  zone's height is its true absorbed price span.
- **Amount label** inside the band: `▲ 4.0K absorbed` / `▼ 800 absorbed`
  in the zone's color, font size stepped by absorbed strength.
- **Opaque-safe fallback** (`rowsPlot=0` or plotter unavailable): dashed
  outline box + label, zero fill-alpha reliance. Solid-hex rule holds
  everywhere in the items path (sim-enforced).
- Anchor discipline: zones resolve through the same `idx()`/mismatch
  cross-check machinery as every layer; pre-history zones surface via
  `[old anchors offscreen]`, never a fabricated anchor; outlines respect
  the emitted-geometry guard.

## 4. FundedNext Rapid Daily risk line

Rule card verified against fundednext.com/futures/rapid (2026-08):

| Size | Daily loss limit (soft) | Max loss, EOD trailing (hard) | Buffer | Contract cap |
|---|---|---|---|---|
| 25K | $500 | $1,000 | $1,100 | 2 mini / 20 micro |
| 50K | $1,000 | $2,000 | $2,100 | 4 mini / 40 micro |
| 100K | $1,250 | $2,500 | $2,600 | 6 mini / 60 micro |

- Hitting the DLL pauses the day (not a breach); the EOD-trailing max
  loss is the account-ending rule; buffer = start + max loss + $100
  before payouts. No consistency rule on Rapid Daily.
- New banner line (`statR`): `RAPID DAILY 50K | DLL $1000 soft | EOD
  trail $2000 hard | buffer $2100 | risk $250/trade, max 2/day, cap 4
  mini | ΣΔ +…`. `ΣΔ` is the session cumulative delta (bid/ask proxy) —
  the at-a-glance accumulation read for the session.
- **Suggested sizing**: `floor(risk$ / (SL ticks × tick value))`, capped
  at the account's contract limit. Tick value auto-detects by product
  (GC $10, MGC $1, NQ/MNQ, ES/MES, YM/MYM, CL/MCL, RTY/M2K, SI/SIL);
  unknown products withhold sizing and say `tickVal unknown — set
  tickVal` instead of guessing. Printed on the SL label
  (`SL 4321.0  5t = 4 mini`), the live signal text (`~4 mini`) and the
  risk line.
- Defaults: `acctSize=50`, `riskPerTrade=0` → auto 25% of the DLL (two
  playbook trades + slippage stay under the soft stop), `maxTrades=2`
  (playbook [R]). **Plan card, not enforcement** — the indicator cannot
  see account P&L.

## 5. New params (all defensively coerced, number specs)

| Param | Default | Meaning |
|---|---|---|
| `winStart` / `winEnd` | 18 / 3 | signal window, NY hours (wraps midnight) |
| `absZones` | 1 | absorption zones on/off |
| `absOpacity` | 30 | zone fill opacity 0–100 (plotter path) |
| `absVolX` | 2.0 | absorption volume multiple vs 2h median |
| `acctSize` | 50 | Rapid Daily size in K (25/50/100) |
| `riskPerTrade` | 0 | $/trade; 0 = auto (25% of DLL) |
| `maxTrades` | 2 | self-imposed daily trade cap |
| `tickVal` | 0 | $/tick override; 0 = auto by product |

## 6. Verification

- `node indicator/test_core.js` → **205/205 MATCH** (engine lock intact).
- `node indicator/sim_synth.js` → all 22 prior parts + **part 23**
  (tracker semantics: creation/side/amount/merge/break/cap; frame
  contract: outline, scaled labels, payload, plotter strips, toggles,
  pre-history disclosure), **part 24** (wrap logic across DST, prop
  wiring, ASIA default, banner disclosure), **part 25** (rule card,
  sizing math, micro/mini caps, unknown-product disclosure, tickVal
  override) → PASS.
- `node indicator/sim_tradovate.js` → PASS on the 110k-bar real dataset,
  both engine models, wrapper signals identical to a direct core run
  configured with the same Asian window.
