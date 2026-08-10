# How a community indicator survives every timeframe — MTF Key Levels

**Trader's instruction:** *"download one from tradovate community
indicator and see how the indicator anchors and display on charts across
the different time frames... upload the selected indicator code to
github so cursor can build our indicator correctly."*

Source committed at `docs/reference/community/MTF_KeyLevels.js`, pulled
from his own installed Tradovate Community library.
**© Frien_dd, Mozilla Public License 2.0** (https://mozilla.org/MPL/2.0/)
— MPL-2.0 permits redistribution with the notice intact, which is why
this one could be committed verbatim where the v6 study sources could
not. Header preserved unmodified.

## THE FINDING — it is immune because it never plays our game

Three facts, all verified by reading the source:

**1. It reads NOTHING from `chartDescription`.** No `elementSize`, no
`underlyingType`, no timeframe, no bar-size anywhere in 25KB. It has no
concept of what timeframe it is running on.

**2. Period boundaries come only from bar TIMESTAMPS** (L120-L170):
```js
map(d, index) {
    const ts = new Date(d.timestamp());
    const newDay   = !sameDay(ts,   this.lastDay);
    const newWeek  = !sameWeek(ts,  this.lastWeek);
    const newMonth = !sameMonth(ts, this.lastMonth);
    ...
    if (newDay) { this.pdHigh = this.dHigh; ... }   // snapshot prior
    else { this.dHigh = Math.max(this.dHigh, h); }  // accumulate current
}
```
Running OHLC per period, snapshotted at each boundary. Bar size is
irrelevant — 1M or 30M bars both cross Tuesday→Wednesday at the same
wall-clock instant.

**3. It NEVER resolves a historical timestamp to a bar index.** The only
x-coordinates in the entire file are (L364-L398):
```js
a: { x: du(0),               y: mid }
b: { x: du(index + maxExt),  y: mid }
```
`du(0)` = the first loaded bar. `du(index + n)` = the current bar plus a
right extension. **Both are always valid** — no prepend, re-index, trim,
weekend gap or timeframe switch can invalidate index 0 or the live index.

That is the whole trick: it draws horizontal lines spanning the loaded
history, so it needs no timestamp→index mapping at all. Every failure
class we chased across FIELD_REPORT sections 1-11 (stale stored indexes,
tail-offset vs stored, minute-slot du, weekend-gap widening, stale
`chartDescription` on switch) is structurally impossible for it.

## WHAT WE CAN AND CANNOT COPY

**Cannot:** our layer is a histogram — it has a left anchor at a session
start and a width. That inherently requires a historical anchor, which
is exactly what MTF Key Levels avoids by only drawing full-width lines.
This is a genuine difference in kind, not laziness on our part.

**Can, and should:**

1. **Stop reading `chartDescription` for anything load-bearing.** We read
   `elementSize` for `barMin`, and its staleness after a timeframe switch
   caused the v9 infinite reset loop (spec section 5). v9.1 already
   derives the period from observed bar spacing when it distrusts the
   description; **finish the job — derive `barMin` from bar timestamps
   ALWAYS and treat `chartDescription` as a hint we never depend on.**
   MTF Key Levels proves an indicator can be fully correct knowing
   nothing about its own timeframe.

2. **Audit which of our layers actually need a historical anchor.**
   Everything that is conceptually a LEVEL — PREV POC/VAH/VAL rays, naked
   POCs, HTF levels, the ACCUM level ray — could use the `du(0) →
   du(index + ext)` pattern and become structurally un-mis-anchorable,
   exactly like this indicator. Only the profile histograms, session
   boxes and the ACCUM box genuinely need anchor+width. That would shrink
   the anchoring-risk surface to the few layers that truly require it.

3. **Adopt the right-extension idiom** `du(index + maxExt)` rather than
   `infiniteEnd` rays where an explicit, bounded extension is wanted.

4. Its `sameDay/sameWeek/sameMonth` helpers are calendar-based; ours
   (`sessionKey`, 17:00 NY, DST-aware) is stricter and correct for CME
   futures. **Keep ours** — no change suggested here.

## Suggested next step for Cursor

Take item 1 first (it removes the last dependency on the one platform
value we have proven unreliable), then scope item 2 as an audit: list
every emitted layer, mark each LEVEL vs ANCHORED, and convert the LEVEL
ones to the du(0)→du(index+ext) form. Report how many layers remain
anchor-dependent afterwards — that number is our residual risk surface,
and this study says it should be small.
