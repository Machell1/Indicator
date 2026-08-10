# Can we anchor to Tradovate's native volume profile? No — and here is what to do instead

**Trader's proposal, verbatim:** *"why don't we anchor our volume profile
and overlay it on tradovate native daily volume profile, we would get the
orientation correct and locked onto a strong native and accurate anchor."*

Answered two ways: an API/doc study (9 agents, adversarially verified),
and a direct inspection of the live platform. They agree.

## PART A — EMPIRICAL: there is no native volume profile

Searched the live indicator catalogue on the trader's own chart
(2026-08-10 18:14 CDT, MGCZ6). Built-ins render white, custom render blue.

- **"volume"** -> built-ins `Volume`, `Price volume trend`, and the
  Volume-based group: Accumulation/Distribution line, Money flow
  oscillator, **Cumulative Delta**, Ease of movement, Force index, Money
  flow index, VWAP. **No profile.**
- **"profile"** -> **exactly one result**, in blue:
  `Volume Zone Oscillator - Customizable Profile Variant`.

The profile currently drawn on the trader's chart is that community
indicator. Confirmed in *Configure Chart Elements*, which lists both
studies as custom:

```
traderMachell(20,1,1,1,1,#3E7E93,18,1,20,0,0,0,0,2,0...)
VZOProfile_Customizable(60,5,150,true,true,#E0E0E0,...)
```

**It is JavaScript in the same sandbox we are, with the same du/px
constraints and no better knowledge of the time axis than we have.**
There is no privileged native anchor to borrow.

What it actually does: pins itself to the **right edge of the pane**,
right-aligned against the price axis, drawn into the empty future grid.
It never resolves a timestamp to an x position, so it cannot be
mis-anchored. Same structural trick as MTF Key Levels' full-width lines
and as v11's level lines. The trader's instinct about the mechanism is
right; the attribution to "native" is not.

## PART B — API: three independent walls, each fatal alone

1. **The graphics surface is write-only.** `Calculator`'s complete member
   list is `props, contractInfo, chartDescription, dlls, init, map,
   filter`. `GraphicsResponse` has exactly one field — `items?`, an array
   you *return to be drawn*. `Canvas` exposes exactly `drawLine`,
   `drawPath`, `drawHeatmap`. There is no read side and no chart-object
   enumeration. A Drawing Tool's `anchors` is documented as *"anchors
   associated with **this** drawing tool"* — its own, never another's.
2. **Nothing can name another study.** Param types are Number, Boolean,
   Text, Enum only; `predef.paramSpecs` is `period, number, percent,
   bool, text, enum, color`. **`predef.studies` does not exist** (zero
   hits repo-wide). `require()` reaches `./tools/*`, lodash, fft and your
   own modules — and requiring a helper *re-runs an algorithm*, it never
   reads a placed study's state.
3. **The native VP is not a JS study at all.** It ships as a chart-engine
   drawing tool and a TPO chart type. The public `builtin/` has 42 files
   and none is a profile.

The one theoretical escape — chaining via the chart's **Input** dropdown
— is closed too: your code cannot name the source (it is user-wired UI),
a `bars`-input indicator cannot be chained onto, and even at best you
would receive **one scalar per bar**. A POC price is not orientation
information; it says nothing about where a profile's left edge sits.

> Confidence note: the Input-dropdown claim rests on a single non-staff
> forum post with no official documentation. Do not build on it elsewhere
> without a live test.

### The capability that would actually fix this does not exist

```ts
export type ScaleUnit = 'du' | 'px';
```

A **closed union of two**, verified byte-identical on `master` and
`gh-pages` and in the rendered typedoc. There is no `'time'`, no `'ts'`.
`ScaleBoundValue.value` is typed `number`, so a Date cannot be smuggled
in. **No timestamp coordinate unit exists.** That was the one finding
that could have beaten every option below, and it is not there.

The single genuinely time-anchored x in the API is `IndexedDate` on the
plotter path — and it is **not constructible from a wall-clock time**.
The only sources are `plotting.x.get(entity)`, `x.relative()`,
`x.between()`, all derived from bars that already exist. That constraint
is the good news; see B.1 below.

## PART C — HONEST PREMISE CHECK: it would not have fixed our fault

The recent fault was not a wrong anchor. wrapper.js:

```js
const tMode = O.duTime === 1 ||
  (O.duTime === 2 && this.lastPushedMs > 0 &&
    Date.now() - this.lastPushedMs < 3 * this.barMin * 60e3);
DU_T = tMode ? (v => this._slotOf(v, originTs)) : (v => v);
```

`DU_T` is a projection applied to whatever number it is handed. **It does
not care where that number came from.** A perfect anchor sourced from a
native profile would enter the identical switch and be projected
identically wrongly. The pipeline is *anchor resolution -> space
selection -> render*; stage 1 was already correct and the break is at
stage 2. Fixing the GPS coordinates does not help when the map is drawn
in the wrong projection.

Two details make it worse rather than better:

- **Our `_tailRef` cross-check validates anchor resolution** against an
  independent index reference. It is a good check — of the stage that was
  never broken. That is exactly why this shipped invisibly.
- Slot-space emission has a **second** dependency the proposal also does
  not touch: `originTs = out.dayStartTms + O.originShift`. A hand-
  calibrated guess about the axis origin. Wrong origin translates every
  du-space item horizontally, and no native profile could inform it.

**The steelman of the trader's idea is real, though, and the target is
just wrong:** *stop computing a number and handing it to the renderer —
hand the renderer the bar object and let it compute the number.* That
mechanism exists, it is `plotting.x.get()`, and we already use it.

## PART D — RANKED PLAN

### D.1 Anchor off the bar OBJECT, not a bar number (already working here)

Our plotter already does exactly this:

```js
const x = plt.x.get(item);
canvas.drawLine(plt.offset(x, runLo), plt.offset(x, runHi), {...});
```

On this path **there is no numeric x for a gate to flip**, because we
never compute one. The bug class is not mitigated, it is
*unrepresentable*. Histogram rows are therefore already immune; the
exposed families are the du-space ones — session boxes, level lines,
label column, and the `rowsPlot=0` opaque fallback.

Constraint to plan around: **`Canvas` has no text primitive.** Labels
cannot move to this path.

### D.2 Make the families that don't need x stop using x  *(cheapest win)*

Full-width level lines and the label column are semantically **y-only**.
Every du-space x they emit is pure risk with zero informational payload.
Emit them under `GraphicsScope` with `origin: { cs: "frame", ... }` and
pixel x-bounds — the construct already used for the status banner.
`cs: "frame"` is viewport space with no relationship to the time axis.

Tradovate's own "Creating Advanced Custom Indicators" article documents
the right-edge recipe: *"We want our bars to be locked to the price axis,
so we use `px(0)` for its `position.x` value"*, with **negative** pixel
widths because x-zero locks to the chart's right edge. **That is the
documented, first-party version of what the VZO profile is doing** — and
it is the direct answer to what the trader was reaching for.

Removes two of four exposed families permanently, with no path migration.

### D.3 Delete AUTO mode

`duTime === 2` picks the emission space from a wall-clock guess. When it
guesses wrong the failure is total and silent, under conditions that
cannot be scheduled. If minute-slot is what the live axis does, make it
the **only** mode and demote bar-index to a manual debug escape.
**Confirm the pre-open coincidence first** — that is our measurement, not
something the docs can adjudicate.

### D.4 Make the emission space visible on the chart, permanently

We have a ground-truth oracle in our own file: `plt.x.get()`. For one
known bar per frame, draw two markers — one via `DU_T`, one via
`plt.x.get()`. If they separate horizontally, the space is wrong,
visibly and instantly. Extend `[anchor mismatch: ...]` with a `[space]`
field. This closes precisely the gap that let the fault ship.

### D.5 Use the native VP as a human QA oracle, not a dependency

Run Tradovate's Volume Profile **drawing tool** beside TraderMachell and
compare POC/VAH/VAL by eye before each release. Zero coupling, zero API
risk. This honours the trader's intent in the only form the platform
permits: a validation instrument rather than an input.

### Data vs geometry

If native *accuracy* (not geometry) is ever wanted, the mechanism is
`requirements: { volumeProfiles: true }` + `d.profile()` ->
`{price, vol, bidVol, askVol}[]`. **VISUAL_V5_SVP.md already evaluated and
deliberately rejected this** because its distribution differs from graded
bar-range binning and the developing profile would stop converging into
the graded session profile at the roll. That reasoning stands and is not
reopened. Flagged only to be explicit: the one real "native anchor"
available is a **data** anchor, rejected on evidence not availability,
and it has no bearing on horizontal orientation either way.

## PART E — NEW AND USEFUL REGARDLESS

- **`VisibilityConditions`** — `GraphicsScope.conditions` with
  `scaleRangeX/Y` in pixels-per-domain-unit lets us declare that a layer
  renders only when bars are >= N px apart. Directly applicable to the
  12,000-stroke row budget: drop the row layer when columns are too
  narrow rather than degrading by priority. **Declarative only — we
  cannot query current px/bar.**
- **Our "chartDescription is only ever a hint" posture is confirmed.** It
  is four fields (`underlyingType, elementSize, elementSizeUnit,
  withHistogram`), the **only** timeframe accessor in the API, and it
  appears in the official repo **exactly once — its own declaration**.
  Zero builtins or examples use it. No documented refresh contract. Also
  `elementSizeUnit` can be `Volume | Range | Renko | MomentumRange |
  PointAndFigure`, on which the minute-slot model is meaningless — our
  `timeBased` guard is well placed.
- **`tradeDate()`** — undeclared in the typings but shipped in
  `builtin/vwap.js` (`d.tradeDate() !== this.tradeDate`) and
  `builtin/pivotPoints.js`. The platform's own trading-day boundary, more
  likely to agree with the axis layout than hand-rolled arithmetic.
  Caveats: undocumented, day-level not session-level (no RTH/ETH split),
  return type unspecified. **Our 17:00-NY `sessionKey` is stricter and
  stays** — but this is worth knowing.
- **There is no published signature for `du()`, `px()`, `op()` at all.**
  `tools/graphics.js` **does not exist in the public repo** (full tree
  listing: CBuffer, EMA, MMA, MovingExtreme, MovingHigh, MovingLow, SMA,
  StdDev, WMA, medianPrice, meta, moneyFlowVolume, plotting, predef,
  trueRange, typicalPrice). The entire published spec of `du()` is one
  sentence: *"In the X axis, domain units are the index of the bar."*
  **That contradicts our live measurement, and the docs never discuss
  session gaps or weekends.** Consequence: **no future documentation will
  ever adjudicate `du()` semantics for us.** Our live measurement is and
  remains the only source of truth — which is the strongest argument for
  making D.4's probe permanent rather than a debug toggle.
- **`op()` is recursive and can mix units** (`+ - * / max min`), so
  "session anchor minus 2px" or a `max()` clamp is one expressible
  coordinate. Our local stub implements only `op` — `min`/`max` are
  untested in the Node sims.
- **The typings are incomplete, not authoritative.** `InputEntity`
  declares only `timestamp()` and `value()`, yet `d.index()` appears 25
  times including in the live published tutorial. Our defensive
  `typeof e.offerVolume === "function"` guards are the correct house
  style for every undeclared method.
- **`tools/meta.js` defines four input types** (`BARS, VOLUME, OHLC,
  ANY`) while `indicator.d.ts` declares three. Trust neither list alone.

### One correction to the study, from direct observation

The study assumed only `tools/` is readable in the in-app Code Explorer.
**Not so — the in-app file tree does expose `builtin/`** (observed
directly: `builtin/sma.js` open in the editor this session), alongside
installed community packages. It remains true that no volume profile
lives there, and the catalogue search in Part A independently confirms
why: the native VP is a drawing tool, not a JS study.
