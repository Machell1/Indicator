/* build.js -- splice dale_core.js into wrapper.js -> TraderMachell.js,
 * the single file to paste into Tradovate's Indicator Editor.
 * dale_core.js stays the source of truth (it is what the regression test
 * proves against the Python harness). */

'use strict';
const fs = require('fs');
const path = require('path');

const core = fs.readFileSync(path.join(__dirname, 'dale_core.js'), 'utf8');
const wrapper = fs.readFileSync(path.join(__dirname, 'wrapper.js'), 'utf8');

// strip the Node-only export block from the core
const coreBody = core.replace(
  /\/\/ Node \+ Tradovate-module compatibility[\s\S]*$/,
  ''
).replace(/^'use strict';$/m, '');

const banner = `/*
 * TraderMachell -- Tradovate custom indicator
 * Dale volume-profile model with backtest-earned evidence tags.
 * Generated ${new Date().toISOString().slice(0, 10)} by build.js -- do not edit by hand;
 * edit dale_core.js / wrapper.js and rebuild.
 *
 * Core math is regression-verified: identical POC/VAH/VAL to the Python
 * research harness on all 205 GCQ6 sessions (test_core.js), and the
 * wrapper survived a 110k-bar platform simulation under both candidate
 * live-engine models (sim_tradovate.js).
 *
 * HONESTY BOX (provenance of the on-chart grade tags):
 *  - Delta here = offerVolume - bidVolume (all the indicator API exposes).
 *    The grades were measured on upVolume - downVolume: corr 0.87, exact
 *    match on 24% of bars. Signature + flow-quit timing may differ a
 *    little from the backtest; levels/profiles are delta-free.
 *  - Grades were measured with NO time-of-day gate; this indicator (like
 *    the MT5 version and the playbook) only signals 09:00-11:00 NY.
 *  - Signals require the prior session to pass the harness liquidity gate
 *    (>= 2000 contracts, >= 120 minutes) -- thin sessions draw levels
 *    flagged [THIN] and stand down, matching how the grades were measured.
 *  - 1-minute bars are the graded configuration; other minute sizes are
 *    scaled approximations and the chart says so.
 *  - Signature/flow-quit volume+range statistics use a trailing ~2-hour
 *    window (live-causal). The backtest used whole-session statistics,
 *    which are impossible without lookahead and, computed causally, made
 *    absorption undetectable in NY hours. Same concept, local calibration.
 *  - No alerts: Tradovate custom indicators cannot fire alerts. This tool
 *    draws; the playbook's alert-driven routine stays on MT5.
 *
 * INSTALL: Tradovate -> Charts module -> Indicators -> Indicator Editor
 * (Code Explorer) -> New Indicator -> replace the template with this whole
 * file -> Save. Add "TraderMachell" to a 1-MINUTE chart of the front-month
 * GC/MGC contract (modern Chart module, not Legacy Chart). Set the chart's
 * "Bars to Load" as high as it allows (the 20-session HTF composite needs
 * deep history; it degrades gracefully and simply omits HTF lines when
 * history is short).
 */
`;

const out = banner + wrapper.replace('/* __CORE_SPLICE__ */', coreBody);
fs.writeFileSync(path.join(__dirname, 'TraderMachell.js'), out);
console.log('wrote TraderMachell.js (' + out.length + ' bytes)');
