/* sim_tradovate.js -- simulate the Tradovate runtime around TraderMachell.js:
 * stream the full GCQ6 dataset through map() with mock bar entities, replay
 * the final bar as a developing bar several times (platform behavior), and
 * verify (a) no exceptions, (b) graphics output, (c) signal count matches a
 * direct DaleCore run, (d) no double-processing of bars. */

'use strict';
const fs = require('fs');
const path = require('path');
const { DaleCore } = require('./dale_core.js');
const mod = require('./TraderMachell.js');

function loadCsv(p) {
  const lines = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const idx = {};
  head.forEach((h, i) => { idx[h] = i; });
  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const ts = c[idx.timestamp];
    const tMs = Date.parse(ts.endsWith('Z') ? ts : ts + 'Z');
    const uv = parseFloat(c[idx.upVolume] || '0') || 0;
    const dv = parseFloat(c[idx.downVolume] || '0') || 0;
    const bv = parseFloat(c[idx.bidVolume] || '0') || 0;
    const ov = parseFloat(c[idx.offerVolume] || '0') || 0;
    bars.push({
      tMs, o: parseFloat(c[idx.open]), h: parseFloat(c[idx.high]),
      l: parseFloat(c[idx.low]), c: parseFloat(c[idx.close]),
      vol: uv + dv, delta: uv - dv, bidv: bv, offv: ov,
    });
  }
  bars.sort((a, b) => a.tMs - b.tMs);
  return bars;
}

function entity(b, isLast, isComplete) {
  return {
    timestamp: () => new Date(b.tMs),
    open: () => b.o, high: () => b.h, low: () => b.l, close: () => b.c,
    value: () => b.c, volume: () => b.vol,
    // platform delta = offerVolume - bidVolume; our CSV's up/down mirrors it
    offerVolume: () => b.offv || Math.max(0, (b.vol + b.delta) / 2),
    bidVolume: () => b.bidv || Math.max(0, (b.vol - b.delta) / 2),
    isLast: () => isLast, isComplete: () => isComplete,
    index: () => -1, tradeDate: () => 0, ticks: () => 0, profile: () => undefined,
  };
}

const bars = loadCsv(path.join(__dirname, '..', 'data_tv', 'TV_GCQ6_1min.csv'));

// ---- reference: direct core run with the wrapper's scaled config ----
// NOTE: fed with the PLATFORM's delta definition (offerVolume - bidVolume),
// which is what the deployed indicator will see. The backtest used
// upVolume - downVolume; on this dataset the two correlate 0.87 and match
// exactly on only 24% of bars -- a documented caveat, not a code issue.
const ref = new DaleCore({
  htfSessions: 20,
  signalStartMinute: 18 * 60,
  signalEndMinute: 2 * 60,
  signalWindowLabel: 'ASIA 18:00-02:00 NY',
});
for (const b of bars) ref.push(Object.assign({}, b, {
  delta: (b.offv || Math.max(0, (b.vol + b.delta) / 2)) -
         (b.bidv || Math.max(0, (b.vol - b.delta) / 2)),
}));
const refKinds = {};
for (const e of ref.events) refKinds[e.kind] = (refKinds[e.kind] || 0) + 1;

// ---- simulated platform runs, under BOTH candidate live-engine models ----
// Model A: when a bar closes the engine re-maps it once with isComplete=true.
// Model B (the freeze risk the review flagged): closed bars are NEVER
// re-mapped; the engine just starts calling map() for the new developing
// bar. The wrapper's history walk-back must keep the core advancing.
const Calc = mod.calculator;

function makeHistory(entities) {
  return {
    data: entities,
    get: k => entities[k],
    size: () => entities.length,
    prior: () => entities[entities.length - 2],
    back: nn => entities[entities.length - 1 - nn],
    first: () => entities[0],
    last: () => entities[entities.length - 1],
  };
}

function runModel(model, liveTail) {
  const inst = new Calc();
  inst.props = { htfSessions: 20 };
  inst.contractInfo = { contract: 'GCQ6', product: 'GC', tickSize: 0.1 };
  inst.chartDescription = {
    underlyingType: 'MinuteBar', elementSize: 1,
    elementSizeUnit: 'UnderlyingUnits', withHistogram: false,
  };
  inst.init();
  const n = bars.length;
  const histSplit = n - liveTail;      // bars before this arrive as history
  let lastResult = null, threw = 0;
  const ents = [];
  try {
    // initial historical pass: all closed, last one developing
    for (let i = 0; i < histSplit; i++)
      ents.push(entity(bars[i], i === histSplit - 1, i < histSplit - 1));
    for (let i = 0; i < histSplit; i++)
      lastResult = inst.map(ents[i], i, makeHistory(ents.slice(0, i + 1)));
    // live phase: one bar at a time
    for (let i = histSplit; i < n; i++) {
      // previous bar closes
      if (model === 'A') {
        ents[i - 1] = entity(bars[i - 1], false, true);
        lastResult = inst.map(ents[i - 1], i - 1, makeHistory(ents.slice(0, i)));
      } else {
        ents[i - 1] = entity(bars[i - 1], false, true);  // closed in history only
      }
      // new developing bar maps repeatedly, never complete under model B
      ents.push(entity(bars[i], true, false));
      const h = makeHistory(ents.slice(0, i + 1));
      for (let r = 0; r < 2; r++) lastResult = inst.map(ents[i], i, h);
    }
    // final bar completes (model A only)
    if (model === 'A') {
      ents[n - 1] = entity(bars[n - 1], true, true);
      lastResult = inst.map(ents[n - 1], n - 1, makeHistory(ents));
    }
  } catch (e) {
    threw++;
    console.log(`model ${model} THREW: ${e.stack.split('\n').slice(0, 2).join(' | ')}`);
  }
  return { inst, lastResult, threw };
}

const A = runModel('A', 3000);
const B = runModel('B', 3000);
const inst = A.inst;
const lastResult = A.lastResult;
const threw = A.threw + B.threw;
const n = bars.length;

const kindsOf = c => {
  const k = {};
  for (const e of c.events) k[e.kind] = (k[e.kind] || 0) + 1;
  return JSON.stringify(k);
};
console.log('model A signals:', kindsOf(A.inst.core), ' model B signals:', kindsOf(B.inst.core));
console.log('model B froze?  ', B.inst.lastPushedMs === bars[n - 1 - 1].tMs
  ? 'no - core advanced to the final closed bar' : 'YES - FROZEN at ' + B.inst.lastPushedMs);

const simKinds = {};
for (const m of inst.marks) if (m.ev.kind !== 'flowquit')
  simKinds[m.ev.kind] = (simKinds[m.ev.kind] || 0) + 1;
const coreKinds = {};
for (const e of inst.core.events) coreKinds[e.kind] = (coreKinds[e.kind] || 0) + 1;

const items = lastResult && lastResult.graphics ? lastResult.graphics.items : [];
const keys = items.map(x => x.key);
const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
const badItems = items.filter(x => x.tag === 'Text'
  ? !(x.style && x.style.fontSize && x.style.fill) : false);

console.log('bars streamed:            ', n);
console.log('exceptions:               ', threw);
console.log('reference core signals:   ', JSON.stringify(refKinds));
console.log('model A wrapper signals:  ', JSON.stringify(coreKinds));
console.log('graphics items on last bar:', items.length,
  ' tags:', JSON.stringify([...new Set(items.map(x => x.tag))]));
console.log('duplicate keys:           ', dupKeys.length ? dupKeys : 'none');
console.log('Text items missing style: ', badItems.length);

const bFroze = B.inst.lastPushedMs !== bars[n - 2].tMs;
const pass = threw === 0 &&
  JSON.stringify(refKinds) === JSON.stringify(coreKinds) &&
  kindsOf(A.inst.core) === kindsOf(B.inst.core) &&
  !bFroze && items.length > 0 && dupKeys.length === 0 && badItems.length === 0;
console.log(pass ? '\nRESULT: PASS (both engine models)' : '\nRESULT: FAIL');
