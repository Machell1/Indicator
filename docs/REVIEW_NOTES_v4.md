# v4 adversarial review — results and follow-ups

v4 (PR #2) was reviewed pre-deployment by a 17-agent adversarial pass (5
independent lenses, every surviving finding attacked by 2 refuters against
the actual code). Outcome: **the v4 design is sound** — the opaque-band fix,
the prop-delivery model, and the solid-hex palette all held up. Four small
wrapper defects were found and fixed on top of your branch (see the merge
commit):

1. **htfSessions 1–4 starved HTF forever** *(confirmed 2/2)* — the core
   builds no composite below 5 sessions; a dialog value of 1–4 passed `pNum`
   unclamped, permanently nulling HTF while the banner said "needs more
   history". Fixed: clamped to `max(5, round(...))` in `init()`.
2. **HTF mirror could emit negative du x** — with shallow history
   (`2 < x0 < wHtf`), left-mirrored rows anchored at `x0 - w < 0`, an
   unproven coordinate region (and rays elsewhere are all clamped to 0).
   Fixed: mirror max width capped at `x0` (shape preserved, proportional).
3. **Per-session profiles keyed by loop position** — `"sp"+s` swaps identity
   across all six profiles at every 17:00 NY roll (the A8 defect class you
   fixed for naked POCs). Fixed: keyed by `sp.start` timestamp.
4. **Delta-proxy disclosure missing** — the platform-facts registry says the
   bid/ask-vs-up/down delta caveat is "disclosed in banner — do not remove",
   but no wrapper version ever drew it. Fixed: added to the stat3 ctx line.

All gates re-verified after the fixes: test_core 205/205, sim_tradovate PASS
(both models), sim_synth PASS.

## Sim-hardening follow-ups (refuted as deploy blockers, real as coverage gaps)

The refuters confirmed these are *accurate observations* about `sim_synth.js`
even though no current-code defect escapes them. Worth closing next pass so
the invariants enforce what VISUAL_V4.md says they enforce:

- **Solid-hex invariant runs on a signal-free frame.** The deterministic
  synthetic walk fires zero engine events, so signal/mark/ACCUM/LEG items
  are never color-checked. Add a forced-event frame (or lint the source
  colors table) so an rgba slipping into those paths actually fails.
- **"No filled band" is a key-name ban.** `items.every(x => x.key !== 'vaB')`
  passes if a filled band returns under any other key. Replace with a
  structural invariant: no Shapes rect may span more than N row pitches
  vertically, or allowlist rect-emitting key prefixes.
- **Prev-profile span check has ~40 pitches of slack below the profile**
  (`prev.lo` is `gridLo = sessionLow − 40*step`), and VA rows are never
  asserted to lie within VAL..VAH. Tighten to the true row extent.
- **Layer-absence is not detected.** If the HTF ghost or session profiles
  silently stop being emitted, no check fires. Assert expected item-key
  families exist when their data exists.
- **Model B frames get no graphics assertions** and the A/B signal-parity
  check compares two empty sets. Assert graphics invariants on model B's
  final frame too, and make the parity check require ≥1 signal or skip
  loudly.

Also noted during review (documentation): `docs/VISUAL_V4.md` claims the
11-case prop torture and hex enforcement — both exist, but with the
coverage caveats above.

---

## Addendum after the v5/v6 review (2026-08-09)

**Process regression to avoid repeating:** the v5 commit was authored on a
pre-fix copy of wrapper.js — it silently REVERTED all four applied fixes
above (they are re-applied in the v6 merge) and deleted this document.
Please branch from current main, not from a local copy of your last PR.

**All five sim-hardening follow-ups above are still open** (verified by
mutation against the v6 tree). Two new ones from the v6 review:
- part5 LVN/HVN invariant is near-vacuous: an empty tick set passes, and a
  tick up to 10 rows from a qualifying shelf still passes.
- VISUAL_V5_SVP.md promises the developing profile after ~10 bars; the code
  gate is 30 bars on 1-min. Align doc or code.

**Fixed on top of v6 in the merge (see commit):** guarded the three
load-time surfaces of the vaFill feature (tools/plotting require,
paramSpecs.color, plotters.custom) so a missing API degrades to "no vaFill"
instead of "no indicator"; per-bar vaLo/vaHi now resolved from each bar's
OWN sessionKey instead of lastOut (wrong-session stamping under model A
re-maps / model B first-of-session); plotter walk capped at 20k bars per
frame; diag dump extended to all v5/v6 params; developing-profile POC row
recolored from graded gold to the dev teal-green (evidence-honesty).
