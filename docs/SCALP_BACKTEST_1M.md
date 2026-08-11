# Scalping backtest, 1-minute — the strategy does not scalp

**Question asked:** backtest this strategy as a scalping strategy on the
1-minute timeframe.

**Answer: it degrades monotonically the more you scalp it, and the method
is structurally incompatible with scalping.** Numbers below. Harness
`harness/dale_scalp.py` + `harness/dale_scalp_diag.py`, real GCQ6 volume,
86 liquid sessions, Mar–Aug 2026.

## Harness validated first

`dale_v5.py` re-run before changing anything, and it reproduces the
graded evidence exactly — stack n=10 E[R]=+0.403 win 80%, accum n=12
E[R]=+0.282 win 75%. Every number below comes off the same primitives.

Entry logic, stop placement, session boundary, profile math and the
pessimistic same-bar fill are UNCHANGED. Two things were changed, both
required to make it a scalping test: multi-entry (every touch, not just
the session's first) and scalp exits (fixed R targets + hard time stop).
Signals are detected once and replayed through every exit config, so
differences between rows come from the exit rule alone.

## 1 — Scalping it makes it worse, monotonically

| config | stack E[R] | accum E[R] |
|---|---|---|
| TP 0.5R / 15m  (most scalp-like) | **−0.094** | +0.133 |
| TP 1.0R / 15m | −0.031 | +0.235* |
| TP 1.0R / 30m | +0.129 | +0.392* |
| TP 2.0R / 60m | +0.479* | +0.671* |
| TP 2.0R / close | +0.121 | +0.900* |

`*` = stationary-bootstrap CI excludes zero.

The gradient runs one way for both families. **At the most scalp-like
settings the prior-POC stack is net negative.** The edge is in holding,
not in cutting quickly.

## 2 — The stop is not scalp-sized, and cannot be made so

| | median R | on 1 MGC | range |
|---|---|---|---|
| stack | 11.75 pts | **$118** | 4.2 – 23.7 pts |
| accum | 21.05 pts | **$210** | 8.4 – 39.3 pts |

This is the decisive structural point. The stop is placed behind the
reaction point or the LVN — it is *defined by market structure*, which on
gold is 12–21 points. A scalper's stop is 1–3 points. You cannot shrink
these without deleting the thing that makes the setup work: the stop
location IS the edge (that is what "reaction-point stop" means in the
graded +0.40R stack).

For scale: one accum trade risks ~$210 per contract. The account panel
shows a trailing max drawdown figure of $1,242 — I am not certain whether
that is the limit or the remaining buffer, but on either reading a single
trade is a large fraction of it.

## 3 — The frequency is the opposite of scalping

With multi-entry ON and every qualifying touch allowed, **86 sessions
produced 29 signals total** — 17 stack + 12 accum. That is roughly **one
trade every three sessions across both setups combined.**

Scalping means many trades per day. This fires about once a week per
setup. No exit rule can fix that; it is a property of how rare the
signature is.

## 4 — Cost is NOT the binding constraint (correcting an earlier guess)

I expected cost drag to be the problem with scalping this. It is not:

```
stack TP0.75R/30m @ GC  0.05 pts -> +0.047
stack TP0.75R/30m @ MGC 0.11 pts -> +0.041
accum TP1.0R/60m  @ GC  0.05 pts -> +0.465
accum TP1.0R/60m  @ MGC 0.11 pts -> +0.462
```

Doubling the cost barely registers — precisely *because* R is 12–21
points. The cost problem only appears when R is small, and R is never
small here. The binding constraints are §2 and §3, not fees.

## 5 — NEW FINDING, unrelated to scalping: the stack never fires in the NY window

Entry-hour histogram, New York time:

```
stack: 00h:1  04h:1  06h:1  08h:2  13h:2  14h:1  15h:1  18h:2  19h:2  20h:1  22h:3
accum: 08h:2  09h:3  10h:3  12h:2  14h:1  16h:1

inside 09:00-11:00 NY:   stack 0/17      accum 6/12
```

**Zero of the 17 prior-POC stack signals fall inside 09:00–11:00 New
York.** Verified as real, not a time-indexing bug — the histogram is
printed from the same index used for entry. The prior-session POC is
typically touched overnight or in the afternoon; by the NY morning the
level has usually already been consumed.

This matters for the live indicator, which carries a 09:00–11:00 NY
window in its banner. **If that window is a hard gate rather than a tag,
it would have blocked every single graded stack trade.** Worth confirming
which it is. ACCUM is unaffected — half its signals are inside.

## 6 — Robustness: 40 configs were swept, so read the best cells sceptically

Selection bias is real here and the bootstrap CI does not correct for it.
Chronological halves:

| config | all | 1st half | 2nd half |
|---|---|---|---|
| stack TP2.0R/60m | +0.473 | +0.459 | **+0.483** |
| stack TP2.0R/close | +0.115 | +0.273 | +0.004 |
| accum TP1.0R/15m *(most scalp-like significant cell)* | +0.231 | +0.382 | **+0.081** |
| accum TP1.0R/30m | +0.389 | +0.589 | +0.189 |
| accum TP2.0R/close | +0.897 | +0.919 | +0.875 |

**The one config that is both positive and stable across halves is stack
TP 2.0R with a 60-minute cap — median hold 43 minutes.** That is not a
scalp.

The most scalp-like cell that clears zero (accum TP1.0R/15m, +0.235R,
CI [+0.041,+0.423], median hold 15m) **decays by more than half in the
second chronological half** — the identical decay pattern already
recorded against the original ACCUM grade (+0.494 → +0.071). Same
weakness, not a new one.

## Verdict

The strategy does not scalp. Its edge lives in structural stops of 12–21
points, holds of 30–75 minutes, and a signal that appears about once
every three sessions. Compressing it into scalp exits removes the edge
from the stack entirely and roughly halves it on ACCUM.

**Nothing here changes the graded numbers or licenses a new "tested"
label.** If scalping is the goal, it needs a different signal family —
one that fires many times a session with a stop that is small by
construction — not a different exit rule bolted onto this one.

Data: GCQ6 only, one regime, 86 sessions, n=17 and n=12. Small.
