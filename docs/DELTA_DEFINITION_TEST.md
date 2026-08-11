# The delta caveat, finally measured — and it is not cosmetic

## What the caveat said

Standing project disclosure, carried on the live banner since v4:

> grades were measured on `upVolume − downVolume`; Tradovate's indicator
> API only exposes `offerVolume − bidVolume` (corr 0.87, identical on 24%
> of bars) — close cousin, disclosed in the port.

It was never tested, only disclosed. It is now tested.

## Why it became testable

API research established, and arithmetic on captured payloads confirms:

```
upVolume + downVolume  ==  bidVolume + offerVolume  ==  total bar volume
up/down    = split by TICK DIRECTION
bid/offer  = split by AGGRESSOR SIDE
```

Two independent decompositions of the same total — **and `TV_GCQ6_1min.csv`
already contains all four columns.** The comparison needed no new data,
only a one-line change to `load_tv`, now behind `DELTA_MODE=aggressor`
(default unchanged, so every published grade still reproduces).

## Results — gold, 86 sessions, both harnesses

**`dale_v5.py`**

| arm | graded delta (up−down) | LIVE delta (offer−bid) |
|---|---|---|
| execution stack | **+0.403R** n=10 win 80% CI[+0.06,+0.74] | +0.143R n=**7** win 71% CI[**−0.18**,+0.47] |
| ACCUM retest | +0.282R n=12 win 75% | **+0.282R n=12 win 75% — IDENTICAL** |

**`dale_of2.py`**

| | graded delta | LIVE delta |
|---|---|---|
| signature fired on | **10 of 57 touches (18%)** | **6 of 57 touches (11%)** |
| reaction-point stop | +0.324R n=10 CI[−0.03,+0.68] | +0.488R n=**6** CI[**−0.26**,+1.24] |

## What is ROBUST, and what is NOT

**Robust — the signature is materially rarer on the live delta.**
Both harnesses agree and the effect is large: 10 → 7 signals in `dale_v5`,
10 → 6 in `dale_of2`, 18% → 11% of touches. Roughly a third to 40% of the
setups the grades were measured on **do not fire on the delta the live
indicator computes.**

**NOT robust — the direction of the expectancy change.** `dale_v5` has it
falling (+0.403 → +0.143); `dale_of2` has it *rising* (+0.324 → +0.488).
The two harnesses use different target rules, and at n=6–7 neither
resolves. **Do not claim the edge collapses — that was my first reading
off `dale_v5` alone, and `dale_of2` contradicts it.**

**What both agree on that matters:** under the live delta, **no stack
configuration in either harness produces a confidence interval excluding
zero.** The `+0.40R / 80%` figure is measured on a quantity the live
indicator does not compute.

## The genuinely good news: ACCUM is unaffected

ACCUM's entry is a price retest with an LVN stop — **it contains no delta
term at all.** Its numbers are byte-identical under both definitions
(+0.282R, n=12, 75%). Confirmed by construction and by the run.

**So `[+0.28R/75% n12]` — the label the live indicator shows most
prominently — is valid for the live tool exactly as measured.** The
caveat never applied to it. That is worth stating plainly, because the
banner currently discloses the delta caveat globally, which under-sells
the one arm that is clean.

## Actions

1. **Stop attaching the +0.40R/80% figure to anything the live indicator
   fires on.** The live tool's stack signature is a different, rarer
   event than the graded one. Either re-grade on `offer−bid` once enough
   signals accumulate, or label the stack `[signature: live-delta variant,
   UNGRADED]`.
2. **Narrow the delta disclosure to the arms that use delta.** ACCUM
   should not carry it; the banner currently implies it does.
3. Keep `DELTA_MODE` in the harness so any future re-grade is one env var,
   and keep the default on `up−down` so published grades reproduce.

## Health

One instrument, 86 sessions, n=6–12 throughout. The frequency effect is
the only claim here with enough signal to stand on; everything about
magnitude is under-powered and labelled as such.
