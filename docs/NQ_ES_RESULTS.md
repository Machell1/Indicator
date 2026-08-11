# Nasdaq and S&P — data pulled, strategy run, verdict: NOT GRADEABLE

Follow-up to `OTHER_INSTRUMENTS_NQ_ES.md`, which said the question could
not be answered without data. The data now exists.

## Data acquired

Pulled from Tradovate's own market-data socket
(`wss://md.tradovateapi.com/v1/websocket`) inside the authenticated
browser session, paginating `md/getChart` backwards. The token stayed in
the page and was never emitted.

| file | rows | span | liquid sessions |
|---|---|---|---|
| `data_tv/index/TV_NQU6_1min.csv` | 81,838 | 2026-02-12 → 2026-08-11 | 53 |
| `data_tv/index/TV_ESU6_1min.csv` | 84,013 | 2026-02-11 → 2026-08-11 | 61 |
| *(reference)* `data_tv/TV_GCQ6_1min.csv` | 110,128 | Mar–Aug 2026 | 86 |

Same schema as gold, real up/down volume:
`timestamp,open,high,low,close,upVolume,downVolume,upTicks,downTicks,bidVolume,offerVolume`

**Kept in `data_tv/index/` deliberately.** `dale_v5.py` globs
`TV_*_1min.csv`; putting these beside the gold file would have silently
blended three instruments into the graded numbers. The default glob still
resolves to gold alone, and `DATA_GLOB` / `COST_PTS` env overrides drive
explicit runs. Gold re-verified at +0.403 n=10 / +0.282 n=12 after every
change to the harness.

Costs per contract rather than inherited from gold: **MNQ 0.75 pt**,
**MES 0.45 pt** (≈1 tick slippage + commission at $2/pt and $5/pt).
Estimates, not measured fills.

## Results

| arm | GOLD (86 sess) | NASDAQ (53 sess) | S&P (61 sess) |
|---|---|---|---|
| execution stack | **+0.403R** n=10 win 80% | +0.831R n=**5** win 60% CI[−0.40,+2.06] | **−0.373R** n=**7** win 43% CI[−0.88,+0.14] |
| ACCUM retest | **+0.282R** n=12 win 75% | +0.555R n=**6** win 83% | +0.478R n=**1** |
| LEG cluster | 0 fires | 0 fires | 0 fires |

## Verdict: nothing here is gradeable

**n = 5, 6, 7 and 1.** Gold's own grades are already flagged as thin at
n=10 and n=12. These are half that or worse. No label may be attached to
either instrument on this evidence, in either direction.

What can honestly be said:

1. **The S&P stack came out NEGATIVE** — −0.373R at a 43% win rate. It is
   the only directional reading that points anywhere, and it points
   *against*. It is not significant (CI −0.88..+0.14, n=7), so it is not
   proof the strategy fails on ES — but it is the opposite sign from
   gold, and it is the single most notable number in the table.
2. **Nasdaq looks good and means nothing yet.** +0.831R on n=5 with a
   confidence interval running from −0.40 to +2.06 is noise with a
   flattering point estimate.
3. **LEG CLUSTER is inert on all three instruments** — 0 fires
   everywhere. This is the one *consistent* result. Index leg magnitudes
   are even smaller than gold's (NQ max 0.59 ATR, ES max 1.63, gold
   1.51) against a 2.0 ATR threshold. LEG is not a gold-specific failure;
   it is unreachable by construction.

## The sample CANNOT currently be extended

I tried to widen the window with the prior front months. **`NQM6` and
`ESM6` both return zero rows** — Tradovate serves historical chart data
only for **currently-listed** contracts. Gold's 86 sessions exist because
GCQ6 was still listed when it was pulled.

So 53 and 61 sessions is the ceiling today. Reaching a gold-comparable
sample means either accumulating forward over coming months (Z6 becomes
front in September) or sourcing index history elsewhere.

## Methodological wrinkle worth knowing

`stats.stationary_bootstrap_mean` is seeded with `abs(hash(k)) % 997`,
and Python randomises `hash()` per process — **so confidence intervals
shift slightly between runs.** NQ's ACCUM CI printed `[+0.064,+1.072]` on
one run and `[−0.005,+1.116]` on the next: significant, then not. At n=6
that is expected, but it means **borderline CIs in this harness must not
be read as stable**. Gold's grades sit far enough from the boundary to be
unaffected in practice. Worth pinning the seed if any CI is ever going to
carry weight.

## Consequence for the indicator

`OTHER_INSTRUMENTS_NQ_ES.md` flagged that `wrapper.js:1334` hardcodes
`[+0.28R/75% n12]` with no instrument guard. **That is now more urgent,
not less.** We have measured the ACCUM arm on ES at n=1 and the stack on
ES at −0.373R. If the trader puts TraderMachell on an ES chart, it will
render gold's +0.28R/75% beside a level on an instrument where our own
measurement points the other way.

The fix stands: gate the tags on `contractInfo`, and display
`[grades: GC only — UNTESTED on this symbol]` off-gold.

## Harness change

`dale_v5.py`'s health line was hardcoded to *"GCQ6 only, 86 liquid
sessions"* and printed that verbatim while running on NQ and ES —
mislabelling every foreign-instrument run. It now reports the files and
session count actually used.
