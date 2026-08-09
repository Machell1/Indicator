/* sim_synth.js -- CSV-free platform simulation for the VISUAL layer.
 *
 * test_core.js / sim_tradovate.js need the owner's GCQ6 dataset; this sim
 * generates deterministic synthetic GC-like sessions instead, so anyone can
 * run the wrapper's rendering invariants after a display change:
 *
 *   node build.js && node sim_synth.js
 *
 * Streams ~12 sessions of 1-min bars through the BUILT TraderMachell.js
 * under BOTH candidate live-engine models (A: closed bars re-mapped once
 * with isComplete=true; B: closed bars never re-mapped), then asserts:
 *   1. no exceptions, model B core not frozen;
 *   2. graphics on the last bar: unique keys, Text items all styled
 *      (fontSize+fill), no mixed-unit op() on any X coordinate;
 *   3. rectangle rows: positive du widths/heights only (negative-width
 *      rects are not in the proven-to-render set);
 *   4. VERTICAL ALIGNMENT: the prev-profile POC row straddles the core's
 *      exact POC price; every prev-profile row lies inside the profile's
 *      true price span; the value-area band spans exactly VAL..VAH;
 *   5. HTF ghost rows anchor at x0 - width (true left mirror);
 *   6. right-edge labels: no two occupy the same (price, dy) slot --
 *      the de-collision layout did its job.
 *
 * Uses the ./tools dev stubs (Node-only). NOT a substitute for
 * test_core.js / sim_tradovate.js on the real dataset. */

'use strict';
const mod = require('./TraderMachell.js');

// ---- deterministic synthetic GCQ6-like 1-min sessions -------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function synthBars() {
  const rnd = mulberry32(20260809);
  const bars = [];
  // sessions open 17:00 ET (21:00 UTC in August DST) and run 23h
  let t = Date.parse('2026-07-19T21:00:00Z');
  let price = 3390;
  for (let s = 0; s < 12; s++) {
    const sessionDrift = (rnd() - 0.5) * 4;
    for (let m = 0; m < 1380; m++) {
      const hourUTC = new Date(t).getUTCHours();
      const ny = hourUTC >= 13 && hourUTC < 17;        // NY morning-ish
      const volBase = ny ? 120 : 25;
      const amp = ny ? 0.5 : 0.2;
      const o = price;
      const c = price + (rnd() - 0.5) * amp + sessionDrift / 1380;
      const h = Math.max(o, c) + rnd() * amp * 0.6;
      const l = Math.min(o, c) - rnd() * amp * 0.6;
      const vol = Math.round(volBase * (0.5 + rnd()));
      const dlt = Math.round((rnd() - 0.5) * vol * 0.6);
      bars.push({ tMs: t, o, h, l, c,
        vol, offv: Math.max(0, (vol + dlt) / 2), bidv: Math.max(0, (vol - dlt) / 2) });
      price = c;
      t += 60e3;
    }
    t += 60 * 60e3;                                    // 1h maintenance halt
  }
  return bars;
}

function entity(b, isLast, isComplete) {
  return {
    timestamp: () => new Date(b.tMs),
    open: () => b.o, high: () => b.h, low: () => b.l, close: () => b.c,
    value: () => b.c, volume: () => b.vol,
    offerVolume: () => b.offv, bidVolume: () => b.bidv,
    isLast: () => isLast, isComplete: () => isComplete,
    index: () => -1, tradeDate: () => 0, ticks: () => 0, profile: () => undefined,
  };
}
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

const bars = synthBars();
const Calc = mod.calculator;

function runModel(model, liveTail, props) {
  const inst = new Calc();
  inst.props = props || { htfSessions: 20, alignTest: 1 };
  inst.contractInfo = { contract: 'GCQ6', product: 'GC', tickSize: 0.1 };
  inst.chartDescription = {
    underlyingType: 'MinuteBar', elementSize: 1,
    elementSizeUnit: 'UnderlyingUnits', withHistogram: false,
  };
  inst.init();
  const n = bars.length;
  const histSplit = n - liveTail;
  let lastResult = null, threw = 0;
  const ents = [];
  try {
    for (let i = 0; i < histSplit; i++)
      ents.push(entity(bars[i], i === histSplit - 1, i < histSplit - 1));
    for (let i = 0; i < histSplit; i++)
      lastResult = inst.map(ents[i], i, makeHistory(ents.slice(0, i + 1)));
    for (let i = histSplit; i < n; i++) {
      if (model === 'A') {
        ents[i - 1] = entity(bars[i - 1], false, true);
        lastResult = inst.map(ents[i - 1], i - 1, makeHistory(ents.slice(0, i)));
      } else {
        ents[i - 1] = entity(bars[i - 1], false, true);
      }
      ents.push(entity(bars[i], true, false));
      const h = makeHistory(ents.slice(0, i + 1));
      for (let r = 0; r < 2; r++) lastResult = inst.map(ents[i], i, h);
    }
    if (model === 'A') {
      ents[n - 1] = entity(bars[n - 1], true, true);
      lastResult = inst.map(ents[n - 1], n - 1, makeHistory(ents));
    }
  } catch (e) {
    threw++;
    console.log(`model ${model} THREW: ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
  }
  return { inst, lastResult, threw };
}

const A = runModel('A', 2000);
const B = runModel('B', 2000);
const n = bars.length;
const items = A.lastResult && A.lastResult.graphics ? A.lastResult.graphics.items : [];
const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); };

check(A.threw === 0 && B.threw === 0, 'exceptions thrown');
check(B.inst.lastPushedMs === bars[n - 2].tMs, 'model B core froze');
check(items.length > 0, 'no graphics items on last bar');

// -- key/style hygiene + no mixed-unit X coords --
const keys = items.map(x => x.key);
check(new Set(keys).size === keys.length,
  'duplicate keys: ' + keys.filter((k, i) => keys.indexOf(k) !== i).join(','));
check(items.filter(x => x.tag === 'Text' &&
  !(x.style && x.style.fontSize && x.style.fill)).length === 0,
  'Text items missing style');
const xOfPoint = p => p && p.x;
for (const it of items) {
  const pts = [];
  if (it.tag === 'Text') pts.push(xOfPoint(it.point));
  if (it.tag === 'LineSegments')
    for (const ln of it.lines) { pts.push(xOfPoint(ln.a), xOfPoint(ln.b)); }
  if (it.tag === 'Shapes')
    for (const pr of it.primitives) pts.push(xOfPoint(pr.position));
  for (const p of pts)
    check(!p || p.unit !== 'op', 'mixed-unit op() on an X coordinate: ' + it.key);
  check(!(it.lineStyle && 'opacity' in it.lineStyle), 'lineStyle.opacity used: ' + it.key);
}

// -- rectangles: positive sizes only --
const rectsOf = key => {
  const it = items.find(x => x.key === key);
  return it ? it.primitives : [];
};
for (const it of items) {
  if (it.tag !== 'Shapes') continue;
  for (const pr of it.primitives) {
    check(pr.size.width.v > 0, 'non-positive rect width in ' + it.key);
    check(pr.size.height.v > 0, 'non-positive rect height in ' + it.key);
  }
}

// -- vertical alignment: prev-profile POC row must straddle the exact POC --
const core = A.inst.core;
const span = pr => {
  const lo = pr.position.y.v;             // RECT_Y_ANCHOR === 'bottom'
  return [lo, lo + pr.size.height.v];
};
const pocRects = rectsOf('pproP');
check(pocRects.length > 0, 'no POC row in prev profile');
if (pocRects.length) {
  const [lo, hi] = span(pocRects[0]);
  check(lo <= core.prev.poc && core.prev.poc <= hi,
    `POC row [${lo.toFixed(2)},${hi.toFixed(2)}] misses POC ${core.prev.poc.toFixed(2)}`);
}
const profLo = core.prev.lo;
let profHi = -Infinity;
for (const k of core.prev.vol.keys())
  profHi = Math.max(profHi, core.prev.lo + (k + 1) * core.prev.step);
for (const k of ['pproM', 'pproV', 'pproP'])
  for (const pr of rectsOf(k)) {
    const [lo, hi] = span(pr);
    check(lo >= profLo - core.prev.step && hi <= profHi + core.prev.step,
      `prev row [${lo.toFixed(2)},${hi.toFixed(2)}] outside profile span`);
  }

// -- value-area band spans exactly VAL..VAH --
const vaB = rectsOf('vaB');
check(vaB.length === 1, 'value-area band missing');
if (vaB.length) {
  const [lo, hi] = span(vaB[0]);
  check(Math.abs(lo - core.prev.val) < 1e-9 && Math.abs(hi - core.prev.vah) < 1e-9,
    'value-area band does not span VAL..VAH');
}

// -- HTF ghost: left-anchored mirror, x + width never crosses right of x0 --
const dayItem = items.find(x => x.key === 'pocL');
const x0 = dayItem ? dayItem.lines[0].a.x.v : null;
for (const k of ['hproM', 'hproV', 'hproP'])
  for (const pr of rectsOf(k))
    check(pr.position.x.v + pr.size.width.v <= x0 + 1e-9,
      'HTF ghost row crosses right of the session start');

// -- labels: no two share the same (price, dy) slot --
const lxItems = items.filter(x => x.tag === 'Text' && !x.origin &&
  x.textAlignment === 'rightMiddle');
check(lxItems.length > 0, 'no right-edge labels');
const slots = new Set();
for (const t of lxItems) {
  const y = t.point.y;
  const slot = y.unit === 'op' ? `${y.a.v}@${y.b.v}` : `${y.v}@0`;
  check(!slots.has(slot), 'label collision at slot ' + slot + ' (' + t.key + ')');
  slots.add(slot);
}

// -- alignment self-test row present and centered on PREV POC --
const aln = rectsOf('alnR');
check(aln.length === 1, 'alignTest row missing');
if (aln.length) {
  const [lo, hi] = span(aln[0]);
  check(Math.abs((lo + hi) / 2 - core.prev.poc) < 1e-9,
    'alignTest row not centered on PREV POC');
}

// -- part 2: forced-worst-case frame -----------------------------------
// The random walk rarely fires the signal machines or packs levels close
// enough to collide, so fabricate both on the surviving instance and
// rebuild the frame: levels within fractions of an ATR of each other,
// plus signal/absorption/flow-quit marks in the current session.
{
  const inst = A.inst;
  const out = inst.lastOut;
  const atr = out.atr || 1;
  const poc = out.prev.poc;
  out.prev = { poc, vah: poc + 0.1 * atr, val: poc - 0.1 * atr, liquid: true };
  out.htf = { poc: poc + 0.05 * atr, vah: poc + 0.15 * atr,
    val: poc - 0.15 * atr, sessions: 12 };
  out.nakedPocs = [
    { poc: poc + 0.02 * atr, endTms: inst.tmsList[inst.tmsList.length - 300] },
    { poc: poc - 0.03 * atr, endTms: inst.tmsList[inst.tmsList.length - 600] },
  ];
  out.leg = { level: poc + 0.07 * atr, down: false };
  const sigT = inst.tmsList[inst.tmsList.length - 50];
  const abT = inst.tmsList[inst.tmsList.length - 80];
  inst.marks.push(
    { tMs: abT, price: poc, day: out.day, ev: { kind: 'absorb', long: true } },
    { tMs: sigT, price: poc, day: out.day,
      ev: { kind: 'prior-poc', tMs: sigT, day: out.day, long: true,
        entry: poc, sl: poc - 0.12 * atr, tp: poc + 0.08 * atr, level: poc,
        tag: '[stack tested +0.40R/80% n10]', htf: '[HTF aligned]' } },
    { tMs: inst.tmsList[inst.tmsList.length - 20], price: poc, day: out.day,
      ev: { kind: 'flowquit' } });
  const lastEnt = entity(bars[n - 1], true, true);
  const items2 = inst.buildItems(lastEnt, n - 1, null);
  const keys2 = items2.map(x => x.key);
  check(new Set(keys2).size === keys2.length, 'part2: duplicate keys');
  check(items2.filter(x => x.tag === 'Text' &&
    !(x.style && x.style.fontSize && x.style.fill)).length === 0,
    'part2: Text items missing style');
  const lab2 = items2.filter(x => x.tag === 'Text' && !x.origin &&
    x.textAlignment === 'rightMiddle');
  // 11 clustered labels: PREV POC/VAH/VAL, 2 NPOC, HTF POC/VAH/VAL, LEG, TP, SL
  check(lab2.length === 11, 'part2: expected 11 labels, got ' + lab2.length);
  const slots2 = new Set();
  let stacked = 0;
  for (const t of lab2) {
    const y = t.point.y;
    const slot = y.unit === 'op' ? `${y.a.v}@${y.b.v}` : `${y.v}@0`;
    check(!slots2.has(slot), 'part2: label collision at ' + slot + ' (' + t.key + ')');
    slots2.add(slot);
    if (y.unit === 'op') stacked++;
  }
  check(stacked >= 10, 'part2: clustered labels were not fanned apart');
  check(items2.some(x => x.key.startsWith('sgA')), 'part2: signal arrow missing');
  check(items2.some(x => x.key === 'abT'), 'part2: absorption label missing');
  check(items2.some(x => x.key === 'tpL') && items2.some(x => x.key === 'slL'),
    'part2: TP/SL rays missing');
  console.log('part2 forced frame:         ' + items2.length + ' items, ' +
    lab2.length + ' labels, ' + stacked + ' fanned');
}

// -- part 3: px fallback mode (scaledWidths=0, the v2 proven path) ------
{
  const P = runModel('A', 500, { htfSessions: 20, scaledWidths: 0 });
  const it3 = P.lastResult && P.lastResult.graphics ? P.lastResult.graphics.items : [];
  check(P.threw === 0, 'part3: px mode threw');
  check(it3.length > 0, 'part3: px mode drew nothing');
  for (const it of it3) {
    if (it.tag !== 'Shapes') continue;
    check(!it.key.startsWith('hpro'),
      'part3: HTF ghost drawn in px mode (needs unproven negative widths)');
    check(it.key !== 'vaB', 'part3: du-width VA band drawn in px mode');
    for (const pr of it.primitives) {
      check(pr.size.width.unit === 'px' && pr.size.width.v > 0,
        'part3: non-px or non-positive row width in ' + it.key);
      check(pr.size.height.v > 0, 'part3: non-positive rect height in ' + it.key);
    }
  }
  console.log('part3 px-fallback frame:    ' + it3.length + ' items');
}

const kindsOf = c => {
  const k = {};
  for (const e of c.events) k[e.kind] = (k[e.kind] || 0) + 1;
  return JSON.stringify(k);
};
console.log('bars streamed:             ', n);
console.log('model A signals:           ', kindsOf(A.inst.core));
console.log('model B signals:           ', kindsOf(B.inst.core));
check(kindsOf(A.inst.core) === kindsOf(B.inst.core), 'A/B signal mismatch');
console.log('graphics items on last bar:', items.length,
  ' tags:', JSON.stringify([...new Set(items.map(x => x.tag))]));
console.log('right-edge labels:         ', lxItems.length);

if (fails.length) {
  for (const f of fails) console.log('FAIL:', f);
  console.log('\nRESULT: FAIL');
  process.exit(1);
}
console.log('\nRESULT: PASS (rendering invariants, both engine models)');
