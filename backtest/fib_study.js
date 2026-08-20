/* fib_study.js -- does session-leg fib confluence take more trades and/or
 * improve performance? Runs the regression-locked DaleCore over the real
 * GCQ6 dataset (graded delta basis: upVolume-downVolume) and simulates
 * SL/TP outcomes for gate variants. MEASUREMENT ONLY -- no live gating
 * changes ship unless the numbers earn them.
 * Assumptions (stated): outcomes resolved bar-by-bar after entry; if SL
 * and TP are both inside one bar, it counts as a LOSS (conservative);
 * open trades mark-to-close at the session roll; one open trade at a
 * time per variant. Fib levels use session extremes as of the entry bar
 * (known at the close that fires the signal -- no lookahead). */
'use strict';
const fs = require('fs');
const path = require('path');
const { DaleCore, sessionKey } = require('../indicator/dale_core.js');

const lines = fs.readFileSync(path.join(__dirname, '..', 'data_tv', 'TV_GCQ6_1min.csv'), 'utf8').trim().split(/\r?\n/);
const head = lines[0].split(','); const idx = {};
head.forEach((h, i) => { idx[h] = i; });
const bars = [];
for (let i = 1; i < lines.length; i++) {
  const c = lines[i].split(',');
  const ts = c[idx.timestamp];
  const uv = +(c[idx.upVolume] || 0) || 0, dv = +(c[idx.downVolume] || 0) || 0;
  bars.push({ tMs: Date.parse(ts.endsWith('Z') ? ts : ts + 'Z'),
    o: +c[idx.open], h: +c[idx.high], l: +c[idx.low], c: +c[idx.close],
    vol: uv + dv, delta: uv - dv });
}
bars.sort((a, b) => a.tMs - b.tMs);

const FIB_R = [0.382, 0.5, 0.618, 0.786];

function run(name, cfg) {
  const core = new DaleCore(cfg);
  let day = null, hi = -Infinity, lo = Infinity, hiT = 0, loT = 0;
  const trades = [];
  let open = null;
  let seen = 0;
  for (const b of bars) {
    const k = sessionKey(b.tMs);
    if (k !== day) {
      if (open) { // mark-to-close at the roll
        open.r = (open.long ? bars[open.i].c - open.entry : open.entry - bars[open.i].c) / open.risk;
        open.exit = 'roll'; trades.push(open); open = null;
      }
      day = k; hi = -Infinity; lo = Infinity;
    }
    if (b.h > hi) { hi = b.h; hiT = b.tMs; }
    if (b.l < lo) { lo = b.l; loT = b.tMs; }
    const out = core.push(b);
    open && (open.i = seen);
    if (open) {
      const s = open;
      const hitSl = s.long ? b.l <= s.sl : b.h >= s.sl;
      const hitTp = s.long ? b.h >= s.tp : b.l <= s.tp;
      if (hitSl) { s.r = -1; s.exit = 'sl'; trades.push(s); open = null; }
      else if (hitTp) { s.r = Math.abs(s.tp - s.entry) / s.risk; s.exit = 'tp'; trades.push(s); open = null; }
    }
    if (out.signal && !open) {
      const sg = out.signal;
      const risk = Math.abs(sg.entry - sg.sl);
      if (risk > 0) {
        // fib confluence at entry time
        let fib = false;
        if (hi > lo && out.atr > 0) {
          const up = hiT >= loT, span = hi - lo;
          for (const r of FIB_R) {
            const p = up ? hi - r * span : lo + r * span;
            if (Math.abs(sg.level - p) < 0.15 * out.atr) fib = true;
          }
        }
        open = { kind: sg.kind, long: sg.long, entry: sg.entry, sl: sg.sl,
          tp: sg.tp, risk, fib, tMs: sg.tMs, i: seen };
      }
    }
    seen++;
  }
  if (open) { open.r = 0; open.exit = 'eod'; trades.push(open); }
  return { name, trades };
}

function report(tag, ts) {
  if (!ts.length) { console.log(`  ${tag}: n=0`); return; }
  const w = ts.filter(t => t.r > 0).length;
  const tot = ts.reduce((a, t) => a + t.r, 0);
  console.log(`  ${tag}: n=${ts.length} win=${(100 * w / ts.length).toFixed(0)}% avgR=${(tot / ts.length).toFixed(3)} totR=${tot.toFixed(2)}`);
}

const variants = [
  ['V0 baseline (graded gates: 09-11 NY window)', {}],
  ['V1 window OFF (all hours)', { nyStartHour: 0, nyEndHour: 24 }],
];
for (const [name, cfg] of variants) {
  const { trades } = run(name, cfg);
  console.log(name);
  report('ALL        ', trades);
  report('fib-conflu ', trades.filter(t => t.fib));
  report('no-fib     ', trades.filter(t => !t.fib));
  for (const kind of ['prior-poc', 'accum', 'leg']) {
    report(kind.padEnd(11), trades.filter(t => t.kind === kind));
  }
  console.log('');
}

// bootstrap CI (10k resamples) on the key cell: V1 fib-confluent avgR
const v1 = run('V1', { nyStartHour: 0, nyEndHour: 24 }).trades;
const fibT = v1.filter(t => t.fib);
const rs = fibT.map(t => t.r);
if (rs.length >= 3) {
  const means = [];
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let b = 0; b < 10000; b++) {
    let s = 0;
    for (let j = 0; j < rs.length; j++) s += rs[Math.floor(rnd() * rs.length)];
    means.push(s / rs.length);
  }
  means.sort((a, b) => a - b);
  console.log(`V1 fib-confluent avgR bootstrap 95% CI: [${means[249].toFixed(2)} .. ${means[9749].toFixed(2)}] (n=${rs.length})`);
  console.log('fib subset by kind: ' + JSON.stringify(fibT.reduce((m, t) => (m[t.kind] = (m[t.kind] || 0) + 1, m), {})));
  console.log('fib subset R values: ' + rs.map(r => r.toFixed(2)).join(', '));
}
