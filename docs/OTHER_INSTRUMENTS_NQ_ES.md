# Nasdaq / S&P — can this strategy go there?

**Trader asked:** *"why don't we use it on Nasq and S&P"*

Short answer: no reason in principle, nothing is known in practice, it
cannot be tested with the data on hand — **and checking turned up a
defect that must be fixed before anyone puts it on an index chart.**

## DEFECT FOUND — the indicator will show GOLD grades on any symbol

`indicator/wrapper.js:1334` hardcodes the evidence tag with **no
instrument check whatsoever**:

```js
"  [+0.28R/75% n12]" + accAge
```

`contractInfo` is consulted exactly once in the whole file — line 985,
for tick-size decimal formatting. Nothing gates the grades. The module
description is literally *"TraderMachell - Dale volume-profile model
(tested grades)"*.

**So dropping TraderMachell on an NQ or ES chart today renders
`+0.28R/75% n12` next to an ACCUM level on an instrument where those
numbers have never been measured.** Same exposure for the prior-POC
stack labelling. This is exactly the over-claim the evidence grades exist
to prevent, and it is currently one drag-and-drop away.

**Fix:** gate every evidence tag on `contractInfo`. When the symbol is
not gold, replace the grade with an explicit disclosure —
`[grades: GC only — UNTESTED on this symbol]` — rather than silently
dropping it, so the trader can see the level is being drawn but the
statistics are not claimed. The `*` coarse-bin convention already
establishes the pattern: disclose, do not hide.

Note `contractInfo` is undeclared in the published typings (like
`d.index()`), so guard with `typeof`/existence checks in the established
house style rather than assuming shape.

## Would the strategy itself transfer?

**Genuine architectural point in favour: every threshold is relative,
not absolute.** Absorption is `vol >= 1.3x session median` and
`range <= 0.9x session median`; initiative is `|delta| >= 75th
percentile`; ATR comes from the session's own ranges; the stop is
structural. Nothing is hard-coded in gold points, so the rules re-scale
to a different instrument's volatility with no re-tuning. Micros keep
the structural stop affordable (MNQ $2/pt, MES $5/pt), which matters
because §2 of the scalp study showed the stop cannot be shrunk.

**Three specific reasons to expect it to behave differently, though:**

1. **Session structure is inverted.** On gold the stack fired overnight —
   measured, 0 of 17 signals inside 09:00-11:00 NY. Index futures
   concentrate volume overwhelmingly in RTH 09:30-16:00 ET and are thin
   overnight. The quiet overnight prior-POC retest that gold supplies may
   simply not exist on ES/NQ, or may be swamped by the cash open.
2. **"Absorption" may not be rare on ES.** ES rests enormous size at
   every tick; high-volume/small-range is its resting state for hours,
   not a distinguishing event. The 1.3x/0.9x contrast that fires 17 times
   in 86 gold sessions could fire constantly on ES — many signals and no
   edge, which looks like success until it is graded.
3. **Gap risk.** ES/NQ gap around the cash open; gold is near-continuous.
   A prior-POC retest can be gapped straight through, which the backtest's
   pessimistic-fill model does not currently price.

None of these is a reason not to test. They are reasons not to assume.

## Why it cannot be tested today

- **No NQ data at all** anywhere in the project.
- **The only S&P data is unusable for this strategy.**
  `data/US500.cash_M1.csv` is an MT5 CFD export: `<VOL>` is **0** and
  `<TICKVOL>` is a tick count. There is **no delta**, so the initiative
  leg of the graded stack is not merely approximate — it is
  *uncomputable*. Falling back to tick-count proxy is precisely what this
  project moved away from when it got real Tradovate volume.
- **There is no fetcher in the repo.** `harness/dale_tv.py` only reads
  the CSV; nothing pulls it. However `TV_GCQ6_1min.csv` was obtained, the
  same route is needed for the index.

## What would make this answerable

ES/NQ (or MES/MNQ) 1-minute bars in the same schema as
`TV_GCQ6_1min.csv`:

```
timestamp,open,high,low,close,upVolume,downVolume,upTicks,downTicks,bidVolume,offerVolume
```

`upVolume`/`downVolume` are the load-bearing columns — everything else
the harness can live without. With that file dropped into `data_tv/`,
`dale_v5.py` and `dale_scalp.py` run against it unchanged (both glob
`TV_*_1min.csv`), and the answer is a re-grade, not a rewrite.

**Until then the honest label for NQ/ES is UNTESTED**, in exactly the
same sense LEG CLUSTER is untested — the indicator may draw its levels,
but no grade may be attached to them.
