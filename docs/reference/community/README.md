# Community indicator study index (2026-08-10)

Trader-provided sources studied for platform techniques (private-use
repo; findings below are our own notes — the load-bearing source,
`MTF_KeyLevels.js` (MPL-2.0), is committed verbatim in this directory;
the others live in the project chat record and can be re-committed on
request).

| Source | Key findings for TraderMachell |
|---|---|
| MTF Key Levels (MPL-2.0, committed) | The anchoring study: timeframe-blind by design; levels drawn `du(0)→du(index+ext)`. Drove the v11 anchor-free level conversion + observation-always barMin. |
| Market Structure (fractals) | Claims `bar.index()` fixes X alignment vs raw indices → the passive `bidx=` diag probe. Also: `Circle` primitives; non-`global` per-bar graphics retention. |
| VZO Profile | The v2-era ancestor. New learnings from full source: `origin {cs:'grid', h:'right'}` containers (index-free right-edge placement) and negative px widths rendering in that context. |
| Previous Day Levels | `Intl.DateTimeFormat` works in the sandbox; `infiniteStart` full-width level lines (adopted in v11); mixed-unit `op(du,+,px)` used on a TEXT point (our mixed-op fact was measured on Line endpoints — primitive-specific?). |
| Smart-FVG | Independent confirmation of our v10 plotter architecture (per-bar map returns read back in a custom plotter). Manual dash technique for plotter lines. |
| Tuumz Killzones | `fillStyle: {opacity}` as a separate property (never tested by us — candidate for items-pipeline translucency) and `ContourShapes` outline rectangles (candidate replacement for 4-line brackets). Both queued for a live probe. |
