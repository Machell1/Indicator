/* Regression test: stream TV_GCQ6_1min.csv through DaleCore and compare
 * every finalized session's POC/VAH/VAL against the Python harness dump
 * (levels_py.json from harness/dump_levels.py). Also sanity-counts signals. */

'use strict';
const fs = require('fs');
const path = require('path');
const { DaleCore } = require('./dale_core.js');

function loadCsv(p) {
  const lines = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const idx = {};
  head.forEach((h, i) => { idx[h] = i; });
  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const ts = c[idx.timestamp];                     // 2026-08-06T22:00Z
    const tMs = Date.parse(ts.endsWith('Z') ? ts : ts + 'Z');
    const uv = parseFloat(c[idx.upVolume] || '0') || 0;
    const dv = parseFloat(c[idx.downVolume] || '0') || 0;
    bars.push({
      tMs,
      o: parseFloat(c[idx.open]), h: parseFloat(c[idx.high]),
      l: parseFloat(c[idx.low]), c: parseFloat(c[idx.close]),
      vol: uv + dv, delta: uv - dv,
    });
  }
  bars.sort((a, b) => a.tMs - b.tMs);
  return bars;
}

const recorded = [];
class RecCore extends DaleCore {
  _finalizeSession() {
    const d = this.day;
    super._finalizeSession();
    const last = this.sessions[this.sessions.length - 1];
    if (last && last.key === d && this.prev)
      recorded.push({ day: d, n: last.bars.length,
        poc: this.prev.poc, vah: this.prev.vah, val: this.prev.val });
  }
}

const bars = loadCsv(path.join(__dirname, '..', 'data_tv', 'TV_GCQ6_1min.csv'));
const core = new RecCore();
for (const b of bars) core.push(b);
core._finalizeSession();   // flush the last session

const py = JSON.parse(fs.readFileSync(path.join(__dirname, 'levels_py.json'), 'utf8'));
const jsBy = new Map(recorded.map(r => [r.day, r]));

let ok = 0, bad = 0, missing = 0;
const TOL = 1e-6;
for (const p of py) {
  const j = jsBy.get(p.day);
  if (!j) { missing++; console.log(`MISSING in JS: ${p.day} (py n=${p.n})`); continue; }
  const dPoc = Math.abs(j.poc - p.poc), dVah = Math.abs(j.vah - p.vah), dVal = Math.abs(j.val - p.val);
  if (dPoc < TOL && dVah < TOL && dVal < TOL && j.n === p.n) ok++;
  else {
    bad++;
    console.log(`MISMATCH ${p.day}: n ${j.n}/${p.n}  dPOC=${dPoc.toExponential(2)} `
      + `dVAH=${dVah.toExponential(2)} dVAL=${dVal.toExponential(2)}`);
  }
}
const extra = recorded.filter(r => !py.some(p => p.day === r.day));
for (const e of extra) console.log(`EXTRA in JS: ${e.day} (n=${e.n})`);

console.log(`\nsessions: py=${py.length} js=${recorded.length}  `
  + `MATCH=${ok}  MISMATCH=${bad}  MISSING=${missing}  EXTRA=${extra.length}`);

const kinds = {};
for (const e of core.events) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
console.log('signals fired while streaming:', JSON.stringify(kinds));
const fq = core.events.length;
console.log(ok === py.length && bad === 0 && missing === 0 && extra.length === 0
  ? 'RESULT: PASS -- JS core reproduces the Python profile math exactly'
  : 'RESULT: FAIL');
