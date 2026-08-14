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
 *      true price span; the value-area ZONE outline spans exactly VAL..VAH
 *      and no filled band exists (live Bug A, 2026-08-09);
 *   5. OPAQUE-SAFE COLORS: every fill/line/text color is solid #RRGGBB --
 *      fill alpha proved unreliable live, nothing may rely on it;
 *   6. HTF ghost rows anchor at x0 - width (true left mirror);
 *   7. right-edge labels: no two occupy the same (price, dy) slot --
 *      the de-collision layout did its job;
 *   8. prop-coercion torture: bools/strings/numbers/undefined all gate
 *      width mode and alignTest identically (live Bug B, 2026-08-09).
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
  // shared default runs stay on the v9.3 opaque-rows path (rowsPlot: '0')
  // so parts 1/2/8's Shapes invariants keep guarding it; the v10 plotter
  // default is exercised by part 19 with its own props
  inst.props = props || { htfSessions: 20, alignTest: 1, rowsPlot: '0' };
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

// -- SVP layer: the current session's box holds the DEVELOPING profile
// (default devProfile=1); the v4 prev projection must be absent --
const core = A.inst.core;
const span = pr => {
  const lo = pr.position.y.v;             // RECT_Y_ANCHOR === 'bottom'
  return [lo, lo + pr.size.height.v];
};
check(items.every(x => !x.key.startsWith('ppro')),
  'prev-session projection drawn despite devProfile default');
// independently recompute the developing profile with the engine's own
// exports and grid convention -- the drawn dPOC must match EXACTLY
const { buildProfile } = require('./dale_core.js');
let dLo = Infinity, dHi = -Infinity;
for (const b of core.dayBars) {
  if (b.l < dLo) dLo = b.l;
  if (b.h > dHi) dHi = b.h;
}
const dProf = buildProfile(core.dayBars,
  Math.max((dHi - dLo) / core.cfg.rows, 1e-9));
check(!!dProf, 'reference developing profile failed to build');
const dpocRay = items.find(x => x.key === 'dpocL');
check(!!dpocRay, 'developing dPOC ray missing');
if (dpocRay && dProf)
  check(dpocRay.lines[0].a.y.v === dProf.poc,
    `dPOC ray ${dpocRay.lines[0].a.y.v} != engine-math POC ${dProf.poc}`);
for (const k of ['dvahL', 'dvalL'])
  check(items.some(x => x.key === k), 'developing ray missing: ' + k);
const dPocRects = rectsOf('dproP');
check(dPocRects.length > 0, 'no POC row in developing profile');
if (dPocRects.length && dProf) {
  const [lo, hi] = span(dPocRects[0]);
  check(lo <= dProf.poc && dProf.poc <= hi,
    `dev POC row [${lo.toFixed(2)},${hi.toFixed(2)}] misses POC ${dProf.poc.toFixed(2)}`);
}
if (dProf) {
  let profHi = -Infinity;
  for (const k of dProf.vol.keys())
    profHi = Math.max(profHi, dProf.lo + (k + 1) * dProf.step);
  for (const k of ['dproM', 'dproV', 'dproP'])
    for (const pr of rectsOf(k)) {
      const [lo, hi] = span(pr);
      check(lo >= dProf.lo - dProf.step && hi <= profHi + dProf.step,
        `dev row [${lo.toFixed(2)},${hi.toFixed(2)}] outside profile span`);
    }
}

// -- value-area ZONE: dashed outline (line primitives, never a fill --
// live 2026-08-09 proved fill alpha is not honored), spans exactly
// VAL..VAH from the session start --
const vaZ = items.find(x => x.key === 'vaZ');
check(!!vaZ && vaZ.tag === 'LineSegments', 'value-area zone outline missing');
if (vaZ) {
  const ys = [];
  for (const ln of vaZ.lines) { ys.push(ln.a.y.v, ln.b.y.v); }
  check(Math.abs(Math.min(...ys) - core.prev.val) < 1e-9 &&
    Math.abs(Math.max(...ys) - core.prev.vah) < 1e-9,
    'value-area zone does not span VAL..VAH');
}
check(items.every(x => x.key !== 'vaB'), 'filled VA band still present (Bug A)');

// -- opaque-safe colors: EVERY color must be a solid hex (#RRGGBB). Any
// rgba()/alpha reliance is a regression of live Bug A. --
const solidHex = c => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c);
for (const it of items) {
  if (it.fillStyle)
    check(solidHex(it.fillStyle.color), 'non-hex fill color in ' + it.key + ': ' + it.fillStyle.color);
  if (it.lineStyle)
    check(solidHex(it.lineStyle.color), 'non-hex line color in ' + it.key + ': ' + it.lineStyle.color);
  if (it.tag === 'Text' && it.style)
    check(solidHex(it.style.fill), 'non-hex text color in ' + it.key + ': ' + it.style.fill);
}

// -- banner shows the effective width mode --
const stat3 = items.find(x => x.key === 'stat3');
check(!!stat3 && (stat3.text.indexOf('[du]') >= 0 || stat3.text.indexOf('[px]') >= 0),
  'banner missing effective mode marker');
check(stat3 && stat3.text.indexOf('[du]') >= 0, 'expected [du] mode in default run');

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
  // slot includes the anchor x: the global column sits at i+4 while each
  // session's key-value stack anchors at its own profile edge
  const slot = t.point.x.v + ':' +
    (y.unit === 'op' ? `${y.a.v}@${y.b.v}` : `${y.v}@0`);
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
  out.absorbZones = [{
    price: poc, bidVol: 1200, offerVol: 400,
    firstTms: abT, lastTms: sigT, tag: "POC",
  }];
  inst.props = Object.assign({}, inst.props || {}, { absorbMarks: 1 });
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
    x.textAlignment === 'rightMiddle' && x.point.x.v === (n - 1) + 4);
  // 14 labels in the GLOBAL right-edge column (per-session key values
  // anchor at their own profile edges and are excluded by the x filter):
  // PREV POC/VAH/VAL, 2 NPOC, HTF POC/VAH/VAL, LEG, TP, SL + dPOC/dVAH/dVAL
  check(lab2.length >= 14, 'part2: expected >= 14 labels, got ' + lab2.length);
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
  check(items2.some(x => x.key.startsWith('absT')) || items2.some(x => x.key === 'abT'),
    'part2: absorption zone/label missing');
  check(items2.some(x => x.key === 'tpL') && items2.some(x => x.key === 'slL'),
    'part2: TP/SL rays missing');
  console.log('part2 forced frame:         ' + items2.length + ' items, ' +
    lab2.length + ' labels, ' + stacked + ' fanned');
}

// -- part 3: px fallback mode (scaledWidths=0, the v2 proven path).
// Props passed as STRINGS to mirror worst-case platform delivery. --
{
  const P = runModel('A', 500, { htfSessions: '20', scaledWidths: '0' });
  const it3 = P.lastResult && P.lastResult.graphics ? P.lastResult.graphics.items : [];
  check(P.threw === 0, 'part3: px mode threw');
  check(it3.length > 0, 'part3: px mode drew nothing');
  const s3 = it3.find(x => x.key === 'stat3');
  check(!!s3 && s3.text.indexOf('[px]') >= 0, 'part3: banner does not say [px]');
  check(it3.some(x => x.key === 'vaZ'), 'part3: VA zone outline missing in px mode');
  for (const it of it3) {
    if (it.tag !== 'Shapes') continue;
    check(!it.key.startsWith('hpro'),
      'part3: HTF ghost drawn in px mode (needs unproven negative widths)');
    for (const pr of it.primitives) {
      check(pr.size.width.unit === 'px' && pr.size.width.v > 0,
        'part3: non-px or non-positive row width in ' + it.key);
      check(pr.size.height.v > 0, 'part3: non-positive rect height in ' + it.key);
    }
  }
  console.log('part3 px-fallback frame:    ' + it3.length + ' items');
}

// -- part 3b: devProfile=0 restores the v4 layout (prev projection at the
// session start, no developing profile/levels). String prop again. --
{
  const P = runModel('A', 500, { htfSessions: 20, devProfile: '0' });
  const it = P.lastResult && P.lastResult.graphics ? P.lastResult.graphics.items : [];
  check(P.threw === 0, 'part3b: devProfile=0 threw');
  check(it.some(x => x.key.startsWith('ppro')),
    'part3b: prev projection missing with devProfile=0');
  check(it.every(x => !x.key.startsWith('dpro') && x.key !== 'dpocL'),
    'part3b: developing profile drawn despite devProfile=0');
  console.log('part3b v4-layout frame:     ' + it.length + ' items');
}

// -- part 4: prop-coercion torture. Live 2026-08-09 proved prop delivery
// cannot be trusted (bool values arrived undefined while the dialog showed
// them). Every representation a platform could plausibly send must gate
// the SAME way. --
{
  const inst = new Calc();
  inst.chartDescription = { underlyingType: 'MinuteBar', elementSize: 1 };
  inst.contractInfo = { tickSize: 0.1 };
  const cases = [
    // [props, expected duMode, expected alignTest]
    [{}, true, false],                                        // nothing delivered
    [{ scaledWidths: undefined, alignTest: undefined }, true, false],
    [{ scaledWidths: false, alignTest: false }, false, false],
    [{ scaledWidths: 'false', alignTest: 'false' }, false, false],  // string bools
    [{ scaledWidths: '0', alignTest: '0' }, false, false],
    [{ scaledWidths: 0, alignTest: 0 }, false, false],
    [{ scaledWidths: true, alignTest: true }, true, true],
    [{ scaledWidths: 'true', alignTest: 'true' }, true, true],
    [{ scaledWidths: '1', alignTest: '1' }, true, true],
    [{ scaledWidths: 1, alignTest: 1 }, true, true],
    [{ scaledWidths: 'garbage', alignTest: 'garbage' }, true, false], // fall to defaults
  ];
  for (const [props, wantDu, wantAlign] of cases) {
    inst.props = Object.assign({ htfSessions: 20 }, props);
    inst.init();
    const o = inst._opts();
    const desc = JSON.stringify(props);
    check(o.duMode === wantDu, `part4: duMode!=${wantDu} for props ${desc}`);
    check(o.alignTest === wantAlign, `part4: alignTest!=${wantAlign} for props ${desc}`);
  }
  // htfSessions coercion: strings and garbage
  inst.props = { htfSessions: '35' };
  inst.init();
  check(inst.core.cfg.htfSessions === 35, 'part4: htfSessions string not coerced');
  inst.props = { htfSessions: 'NaN' };
  inst.init();
  check(inst.core.cfg.htfSessions === 20, 'part4: htfSessions garbage not defaulted');
  console.log('part4 prop coercion:        ' + cases.length + ' cases OK');
}

// -- part 5: HVN/LVN node ticks must satisfy the ENGINE's own criteria --
// (checked on the pre-part2 frame: `items` and core.prev are consistent)
{
  const prof = core.prev;
  const pocV = prof.vol.get(prof.pocRow) || 0;
  const rowV = price => {
    const k = Math.round((price - prof.lo) / prof.step - 0.5);
    // run centers of even-length runs land on a row boundary; accept the
    // lower-volume side
    return Math.min(prof.vol.get(k) || 0, prof.vol.get(k + 1) || 0);
  };
  const ndL = items.find(x => x.key === 'ndL');
  const ndH = items.find(x => x.key === 'ndH');
  const CFGl = require('./dale_core.js').CFG;
  if (ndL) {
    check(ndL.lines.length <= 4, 'part5: too many LVN ticks');
    for (const ln of ndL.lines)
      check(rowV(ln.a.y.v) < CFGl.lvnFrac * pocV,
        'part5: LVN tick at ' + ln.a.y.v.toFixed(2) + ' fails the engine stop criterion');
  }
  if (ndH) {
    check(ndH.lines.length <= 3, 'part5: too many HVN ticks');
    for (const ln of ndH.lines) {
      const k = Math.round((ln.a.y.v - prof.lo) / prof.step - 0.5);
      check((prof.vol.get(k) || 0) >= 0.6 * pocV,
        'part5: HVN tick at ' + ln.a.y.v.toFixed(2) + ' below 60% of POC volume');
    }
  }
  console.log('part5 node ticks:           ' +
    (ndL ? ndL.lines.length : 0) + ' LVN, ' + (ndH ? ndH.lines.length : 0) + ' HVN');
}

// -- part 6: the optional vaFill canvas plotter --
{
  const custom = (mod.plotter || []).filter(pl => pl && pl.type === 'custom');
  check(custom.length === 1, 'part6: expected exactly one custom plotter');
  const fn = custom.length ? custom[0].fn : null;
  const draws = [];
  const canvas = {
    drawLine: (a, b, style) => draws.push({ a, b, style }),
    drawPath: () => draws.push({ path: true }),
  };
  const mkHist = arr => ({ data: arr, get: i => arr[i] });
  const hist = mkHist([
    { __x: 0, vaLo: 100, vaHi: 110 },
    { __x: 1, vaLo: 100, vaHi: 110 },
    { __x: 2 },                          // no session data yet: must skip
  ]);
  if (fn) {
    // default off: zero draws
    fn(canvas, { props: {} }, hist);
    check(draws.length === 0, 'part6: plotter drew while vaFill off');
    // on (string prop), custom color, clamped opacity
    fn(canvas, { props: { vaFill: '1', vaFillColor: '#123456', vaFillOpacity: '250' } }, hist);
    check(draws.length === 2, 'part6: expected 2 draws, got ' + draws.length);
    for (const dr of draws) {
      check(dr.style.opacity > 0 && dr.style.opacity <= 1,
        'part6: opacity out of range: ' + dr.style.opacity);
      check(dr.style.color === '#123456', 'part6: color prop not honored');
      check(dr.a.y === 100 && dr.b.y === 110, 'part6: VA span wrong');
    }
    // a throwing history must never propagate (chart safety)
    let threw6 = false;
    try { fn(canvas, { props: { vaFill: 1 } }, { data: { length: 1 }, get: () => { throw new Error('x'); } }); }
    catch (e) { threw6 = true; }
    check(!threw6, 'part6: plotter exception escaped');
  }
  // per-bar map() output must carry the session VA for the plotter
  check(A.lastResult && A.lastResult.vaLo === core.prev.val &&
    A.lastResult.vaHi === core.prev.vah,
    'part6: map() output missing vaLo/vaHi for the plotter');
  console.log('part6 vaFill plotter:       gating + draws OK');
}

// -- part 7: anchor robustness (live 2026-08-09 afternoon frame: a
// histogram drawn over the final candles). Three failure modes: history
// PREPENDS shifting every index (Q2), the walk-back silently MISSING
// bars (Q3 -> mirror desync), and an unresolvable session anchor. --
{
  const groundTruthX0 = (inst, ents) => {
    const t = inst.lastOut.dayStartTms;
    for (let j = ents.length - 1; j >= 0; j--)
      if (ents[j].timestamp().getTime() === t) return j;
    return -1;
  };
  const anchorOf = items7 => {
    const ln = items7.find(x => x.key === 'dayLn');
    return ln ? ln.lines[0].a.x.v : undefined;
  };
  const occlusionOk = (items7, iLast) => {
    let ok = true;
    for (const it of items7) {
      if (it.tag !== 'Shapes' || !it.key.startsWith('dpro')) continue;
      for (const pr of it.primitives)
        if (pr.size.width.unit === 'du' &&
            pr.position.x.v + pr.size.width.v > iLast - 11) ok = false;
    }
    return ok;
  };

  // 7a: PREPEND -- replay a tail, then back-load older history so every
  // chart index shifts by P; anchors must follow exactly, no desync flag.
  {
    const P = 700, M = 6000;
    const inst = new Calc();
    inst.props = { htfSessions: 20, rowsPlot: '0' };
    inst.contractInfo = { tickSize: 0.1 };
    inst.chartDescription = { underlyingType: 'MinuteBar', elementSize: 1 };
    inst.init();
    let ents = [];
    for (let j = P; j < M; j++) ents.push(entity(bars[j], j === M - 1, j < M - 1));
    let res7;
    for (let j = 0; j < ents.length; j++)
      res7 = inst.map(ents[j], j, makeHistory(ents.slice(0, j + 1)));
    // user pans left: P older bars prepend; the developing bar re-maps
    const pre = bars.slice(0, P).map(b => entity(b, false, true));
    ents = pre.concat(ents);
    res7 = inst.map(ents[ents.length - 1], ents.length - 1, makeHistory(ents));
    // live continues after the prepend
    for (let j = M; j < M + 240; j++) {
      ents[ents.length - 1] = entity(bars[j - 1], false, true);
      ents.push(entity(bars[j], true, false));
      res7 = inst.map(ents[ents.length - 1], ents.length - 1, makeHistory(ents));
    }
    const items7 = res7.graphics.items;
    const want = groundTruthX0(inst, ents);
    check(anchorOf(items7) === want,
      `part7a: anchor ${anchorOf(items7)} != ground truth ${want} after prepend`);
    const s3 = items7.find(x => x.key === 'stat3');
    check(s3 && s3.text.indexOf('desync') < 0, 'part7a: false desync flag');
    check(occlusionOk(items7, ents.length - 1), 'part7a: histogram over the live edge');
  }

  // 7b: MISSED PUSHES -- history.get returns undefined for a stretch, so
  // those bars never enter the mirror. The stored-index anchor must stay
  // exact and the desync marker must appear (tail-offset now disagrees).
  {
    const M = 6000, gapLo = M + 40, gapHi = M + 70;
    const inst = new Calc();
    inst.props = { htfSessions: 20, rowsPlot: '0' };
    inst.contractInfo = { tickSize: 0.1 };
    inst.chartDescription = { underlyingType: 'MinuteBar', elementSize: 1 };
    inst.init();
    const ents = [];
    for (let j = 0; j < M; j++) ents.push(entity(bars[j], j === M - 1, j < M - 1));
    let res7;
    for (let j = 0; j < M; j++)
      res7 = inst.map(ents[j], j, makeHistory(ents.slice(0, j + 1)));
    const blindHistory = arr => {
      const h = makeHistory(arr);
      const get = h.get;
      h.get = k => (k >= gapLo && k <= gapHi) ? undefined : get(k);
      return h;
    };
    // live phase, model B style (closed bars never re-mapped directly):
    // bars in [gapLo, gapHi] are invisible to the walk-back forever
    for (let j = M; j < M + 400; j++) {
      ents[ents.length - 1] = entity(bars[j - 1], false, true);
      ents.push(entity(bars[j], true, false));
      res7 = inst.map(ents[ents.length - 1], ents.length - 1, blindHistory(ents));
    }
    const items7 = res7.graphics.items;
    check(inst.tmsList.length < ents.length, 'part7b: gap did not form');
    const want = groundTruthX0(inst, ents);
    check(anchorOf(items7) === want,
      `part7b: anchor ${anchorOf(items7)} != ground truth ${want} with gappy mirror`);
    const s3 = items7.find(x => x.key === 'stat3');
    check(s3 && s3.text.indexOf('[mirror desync]') >= 0,
      'part7b: desync marker missing from the banner');
    check(occlusionOk(items7, ents.length - 1), 'part7b: histogram over the live edge');
  }

  // 7c: UNRESOLVED ANCHOR -- if the session start is not in the mirror,
  // histograms/zone/marker are hidden (never a last-bar fallback), rays
  // anchor at the chart edge, and the banner says why.
  {
    const inst = A.inst;
    const cut = inst.tmsList.length - 60;   // drop everything before the tail
    inst.tmsList.splice(0, cut);
    inst.idxList.splice(0, cut);
    const items7 = inst.buildItems(entity(bars[n - 1], true, true), n - 1, null);
    for (const k of ['dpro', 'ppro', 'vaZ', 'dayLn', 'alnR', 'ndL', 'ndH', 'hpro'])
      check(items7.every(x => !x.key.startsWith(k)),
        'part7c: ' + k + ' drawn without a resolved anchor');
    const pocL = items7.find(x => x.key === 'pocL');
    check(!!pocL && pocL.lines[0].infiniteStart === true &&
      pocL.lines[0].a.x.v === (n - 1) - 1 && pocL.lines[0].b.x.v === (n - 1) + 2,
      'part7c: level line not in the anchor-free full-width form');
    const s3 = items7.find(x => x.key === 'stat3');
    check(s3 && s3.text.indexOf('[anchor unresolved') >= 0,
      'part7c: unresolved-anchor marker missing');
  }
  console.log('part7 anchor robustness:    prepend, gap-desync, unresolved OK');
}

// -- part 8: WEEKEND-GAP LIVE BOOT (live field report, 2026-08-09 18:00 ET
// open). Reproduces the exact live signature: cached Thu+Fri history is
// replayed at boot; at the live snap the chart TRIMS the head and Sunday
// bars append 49h after Friday's close; history.get is dead during live
// (Q3), so no rebase can fire and base stays 0. Old stored indexes are
// now stale (+T): v6.1 resolved them into the future grid. The fix must
// resolve every anchor exactly (tail-offset trusted while the mirror has
// no known gaps), flag [mirror desync], and never place anything > i. --
{
  const SESS = 1380, T = 354, LIVE = 120;
  const thuFri = bars.slice(0, 2 * SESS);
  const gapMs = 49 * 3600e3 - (bars[2 * SESS].tMs - bars[2 * SESS - 1].tMs);
  const sunday = bars.slice(2 * SESS, 2 * SESS + LIVE)
    .map(b => Object.assign({}, b, { tMs: b.tMs + gapMs }));
  const inst = new Calc();
  inst.props = { htfSessions: 20, rowsPlot: '0' };
  inst.contractInfo = { tickSize: 0.1 };
  inst.chartDescription = { underlyingType: 'MinuteBar', elementSize: 1 };
  inst.init();
  // phase A: cached boot replay (complete bars, indexes 0..N-1)
  const entsA = thuFri.map((b, j) => entity(b, j === thuFri.length - 1, true));
  for (let j = 0; j < entsA.length; j++)
    inst.map(entsA[j], j, makeHistory(entsA.slice(0, j + 1)));
  // phase B: live snap -- head trimmed by T, Sunday bars arrive as
  // model-A direct completes, history.get dead throughout
  const deadHistory = { data: { length: 0 }, get: () => undefined };
  const entsB = thuFri.slice(T).map(b => entity(b, false, true));
  let res8 = null;
  for (let j = 0; j < sunday.length; j++) {
    entsB.push(entity(sunday[j], j === sunday.length - 1, true));
    res8 = inst.map(entsB[entsB.length - 1], entsB.length - 1, deadHistory);
  }
  const items8 = res8.graphics.items;
  const iLast = entsB.length - 1;
  const gt = t => {
    for (let j = entsB.length - 1; j >= 0; j--)
      if (entsB[j].timestamp().getTime() === t) return j;
    return -1;
  };
  check(inst.idxBase === 0, 'part8: base drifted (live signature was base=0)');
  // the current-session anchor AND every old-timestamp anchor must land
  // on the post-trim ground truth
  const dayLn8 = items8.find(x => x.key === 'dayLn');
  check(!!dayLn8, 'part8: session marker missing');
  if (dayLn8)
    check(dayLn8.lines[0].a.x.v === gt(inst.lastOut.dayStartTms),
      `part8: dayStart anchor ${dayLn8.lines[0].a.x.v} != ground truth ${gt(inst.lastOut.dayStartTms)}`);
  let spChecked = 0;
  for (const it of items8) {
    // MP-look row keys: sp<startTms>C<bucket>
    const m8 = it.tag === 'Shapes' && it.key.match(/^sp(\d+)C\d+$/);
    if (!m8) continue;
    const want = gt(Number(m8[1]));
    for (const pr of it.primitives)
      check(pr.position.x.v === want,
        `part8: session profile ${it.key} at ${pr.position.x.v} != ground truth ${want}`);
    spChecked++;
  }
  check(spChecked > 0, 'part8: no historical session profiles to verify');
  // nothing anywhere may sit in the future grid
  for (const it of items8) {
    if (it.tag === 'Shapes')
      for (const pr of it.primitives)
        check(pr.position.x.v <= iLast - 10,
          'part8: rect in the future grid: ' + it.key + '@' + pr.position.x.v);
    if (it.tag === 'LineSegments')
      for (const ln of it.lines)
        for (const p8 of [ln.a, ln.b])
          check(p8.x.v <= iLast + 8,
            'part8: line in the future grid: ' + it.key + '@' + p8.x.v);
  }
  const s38 = items8.find(x => x.key === 'stat3');
  check(s38 && s38.text.indexOf('[mirror desync]') >= 0,
    'part8: stale stored indexes not flagged as desync');
  check(s38 && s38.text.indexOf('[anchor overshoot]') < 0,
    'part8: false overshoot flag');

  // 8b: force the failure the guard exists for -- trust flipped to the
  // stored path (mirror flagged gappy) while the stored frame is stale
  // enough to resolve past the live bar (the live frame's "displaced into
  // the future grid" class). Overshooting anchors must be SUPPRESSED and
  // flagged, never drawn.
  inst.mirrorGapped = true;
  inst.idxList = inst.idxList.map(v => v + 3000);
  const items8b = inst.buildItems(entsB[iLast], iLast, null);
  const s38b = items8b.find(x => x.key === 'stat3');
  check(s38b && s38b.text.indexOf('[anchor overshoot]') >= 0,
    'part8b: overshoot marker missing');
  check(s38b && s38b.text.indexOf('[anchor unresolved') >= 0,
    'part8b: unresolved marker missing');
  check(items8b.every(x => x.key !== 'dayLn' && !/^(dpro|ppro|sp\d)/.test(x.key)),
    'part8b: stale-anchored layer still drawn');
  for (const it of items8b) {
    if (it.tag === 'Shapes')
      for (const pr of it.primitives)
        check(pr.position.x.v <= iLast + 8, 'part8b: rect in the future grid: ' + it.key);
    if (it.tag === 'LineSegments')
      for (const ln of it.lines)
        for (const p8 of [ln.a, ln.b])
          check(p8.x.v <= iLast + 8, 'part8b: line in the future grid: ' + it.key);
  }
  console.log('part8 weekend-gap boot:     ' + spChecked +
    ' session profiles exact, desync flagged, overshoot guard OK');
}

// -- part 9: wrong-but-in-range anchors (live field report section 5).
// 9a: levels whose timestamps PREDATE the loaded history (bars-to-load
// 3000 vs a Thursday rotation) must anchor at the chart LEFT edge with
// the offscreen marker -- never near x0/the live edge, which fabricated
// the gold ACCUM ray at the session start on live. 9b: an in-range stale
// resolution must raise [anchor mismatch: <layers>] with names. --
{
  // 9a: fabricate an ACCUM window + naked POC born before the mirror
  const inst = A.inst;               // parts 7c already trimmed its mirror;
  const t0 = inst.tmsList[0];        // still valid: entries are the tail
  const iLast = n - 1;
  const out9 = inst.lastOut;
  const mirrorMid = inst.tmsList[Math.floor(inst.tmsList.length / 2)];
  out9.accum = { level: out9.prev.poc + 1, short: false,
    start: t0 - 3600e3,              // one hour before loaded history
    end: mirrorMid, winHi: out9.prev.poc + 2, winLo: out9.prev.poc - 1,
    rows: null };
  out9.nakedPocs = [{ poc: out9.prev.poc + 3, endTms: t0 - 7200e3 }];
  const items9 = inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  const accL9 = items9.find(x => x.key === 'accL');
  check(!!accL9 && accL9.lines[0].infiniteStart === true,
    'part9a: pre-history ACCUM level not anchor-free');
  check(items9.every(x => x.key !== 'accB' && !x.key.startsWith('apro')),
    'part9a: ACCUM box/histogram drawn with an unresolvable start');
  const nk9 = items9.find(x => x.key.startsWith('nk'));
  check(!!nk9 && nk9.lines[0].infiniteStart === true,
    'part9a: pre-history naked level not anchor-free');
  const s39 = items9.find(x => x.key === 'stat3');
  check(s39 && s39.text.indexOf('[old anchors offscreen') >= 0,
    'part9a: offscreen marker missing');
  check(s39 && s39.text.indexOf('[anchor mismatch') < 0,
    'part9a: false mismatch flag');

  // 9b: gapped mode with a uniformly stale stored frame IN RANGE (the
  // guard-invisible class): items keep drawing per the trust hierarchy,
  // but the mismatch cross-check must name the divergent layers.
  inst.mirrorGapped = true;
  inst.idxList = inst.idxList.map(v => v - 40);   // stale by 40, stays in range
  const items9b = inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  const s39b = items9b.find(x => x.key === 'stat3');
  check(s39b && s39b.text.indexOf('[anchor mismatch:') >= 0,
    'part9b: mismatch marker missing');
  // (this instance's mirror head was trimmed by part 7c, so the session
  // start is "unresolved" rather than mismatched -- the layers that DO
  // resolve through the stale frame must be named)
  check(s39b && /\[anchor mismatch: [a-z,?]*accum/.test(s39b.text),
    'part9b: divergent layer names missing: ' + (s39b ? s39b.text : ''));
  check(s39b && s39b.text.indexOf('[mirror desync]') >= 0,
    'part9b: desync flag missing alongside mismatch');
  console.log('part9 in-range anchors:     offscreen edge-anchor + mismatch naming OK');
}

// -- part 10: emitted-geometry invariant + section-6 audit guards. The
// live report's lens: nothing may render in the future grid no matter
// where an x came from; ACCUM windows must be non-inverted; histograms
// ending near the live edge must cap; far-left windows self-describe. --
{
  const R10 = runModel('A', 500);
  const inst = R10.inst;
  const iLast = n - 1;
  const L10 = inst.tmsList;
  const frame = () => inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  const mkAcc = (sIdx, eIdx) => {
    const o = inst.lastOut;
    o.accum = { level: o.prev.poc + 1, short: false,
      start: L10[sIdx], end: L10[eIdx],
      winHi: o.prev.poc + 2, winLo: o.prev.poc - 1,
      rows: [{ price: o.prev.poc, frac: 1, inVA: true, isPoc: true, h: 0.5 }] };
  };

  // 10a: fresh window ending 10 bars from the live edge: box draws, the
  // histogram is width-capped so it cannot cross the edge, no flags, no
  // provenance marker (window is inside the current session)
  mkAcc(L10.length - 60, L10.length - 10);
  let it10 = frame();
  check(it10.some(x => x.key === 'accB'), 'part10a: ACCUM box missing');
  let sawApro = false;
  for (const it of it10) {
    if (it.tag !== 'Shapes' || !it.key.startsWith('apro')) continue;
    sawApro = true;
    for (const pr of it.primitives)
      check(pr.position.x.v + pr.size.width.v <= iLast - 11,
        'part10a: ACCUM histogram crosses the live edge');
  }
  check(sawApro, 'part10a: ACCUM histogram missing');
  let s310 = it10.find(x => x.key === 'stat3');
  check(s310 && s310.text.indexOf('[future-grid') < 0, 'part10a: false future-grid flag');
  let accT10 = it10.find(x => x.key === 'accT');
  check(accT10 && accT10.text.indexOf('\u25C0') < 0, 'part10a: false provenance marker');

  // 10a2: window far LEFT of the session start: the right-edge label must
  // self-describe with the provenance suffix (off-viewport box class)
  mkAcc(100, 400);
  it10 = frame();
  accT10 = it10.find(x => x.key === 'accT');
  check(accT10 && accT10.text.indexOf('\u25C0') >= 0 && /\d+\.\dd/.test(accT10.text),
    'part10a2: provenance suffix missing on far-left window');

  // 10b: poisoned resolution placing x0 at i+1 (legal per the overshoot
  // guard): the node ticks would extend to i+7 -- the emitted-geometry
  // invariant must prune them, name them, and the per-layer cross-check
  // must flag the poisoned day anchor
  const dayTs = inst.lastOut.dayStartTms;
  const orig = inst._idxOf.bind(inst);
  inst._idxOf = (t, e, c) => t === dayTs ? e + 1 : orig(t, e, c);
  it10 = frame();
  check(it10.every(x => x.key !== 'ndL' && x.key !== 'ndH'),
    'part10b: future-grid node ticks not pruned');
  s310 = it10.find(x => x.key === 'stat3');
  check(s310 && s310.text.indexOf('[future-grid item:') >= 0 &&
    s310.text.indexOf('nd') >= 0,
    'part10b: future-grid flag missing or unnamed');
  check(s310 && /\[anchor mismatch: [a-z,?]*day/.test(s310.text),
    'part10b: poisoned day anchor not cross-checked');
  inst._idxOf = orig;

  // 10c: inverted window (stale start resolving newer than end): box and
  // histogram must be suppressed entirely
  mkAcc(L10.length - 10, L10.length - 60);
  it10 = frame();
  check(it10.every(x => x.key !== 'accB' && !x.key.startsWith('apro')),
    'part10c: inverted ACCUM window still drawn');
  console.log('part10 emitted geometry:    caps, pruning, provenance, inversion OK');
}

// -- part 11: MP_55396 look (docs/MP55396_CLONE_SPEC.md section 5). Ramp
// colors on the Blue->Red line and monotone with time (ground truth by
// construction), VA bracket geometry exact vs engine math, prominent
// median switching, median-ray dedupe, no future-grid items. --
{
  const R11 = runModel('A', 500);
  const inst = R11.inst;
  const iLast = n - 1;
  const L11 = inst.tmsList;
  // two controlled sessions overlaid on real mirror timestamps:
  //  FAKE1: 170/200 bars in band A early, 30 in band B late
  //         -> A-rows early (blue-ish), B-rows late (red-ish), POC row
  //         coverage 85% >= 80% -> PROMINENT median
  //  FAKE2: 100/200 in each band -> POC coverage 50% -> plain median
  const mkFake = (posEnd, splitA) => {
    const ts = [];
    for (let j = 0; j < 200; j++) ts.push(L11[L11.length - posEnd + j]);
    const bars11 = [];
    for (let j = 0; j < 200; j++) {
      const inA = j < splitA;
      bars11.push({ tMs: ts[j],
        o: inA ? 100.2 : 104.2, c: inA ? 100.2 : 104.2,
        h: inA ? 100.4 : 104.4, l: inA ? 100.0 : 104.0, vol: 50, delta: 0 });
    }
    return { key: 'FAKE' + posEnd, bars: bars11, startTms: ts[0], rows: null };
  };
  const f1 = mkFake(1400, 170), f2 = mkFake(1100, 100);
  inst.core.sessions.push(f1, f2);
  const items11 = inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  const { buildProfile: bp11 } = require('./dale_core.js');

  // ramp validity: every session-row fill is a pure R/B mix summing 255
  const rampRe = /^#([0-9A-F]{2})00([0-9A-F]{2})$/;
  const bucketsAt = {};   // fake1 band -> set of bucket indexes
  let rampRows = 0;
  for (const it of items11) {
    const m11 = it.tag === 'Shapes' && it.key.match(/^sp(\d+)C(\d+)$/);
    if (!m11) continue;
    const cm = it.fillStyle.color.match(rampRe);
    check(!!cm, 'part11: session row color off the Blue->Red line: ' + it.fillStyle.color);
    if (cm) check(parseInt(cm[1], 16) + parseInt(cm[2], 16) === 255,
      'part11: R+B != 255: ' + it.fillStyle.color);
    rampRows++;
    if (Number(m11[1]) === f1.startTms) {
      for (const pr of it.primitives) {
        const band = pr.position.y.v < 102 ? 'A' : 'B';
        (bucketsAt[band] = bucketsAt[band] || new Set()).add(Number(m11[2]));
      }
    }
  }
  check(rampRows > 0, 'part11: no ramp session rows drawn');
  // monotone with mean time: every early-band bucket < every late-band one
  check(bucketsAt.A && bucketsAt.B, 'part11: fake session bands missing');
  if (bucketsAt.A && bucketsAt.B)
    check(Math.max(...bucketsAt.A) < Math.min(...bucketsAt.B),
      'part11: ramp not monotone with mean time (A=' +
      [...bucketsAt.A] + ' B=' + [...bucketsAt.B] + ')');

  // prominent median on FAKE1 (yellow, width 4), plain on FAKE2
  const med1 = items11.find(x => x.key === 'sp' + f1.startTms + 'M');
  const med2 = items11.find(x => x.key === 'sp' + f2.startTms + 'M');
  check(!!med1 && med1.lineStyle.lineWidth === 4 && med1.lineStyle.color === '#FFFF00',
    'part11: prominent median not yellow/thick');
  check(!!med2 && med2.lineStyle.lineWidth === 1 && med2.lineStyle.color === '#FFFFFF',
    'part11: plain median wrong style');

  // VA bracket: 4 segments, VAH/VAL exact vs an independent engine-math
  // recompute, spans equal to the profile width
  const prof11 = bp11(f1.bars, Math.max((104.4 - 100.0) / inst.core.cfg.rows, 1e-9));
  const brk = items11.find(x => x.key === 'sp' + f1.startTms + 'B');
  check(!!brk && brk.lines.length === 4, 'part11: VA bracket segments != 4');
  if (brk && prof11) {
    const ys = brk.lines.map(l => [l.a.y.v, l.b.y.v]).flat();
    check(Math.abs(Math.max(...ys) - prof11.vah) < 1e-9 &&
      Math.abs(Math.min(...ys) - prof11.val) < 1e-9,
      'part11: bracket VAH/VAL do not match engine math');
    const horiz = brk.lines.filter(l => l.a.y.v === l.b.y.v);
    const medSpan = med1.lines[0].b.x.v - med1.lines[0].a.x.v;
    for (const l of horiz)
      check(l.b.x.v - l.a.x.v === medSpan, 'part11: bracket span != profile width');
  }
  // key values present at the profile edge; median ray present, then
  // deduped when an untested naked POC owns the level
  check(items11.some(x => x.key === 'sp' + f1.startTms + 'TP'),
    'part11: key-value text missing');
  check(items11.some(x => x.key === 'sp' + f1.startTms + 'R'),
    'part11: median ray missing');
  inst.lastOut.nakedPocs = [{ poc: prof11.poc, endTms: f1.bars[10].tMs }];
  const items11b = inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  check(items11b.every(x => x.key !== 'sp' + f1.startTms + 'R'),
    'part11: median ray not deduped against naked POC');
  // v6.4 guards cover the new elements
  const s311 = items11.find(x => x.key === 'stat3');
  check(s311 && s311.text.indexOf('[future-grid') < 0,
    'part11: MP elements tripped the future-grid guard');
  console.log('part11 MP_55396 look:       ramp, medians, bracket, dedupe OK');
}

// -- part 12: MP day-spanning box rules (field report section 8). A
// session whose START predates loaded history is never drawn under any
// fallback and raises the offscreen marker; near-live-edge sessions are
// skipped by the width cap (du) or the px-mode rule; the sp@ telemetry
// lists EVERY session (anchor+width, or why it was skipped) so a
// mis-boxed profile self-identifies in one reading. --
{
  const R12 = runModel('A', 500);
  const inst = R12.inst;
  const iLast = n - 1;
  const L12 = inst.tmsList;
  inst.props = Object.assign({}, inst.props, { diag: 1 });
  const mkBars = (t0, count, priceLo) => {
    const out12 = [];
    for (let j = 0; j < count; j++)
      out12.push({ tMs: t0 + j * 60e3, o: priceLo + 0.2, c: priceLo + 0.2,
        h: priceLo + 0.4, l: priceLo, vol: 40, delta: 0 });
    return out12;
  };
  // (a) pre-history session start: no items, offscreen marker, "pre" in sp@
  const preStart = L12[0] - 86400e3;
  inst.core.sessions.push({ key: 'PRE', bars: mkBars(preStart, 120, 100),
    startTms: preStart, rows: null });
  let it12 = inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  check(it12.every(x => !x.key.startsWith('sp' + preStart)),
    'part12a: pre-history session drawn despite unresolvable start');
  let s312 = it12.find(x => x.key === 'stat3');
  check(s312 && s312.text.indexOf('[old anchors offscreen') >= 0,
    'part12a: offscreen marker missing');
  let s412 = it12.find(x => x.key === 'stat4');
  check(s412 && / sp@[^ ]*pre/.test(s412.text),
    'part12a: telemetry missing "pre" entry: ' + (s412 ? s412.text : ''));
  // (b) session anchored near the live edge: skipped by the cap, telemetry
  // says so, and nothing lands in the future grid
  const nearTs = L12[L12.length - 5];
  inst.core.sessions.push({ key: 'NEAR',
    bars: mkBars(nearTs, 200, 100), startTms: nearTs, rows: null });
  it12 = inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  check(it12.every(x => !x.key.startsWith('sp' + nearTs)),
    'part12b: near-edge session structure drawn');
  s412 = it12.find(x => x.key === 'stat4');
  check(s412 && / sp@[^ ]*cap/.test(s412.text),
    'part12b: telemetry missing "cap" entry: ' + (s412 ? s412.text : ''));
  s312 = it12.find(x => x.key === 'stat3');
  check(s312 && s312.text.indexOf('[future-grid') < 0,
    'part12b: unexpected future-grid flag');
  // (c) telemetry lists every session in the slice (comma count + entries)
  const spField = s412 && s412.text.match(/ sp@([^ ]+)/);
  const nSess = Math.min(6, inst.core.sessions.length);
  check(!!spField && spField[1].split(',').length === nSess,
    'part12c: sp@ does not list all sessions: ' + (spField ? spField[1] : 'missing'));
  // (d) rendered entries carry anchor+width and stay left of the live bar
  if (spField)
    for (const e12 of spField[1].split(',')) {
      const m12 = e12.match(/^(\d+)w(\d+)$/);
      if (m12)
        check(Number(m12[1]) + Number(m12[2]) <= iLast - 10,
          'part12d: rendered session crosses the live bar: ' + e12);
    }
  console.log('part12 MP box rules:        pre-history, near-edge, full sp@ telemetry OK');
}

// -- part 13: du-axis calibration probe (field report section 9). Off by
// default; when on (string prop), labeled verticals at exactly the
// documented du values, labels riding their own lines, the i+60/i+300
// probes surviving into the future grid (the sanctioned guard exception),
// and the price-anchored live-close reference present. --
{
  const R13 = runModel('A', 400);
  const inst = R13.inst;
  const iLast = n - 1;
  const frame13 = () => inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  // default off: zero probe items
  check(frame13().every(x => !x.key.startsWith('cal')),
    'part13: probe items drawn with calib off');
  // on, worst-case string prop
  inst.props = Object.assign({}, inst.props, { calib: '1' });
  const it13 = frame13();
  const want13 = {
    'calLi': iLast, 'calLi-100': iLast - 100, 'calLi-500': iLast - 500,
    'calLi-1000': iLast - 1000, 'calLi-2000': iLast - 2000, 'calL0': 0,
    'calLi+60': iLast + 60, 'calLi+300': iLast + 300,
  };
  for (const k13 of Object.keys(want13)) {
    const ln = it13.find(x => x.key === k13);
    check(!!ln, 'part13: probe line missing: ' + k13);
    if (ln) {
      check(ln.lines[0].a.x.v === want13[k13],
        `part13: ${k13} at ${ln.lines[0].a.x.v} != ${want13[k13]}`);
      const lbl = it13.find(x => x.key === k13.replace('calL', 'calT'));
      check(!!lbl && lbl.point.x.v === want13[k13],
        'part13: label not riding its line: ' + k13);
      check(!!lbl && lbl.text.indexOf('du ' + want13[k13]) >= 0,
        'part13: label does not name its du value: ' + k13);
    }
  }
  // the future probes must SURVIVE the emitted-geometry guard (sanctioned
  // exception), and the guard must not have flagged them
  const s313 = it13.find(x => x.key === 'stat3');
  check(s313 && s313.text.indexOf('[future-grid') < 0,
    'part13: probes tripped the future-grid flag');
  check(s313 && s313.text.indexOf('CALIB ACTIVE') >= 0,
    'part13: banner missing the calib marker');
  // price-anchored live-close reference
  const ref = it13.find(x => x.key === 'calC');
  check(!!ref && ref.lines[0].a.y.v === bars[n - 1].c,
    'part13: live-close reference missing or at wrong price');
  check(it13.some(x => x.key === 'calCT'), 'part13: live-close label missing');
  // no coordinate transform anywhere: emitted anchors are still raw du
  // (probe-first discipline -- the dev profile anchor equals idx(dayStart))
  const dayLn13 = it13.find(x => x.key === 'dayLn');
  const wantX0 = inst._tailRef(inst.lastOut.dayStartTms, iLast);
  check(!!dayLn13 && dayLn13.lines[0].a.x.v === wantX0,
    'part13: a coordinate transform was applied before calibration');
  console.log('part13 calibration probe:   gating, placement, future probes, reference OK');
}

// -- part 14: du minute-slot emission transform (field report section 10).
// Internal logic stays bar-index (all prior parts run with the transform
// OFF via auto mode -- synthetic timestamps are years stale); with
// duTime='1' forced, every emitted x is (timestamp - origin)/60000/barMin:
// origin = current session start (du 0 there, as the probe measured),
// spans widen by halt minutes when crossing a session boundary, the
// origin is shiftable, and within contiguous bars the spaces coincide. --
{
  const R14 = runModel('A', 400);
  const inst = R14.inst;
  const iLast = n - 1;
  const frame14 = () => inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  // auto mode with stale timestamps: transform OFF, banner says [du]
  let it14 = frame14();
  let s314 = it14.find(x => x.key === 'stat3');
  check(s314 && s314.text.indexOf('[du]') >= 0 && s314.text.indexOf('[t-du]') < 0,
    'part14: auto mode engaged the transform on a stale (pre-open-like) chart');
  const dayLnIdx = it14.find(x => x.key === 'dayLn').lines[0].a.x.v;

  // forced minute-slots (worst-case string prop)
  inst.props = Object.assign({}, inst.props, { duTime: '1', calib: '1' });
  it14 = frame14();
  s314 = it14.find(x => x.key === 'stat3');
  check(s314 && s314.text.indexOf('[t-du]') >= 0, 'part14: [t-du] marker missing');
  const originTs = inst.lastOut.dayStartTms;
  const slot = t => (t - originTs) / 60e3;   // barMin = 1 in this sim
  // the session start emits at slot 0 (the probe placed du 0 there)
  const dayLn14 = it14.find(x => x.key === 'dayLn');
  check(!!dayLn14 && dayLn14.lines[0].a.x.v === 0,
    'part14: session start not at slot 0: ' + (dayLn14 ? dayLn14.lines[0].a.x.v : '-'));
  check(dayLnIdx !== 0, 'part14: index-space and slot-space frames indistinguishable');
  // a PRIOR session's anchor emits at its (negative) minute offset --
  // exact timestamp arithmetic, not index arithmetic
  const prevSess = inst.core.sessions[inst.core.sessions.length - 1];
  const spRow14 = it14.find(x => x.tag === 'Shapes' &&
    x.key.startsWith('sp' + prevSess.startTms + 'C'));
  check(!!spRow14, 'part14: prior session profile missing');
  if (spRow14)
    check(spRow14.primitives[0].position.x.v === slot(prevSess.startTms),
      `part14: prior session at ${spRow14.primitives[0].position.x.v} != ` +
      `timestamp slot ${slot(prevSess.startTms)}`);
  // span widening across the maintenance halt: the session box's median
  // spans bars, but in slot space its width must include the halt minutes
  const med14 = it14.find(x => x.key === 'sp' + prevSess.startTms + 'M');
  if (med14) {
    const w = med14.lines[0].b.x.v - med14.lines[0].a.x.v;
    check(Number.isFinite(w) && w > 0, 'part14: median span not finite/positive');
  }
  // probe lines carry post-transform slots and the du=i probe lands at
  // the live bar's true minute offset
  const calI = it14.find(x => x.key === 'calLi');
  check(!!calI && calI.lines[0].a.x.v === slot(bars[n - 1].tMs),
    'part14: du=i probe not at the live bar minute offset');
  const calT14 = it14.find(x => x.key === 'calTi');
  check(!!calT14 && / slot -?\d+/.test(calT14.text),
    'part14: probe label missing the post-transform slot');
  // within contiguous bars the spaces coincide: 50 bars = 50 slots
  check(Math.abs(inst._slotOf(dayLnIdx + 50, originTs) -
    inst._slotOf(dayLnIdx, originTs) - 50) < 1e-9,
    'part14: contiguous-region spacing != 1 slot per bar');
  // originShift calibrates: +120 minutes moves the session start to -120
  inst.props = Object.assign({}, inst.props, { originShift: '120' });
  it14 = frame14();
  const dayLnS = it14.find(x => x.key === 'dayLn');
  check(!!dayLnS && dayLnS.lines[0].a.x.v === -120,
    'part14: originShift not applied: ' + (dayLnS ? dayLnS.lines[0].a.x.v : '-'));
  console.log('part14 minute-slot du:      auto-off, slots, spans, shift, coincide OK');
}

// -- part 15: timeframe anchoring (TIMEFRAME_ANCHORING_SPEC.md section 4).
// 15a: the same session data on 1/5/15/30-minute charts must anchor every
// structure at the same TIMESTAMP (slot arithmetic scales with barMin),
// and the POC/VAH/VAL drift from coarser binning is measured and
// reported as numbers. 15b: a live timeframe switch on a surviving
// instance must self-reset (fresh mirror at the new spacing, correct
// anchors, reloading marker, coarse-bin asterisks). --
{
  const aggTo = (src, k) => {
    const m = new Map();
    for (const b of src) {
      const slot = Math.floor(b.tMs / (k * 60e3)) * k * 60e3;
      let e = m.get(slot);
      if (!e) {
        e = { tMs: slot, o: b.o, h: b.h, l: b.l, c: b.c,
          vol: 0, offv: 0, bidv: 0 };
        m.set(slot, e);
      }
      if (b.h > e.h) e.h = b.h;
      if (b.l < e.l) e.l = b.l;
      e.c = b.c;
      e.vol += b.vol; e.offv += b.offv; e.bidv += b.bidv;
    }
    return [...m.values()].sort((a, b) => a.tMs - b.tMs);
  };
  const src15 = bars.slice(0, 2 * 1380 + 600);   // two sessions + a tail
  const runTf = k => {
    const inst = new Calc();
    inst.props = { htfSessions: 20, duTime: '1', rowsPlot: '0' };
    inst.contractInfo = { tickSize: 0.1 };
    inst.chartDescription = { underlyingType: 'MinuteBar', elementSize: k };
    inst.init();
    const ents = aggTo(src15, k).map((b, j, arr) =>
      entity(b, j === arr.length - 1, true));
    let res15 = null;
    for (let j = 0; j < ents.length; j++)
      res15 = inst.map(ents[j], j, makeHistory(ents.slice(0, j + 1)));
    return { inst, items: res15.graphics.items, k };
  };
  const runs = [1, 5, 15, 30].map(runTf);
  const tsOfSlot = (r, slot) =>
    r.inst.lastOut.dayStartTms + slot * r.k * 60e3;
  // (a) session-start and prior-session anchors identical in TIMESTAMP
  const ref15 = runs[0];
  const refDay = tsOfSlot(ref15, ref15.items.find(x => x.key === 'dayLn').lines[0].a.x.v);
  for (const r of runs) {
    check(r.inst.barMin === r.k, `part15a: barMin ${r.inst.barMin} != ${r.k}`);
    const dl = r.items.find(x => x.key === 'dayLn');
    check(!!dl && tsOfSlot(r, dl.lines[0].a.x.v) === refDay,
      `part15a: ${r.k}M session start at a different timestamp`);
    const prev15 = r.inst.core.sessions[r.inst.core.sessions.length - 1];
    const row15 = r.items.find(x => x.tag === 'Shapes' &&
      x.key.startsWith('sp' + prev15.startTms + 'C'));
    check(!!row15 && tsOfSlot(r, row15.primitives[0].position.x.v) === prev15.startTms,
      `part15a: ${r.k}M prior-session anchor off its timestamp`);
    check(prev15.startTms === runs[0].inst.core.sessions[
      runs[0].inst.core.sessions.length - 1].startTms,
      `part15a: ${r.k}M aggregation shifted the session start timestamp`);
  }
  // (b) measure the section-3 drift: POC/VAH/VAL per timeframe vs 1M
  const lv = runs.map(r => ({ k: r.k, poc: r.inst.core.prev.poc,
    vah: r.inst.core.prev.vah, val: r.inst.core.prev.val }));
  const drift = lv.slice(1).map(x =>
    `${x.k}M dPOC=${(x.poc - lv[0].poc).toFixed(2)} ` +
    `dVAH=${(x.vah - lv[0].vah).toFixed(2)} dVAL=${(x.val - lv[0].val).toFixed(2)}`);
  for (const x of lv)
    check(Number.isFinite(x.poc) && Number.isFinite(x.vah) && Number.isFinite(x.val),
      'part15a: non-finite levels at ' + x.k + 'M');
  // coarse-bin disclosure: 1M labels unmarked, 30M labels asterisked
  const poc1 = runs[0].items.find(x => x.key === 'pocT');
  const poc30 = runs[3].items.find(x => x.key === 'pocT');
  check(!!poc1 && poc1.text.indexOf('*') < 0, 'part15a: 1M label falsely marked');
  check(!!poc30 && /\d\*/.test(poc30.text), 'part15a: 30M label missing the * mark');
  const s315 = runs[3].items.find(x => x.key === 'stat3');
  check(s315 && s315.text.indexOf('* marks 30-min-bin levels') >= 0,
    'part15a: CAUTION line does not explain the mark');

  // 15b: live switch 1M -> 5M on a SURVIVING instance (the platform keeps
  // stale state across timeframe changes -- community-confirmed)
  const inst15 = new Calc();
  inst15.props = { htfSessions: 20 };
  inst15.contractInfo = { tickSize: 0.1 };
  inst15.chartDescription = { underlyingType: 'MinuteBar', elementSize: 1 };
  inst15.init();
  const ents1m = src15.slice(0, 2000).map((b, j) => entity(b, j === 1999, j < 1999));
  for (let j = 0; j < ents1m.length; j++)
    inst15.map(ents1m[j], j, makeHistory(ents1m.slice(0, j + 1)));
  const mirror1m = inst15.tmsList.length;
  // the chart flips to 5M and re-feeds the whole array at the new spacing
  inst15.chartDescription = { underlyingType: 'MinuteBar', elementSize: 5 };
  const ents5m = aggTo(src15.slice(0, 2100), 5).map((b, j, arr) =>
    entity(b, j === arr.length - 1, true));
  let early15 = null, res15b = null;
  for (let j = 0; j < ents5m.length; j++) {
    res15b = inst15.map(ents5m[j], j, makeHistory(ents5m.slice(0, j + 1)));
    if (j === 20) early15 = inst15.buildItems(ents5m[20], 20, null);
  }
  check(inst15.barMin === 5, 'part15b: barMin not rebuilt on switch');
  check(inst15.tmsList.length < mirror1m,
    'part15b: mirror not cleared on switch');
  check(inst15.tmsList[1] - inst15.tmsList[0] === 5 * 60e3,
    'part15b: mirror spacing not 5-minute after switch');
  const sE = early15 && early15.find(x => x.key === 'stat3');
  check(!!sE && sE.text.indexOf('[timeframe changed - reloading]') >= 0,
    'part15b: reloading marker missing while the mirror refills');
  const itF = res15b.graphics.items;
  const sF = itF.find(x => x.key === 'stat3');
  check(sF && sF.text.indexOf('[timeframe changed') < 0,
    'part15b: reloading marker stuck after refill');
  const dlF = itF.find(x => x.key === 'dayLn');
  const gt15 = (() => {
    const t = inst15.lastOut.dayStartTms;
    for (let j = ents5m.length - 1; j >= 0; j--)
      if (ents5m[j].timestamp().getTime() === t) return j;
    return -1;
  })();
  check(!!dlF && dlF.lines[0].a.x.v === gt15,
    'part15b: session anchor displaced after the switch');
  console.log('part15 timeframe anchors:   ts-identical across 1/5/15/30; drift ' +
    drift.join('  ') + '; live switch reset OK');
}

// -- part 16: the 5M->1M reset loop (TIMEFRAME_ANCHORING_SPEC.md sec 5).
// chartDescription stays STALE at MinuteBar/5 after the chart is on
// 1-minute; the fixed detector must derive the new period from observed
// spacing (one finer bar is proof), reset ONCE, ignore the stale
// description afterwards, and revive the chart. Sustained flapping must
// escalate to [reset loop - press F5] with the indicator kept alive. --
{
  const agg16 = (src, k) => {
    const m = new Map();
    for (const b of src) {
      const slot = Math.floor(b.tMs / (k * 60e3)) * k * 60e3;
      let e = m.get(slot);
      if (!e) { e = { tMs: slot, o: b.o, h: b.h, l: b.l, c: b.c, vol: 0, offv: 0, bidv: 0 }; m.set(slot, e); }
      if (b.h > e.h) e.h = b.h;
      if (b.l < e.l) e.l = b.l;
      e.c = b.c; e.vol += b.vol; e.offv += b.offv; e.bidv += b.bidv;
    }
    return [...m.values()].sort((a, b) => a.tMs - b.tMs);
  };
  // phase 1: healthy 5M chart (description correct)
  const inst = new Calc();
  inst.props = { htfSessions: 20, diag: 1 };
  inst.contractInfo = { tickSize: 0.1 };
  inst.chartDescription = { underlyingType: 'MinuteBar', elementSize: 5 };
  inst.init();
  const CUT = 2200;
  const ents5 = agg16(bars.slice(0, CUT), 5).map((b, j, arr) =>
    entity(b, j === arr.length - 1, true));
  for (let j = 0; j < ents5.length; j++)
    inst.map(ents5[j], j, makeHistory(ents5.slice(0, j + 1)));
  check(inst.barMin === 5, 'part16: 5M phase barMin wrong');
  const resets0 = (inst._resetTimes || []).length;
  // phase 2: chart switches to 1M and re-feeds the whole array at 1-min,
  // but chartDescription REMAINS STALE at MinuteBar/5 (the live failure)
  const ents1 = bars.slice(0, CUT + 90).map((b, j, arr) =>
    entity(b, j === arr.length - 1, j < arr.length - 1));
  let res16 = null;
  for (let j = 0; j < ents1.length; j++)
    res16 = inst.map(ents1[j], j, makeHistory(ents1.slice(0, j + 1)));
  const resets1 = (inst._resetTimes || []).length - resets0;
  check(inst.barMin === 1,
    'part16: barMin not derived from observed spacing (still ' + inst.barMin + ')');
  check(resets1 === 1, 'part16: expected exactly 1 reset, got ' + resets1);
  check(!inst._resetLoop, 'part16: false reset-loop escalation');
  check(inst.tmsList.length > 50,
    'part16: mirror did not regrow (' + inst.tmsList.length + ') -- the dead-chart state');
  check(inst.tmsList[1] - inst.tmsList[0] === 60e3,
    'part16: mirror spacing not 1-minute after recovery');
  const it16 = res16.graphics.items;
  check(it16.some(x => x.key === 'dayLn'), 'part16: layers still suppressed after recovery');
  const s316 = it16.find(x => x.key === 'stat3');
  check(s316 && s316.text.indexOf('[timeframe changed') < 0 &&
    s316.text.indexOf('[reset loop') < 0,
    'part16: stuck banner after recovery: ' + (s316 ? s316.text : '-'));
  const s416 = it16.find(x => x.key === 'stat4');
  check(s416 && s416.text.indexOf('tf=MinuteBar/5') >= 0 &&
    s416.text.indexOf('barMin=1') >= 0 && s416.text.indexOf('staleCd=5') >= 0,
    'part16: diag does not show the stale-description override');
  // phase 3: description re-syncs to 1 -> distrust clears; a later PROPER
  // switch to 5M (description updates) must fire detector A again
  inst.chartDescription = { underlyingType: 'MinuteBar', elementSize: 1 };
  const tick1 = entity(Object.assign({}, bars[CUT + 90],
    { tMs: bars[CUT + 90].tMs }), true, true);
  inst.map(tick1, ents1.length, makeHistory(ents1.concat([tick1])));
  check(inst._staleCd === null, 'part16: stale flag not cleared after cd re-sync');
  inst.chartDescription = { underlyingType: 'MinuteBar', elementSize: 5 };
  const ents5b = agg16(bars.slice(0, CUT + 200), 5).map((b, j, arr) =>
    entity(b, j === arr.length - 1, true));
  for (let j = 0; j < 40; j++)
    inst.map(ents5b[j], j, makeHistory(ents5b.slice(0, j + 1)));
  check(inst.barMin === 5, 'part16: proper re-switch to 5M missed after stale episode');

  // phase 4: pathological description flapping -> escalation, alive
  const inst4 = new Calc();
  inst4.props = { htfSessions: 20 };
  inst4.contractInfo = { tickSize: 0.1 };
  inst4.chartDescription = { underlyingType: 'MinuteBar', elementSize: 1 };
  inst4.init();
  const ents4 = bars.slice(0, 200).map((b, j, arr) =>
    entity(b, j === arr.length - 1, true));
  let res4 = null;
  for (let j = 0; j < ents4.length; j++) {
    inst4.chartDescription = { underlyingType: 'MinuteBar',
      elementSize: (j % 2) ? 5 : 1 };
    res4 = inst4.map(ents4[j], j, makeHistory(ents4.slice(0, j + 1)));
  }
  check(inst4._resetLoop === true, 'part16: flapping did not escalate');
  const s3l = res4.graphics.items.find(x => x.key === 'stat3');
  check(s3l && s3l.text.indexOf('[reset loop - press F5]') >= 0,
    'part16: escalation banner missing');
  check(inst4.tmsList.length > 50,
    'part16: indicator not kept alive under escalation (' + inst4.tmsList.length + ')');
  console.log('part16 reset-loop fix:      derive-from-data, single reset, revive, escalate OK');
}

// -- part 17: gauge row widths + the 30M slab class (spec section 7).
// Histogram row widths are visual gauges: in minute-slot mode they must
// equal their raw bar-count width even when the row's index span crosses
// the weekend gap (v8's endpoint transform stretched them into multi-day
// slabs). Session median/bracket/key-values hug the rows; telemetry
// names hpro/apro; the oversize guard prunes runaway rects; per-profile
// key values drop at multi-session density; coarse label pitch widens. --
{
  // 17a: weekend-gap frame in slot mode -- every rect's slot width must
  // equal a legal gauge width (bounded by its family cap)
  const SESS = 1380, LIVE = 200;
  const thuFri = bars.slice(0, 2 * SESS);
  const gapMs = 49 * 3600e3 - (bars[2 * SESS].tMs - bars[2 * SESS - 1].tMs);
  const sunday = bars.slice(2 * SESS, 2 * SESS + LIVE)
    .map(b => Object.assign({}, b, { tMs: b.tMs + gapMs }));
  const all17 = thuFri.concat(sunday);
  const inst = new Calc();
  inst.props = { htfSessions: 20, duTime: '1', diag: 1, rowsPlot: '0' };
  inst.contractInfo = { tickSize: 0.1 };
  inst.chartDescription = { underlyingType: 'MinuteBar', elementSize: 1 };
  inst.init();
  const ents17 = all17.map((b, j, arr) => entity(b, j === arr.length - 1, true));
  let res17 = null;
  for (let j = 0; j < ents17.length; j++)
    res17 = inst.map(ents17[j], j, makeHistory(ents17.slice(0, j + 1)));
  // fabricate an ACCUM window whose row span crosses the weekend gap
  const iaTs = inst.tmsList[2 * SESS - 10];       // 10 bars before the gap
  inst.lastOut.accum = { level: inst.lastOut.prev.poc + 1, short: false,
    start: iaTs, end: inst.tmsList[2 * SESS + 60],
    winHi: inst.lastOut.prev.poc + 2, winLo: inst.lastOut.prev.poc - 1,
    rows: [{ price: inst.lastOut.prev.poc, frac: 1, inVA: true, isPoc: true, h: 0.5 }] };
  const it17 = inst.buildItems(ents17[ents17.length - 1], all17.length - 1, null);
  const capOf = k17 =>
    k17.startsWith('apro') ? inst.wAcc :
    k17.startsWith('hpro') ? inst.wHtf :
    k17.startsWith('dpro') || k17.startsWith('ppro') ? inst.wPrev : 1500;
  let checked17 = 0;
  for (const it of it17) {
    if (it.tag !== 'Shapes') continue;
    for (const pr of it.primitives) {
      if (pr.size.width.unit !== 'du') continue;
      check(pr.size.width.v <= Math.max(capOf(it.key), 1173) + 1e-9,
        `part17a: gauge row wider than its cap: ${it.key} w=${pr.size.width.v}`);
      checked17++;
    }
  }
  check(checked17 > 0, 'part17a: no du rects checked');
  // the ACCUM histogram row crossing the gap must be EXACTLY its bar
  // width in slots (the v8 endpoint transform would have added ~2940)
  const apro17 = it17.find(x => x.key.startsWith('apro'));
  check(!!apro17, 'part17a: ACCUM histogram missing');
  if (apro17)
    check(apro17.primitives[0].size.width.v <= inst.wAcc,
      'part17a: THE SLAB -- gap minutes leaked into a row width: ' +
      apro17.primitives[0].size.width.v);
  // telemetry present
  const s417 = it17.find(x => x.key === 'stat4');
  // hpro reads "-" here legitimately (two sessions < the HTF minimum of
  // five); the field's presence + apro/accB's populated formats prove
  // the telemetry
  check(s417 && / hpro@/.test(s417.text) && / apro@\d+w\d+/.test(s417.text) &&
    / accB@\d+-\d+/.test(s417.text),
    'part17a: hpro/apro/accB telemetry missing: ' + (s417 ? s417.text : '-'));
  // median/bracket hug the rows: bracket horiz width == median width ==
  // wS raw slots (no gap stretching)
  const prev17 = inst.core.sessions[inst.core.sessions.length - 1];
  const med17 = it17.find(x => x.key === 'sp' + prev17.startTms + 'M');
  if (med17) {
    const wMed = med17.lines[0].b.x.v - med17.lines[0].a.x.v;
    check(wMed <= Math.round(prev17.bars.length * 0.85) + 1e-9,
      'part17a: median stretched past the rows: ' + wMed);
  }

  // 17b: oversize guard -- a runaway rect (fake 3000-bar session) is
  // pruned and named
  const fakeTs = inst.tmsList[100];
  const fakeBars = [];
  for (let j = 0; j < 2600; j++)
    fakeBars.push({ tMs: inst.tmsList[100 + j], o: 100.2, c: 100.2,
      h: 100.4, l: 100.0, vol: 40, delta: 0 });
  inst.core.sessions.push({ key: 'HUGE', bars: fakeBars, startTms: fakeTs, rows: null });
  const it17b = inst.buildItems(ents17[ents17.length - 1], all17.length - 1, null);
  const s317b = it17b.find(x => x.key === 'stat3');
  check(it17b.every(x => !(x.tag === 'Shapes' && x.key.startsWith('sp' + fakeTs + 'C'))),
    'part17b: oversize rows not pruned');
  check(s317b && s317b.text.indexOf('[oversize item:') >= 0,
    'part17b: oversize marker missing');
  inst.core.sessions.pop();

  // 17c: label rules -- per-profile key values dropped at 30M density,
  // global pitch widened so far-apart-in-price labels cluster on a
  // weeks-wide view
  const agg17 = (src, k) => {
    const m = new Map();
    for (const b of src) {
      const slot = Math.floor(b.tMs / (k * 60e3)) * k * 60e3;
      let e = m.get(slot);
      if (!e) { e = { tMs: slot, o: b.o, h: b.h, l: b.l, c: b.c, vol: 0, offv: 0, bidv: 0 }; m.set(slot, e); }
      if (b.h > e.h) e.h = b.h;
      if (b.l < e.l) e.l = b.l;
      e.c = b.c; e.vol += b.vol; e.offv += b.offv; e.bidv += b.bidv;
    }
    return [...m.values()].sort((a, b) => a.tMs - b.tMs);
  };
  const inst30 = new Calc();
  inst30.props = { htfSessions: 20, rowsPlot: '0' };
  inst30.contractInfo = { tickSize: 0.1 };
  inst30.chartDescription = { underlyingType: 'MinuteBar', elementSize: 30 };
  inst30.init();
  const ents30 = agg17(bars.slice(0, 4 * SESS + 600), 30).map((b, j, arr) =>
    entity(b, j === arr.length - 1, true));
  let res30 = null;
  for (let j = 0; j < ents30.length; j++)
    res30 = inst30.map(ents30[j], j, makeHistory(ents30.slice(0, j + 1)));
  const it30 = res30.graphics.items;
  check(it30.some(x => x.tag === 'Shapes' && /^sp\d+C\d+$/.test(x.key)),
    'part17c: no session profiles at 30M');
  check(it30.every(x => !/^sp\d+T[HPL]$/.test(x.key)),
    'part17c: per-profile key values still drawn at 30M density');
  // 1M keeps them (part 11 asserts presence; re-check here on a 1M run)
  const R17 = runModel('A', 400);
  check(R17.lastResult.graphics.items.some(x => /^sp\d+TP$/.test(x.key)),
    'part17c: key values missing at 1M');
  // coarse pitch: two global labels ~17pts apart must share a cluster at 30M
  const out30 = inst30.lastOut;
  out30.leg = { level: out30.prev.poc + 17, down: false };
  out30.nakedPocs = [{ poc: out30.prev.poc + 0.5,
    endTms: inst30.tmsList[inst30.tmsList.length - 300] }];
  const it30b = inst30.buildItems(ents30[ents30.length - 1], ents30.length - 1, null);
  // the coarse pitch needs the HTF composite; fabricate one if the short
  // aggregated run has fewer than 5 sessions (the wrapper guards on it)
  if (!out30.htf)
    out30.htf = { poc: out30.prev.poc, vah: out30.prev.poc + 150,
      val: out30.prev.poc - 150, sessions: 5 };
  const it30c = inst30.buildItems(ents30[ents30.length - 1], ents30.length - 1, null);
  const legT = it30c.find(x => x.key === 'legT');
  const spanHtf = (out30.htf.vah - out30.htf.val) * 0.12;
  check(!!legT && spanHtf > 17, 'part17c: coarse-pitch fixture invalid');
  if (legT && spanHtf > 17)
    check(legT.point.y.unit === 'op', 'part17c: coarse labels not fanned at 30M');
  console.log('part17 gauge widths:        slab class dead, telemetry, oversize, labels OK');
}

// -- part 18: HTF-on-1M explicit limitation (ONE_MINUTE_ASSESSMENT sec 1,
// measured decision). With fewer than 5 sessions loadable, the banner
// must state the ceiling and the remedy -- never a warm-up message, and
// never a synthesized composite (median 87-146pt drift at k=2 on the
// real dataset). --
{
  const inst = new Calc();
  inst.props = { htfSessions: 20, rowsPlot: '0' };
  inst.contractInfo = { tickSize: 0.1 };
  inst.chartDescription = { underlyingType: 'MinuteBar', elementSize: 1 };
  inst.init();
  // two sessions + a live tail -- the 1M 3000-bar reality
  const src18 = bars.slice(0, 2 * 1380 + 300);
  const ents18 = src18.map((b, j, arr) => entity(b, j === arr.length - 1, true));
  let res18 = null;
  for (let j = 0; j < ents18.length; j++)
    res18 = inst.map(ents18[j], j, makeHistory(ents18.slice(0, j + 1)));
  const it18 = res18.graphics.items;
  check(inst.core.sessions.length === 2, 'part18: fixture session count wrong');
  check(!inst.core.htf, 'part18: composite unexpectedly built');
  const s218 = it18.find(x => x.key === 'stat2');
  check(!!s218 && s218.text.indexOf('HTF: n/a - 2/5 sessions loadable here (read HTF on 30M)') >= 0,
    'part18: explicit HTF limitation missing: ' + (s218 ? s218.text : '-'));
  check(it18.every(x => !x.key.startsWith('hpro') && x.key !== 'hpocL'),
    'part18: HTF layers drawn without a composite');
  console.log('part18 HTF-on-1M banner:    explicit ceiling + remedy OK');
}

// -- part 19: translucent plotter rows (v10, unblocked by the live vaFill
// verification). rowsPlot=1 (default): the developing profile leaves the
// opaque Shapes path, publishes a day-wide row set in chart-index space,
// and the plotter draws bar-wide vertical strips with real opacity,
// merging same-color runs per column. rowsPlot=0 restores v9.3 exactly. --
{
  const R19 = runModel('A', 400, { htfSessions: 20 });  // rowsPlot defaults ON
  const inst = R19.inst;
  const iLast = n - 1;
  const it19 = R19.lastResult.graphics.items;
  // default: Shapes dev rows gone, payload published
  check(it19.every(x => !(x.tag === 'Shapes' && x.key.startsWith('dpro'))),
    'part19: opaque dev rows still drawn with rowsPlot on');
  const PP19 = inst._plotProfiles;
  const PR19 = PP19 && PP19.find(x => x.pri === 0);
  check(!!PP19 && !!PR19, 'part19: plotter row payload missing');
  if (PR19) {
    const x0gt = inst._tailRef(inst.lastOut.dayStartTms, iLast);
    check(PR19.anchor === x0gt, 'part19: payload anchor not chart-index space');
    const wWant = Math.max(8, Math.min(
      Math.round(inst.core.dayBars.length * 0.85), iLast - x0gt));
    check(PR19.w === wWant, `part19: not day-wide: w=${PR19.w} want=${wWant}`);
    check(PR19.rows.length > 0 && PR19.rows.every(r =>
      typeof r.color === 'string' && r.frac > 0 && r.h > 0),
      'part19: row payload malformed');
    check(PR19.rows.every(r => r.color !== '#FFC42C'),
      'part19: graded gold leaked onto the developing profile');
  }
  // drive the plotter with a stub canvas
  const custom19 = (mod.plotter || []).find(pl => pl && pl.type === 'custom').fn;
  const hist19 = { data: { length: iLast + 1 }, get: j => ({ __x: j }) };
  const draws19 = [];
  const canvas19 = { drawLine: (a, b, s) => draws19.push({ a, b, s }) };
  custom19(canvas19, { props: { rowsPlot: '1', rowOpacity: '35' },
    _plotProfiles: [PR19] }, hist19);
  check(draws19.length > 0, 'part19: plotter drew no rows');
  const perCol = {};
  for (const dr of draws19) {
    check(dr.a.x === dr.b.x, 'part19: non-vertical row strip');
    check(dr.s.opacity === 0.35, 'part19: rowOpacity not honoured: ' + dr.s.opacity);
    check(PR19.rows.some(r => r.color === dr.s.color),
      'part19: stroke color not from the published set');
    check(dr.a.x >= PR19.anchor && dr.a.x <= PR19.anchor + PR19.w,
      'part19: stroke outside the profile span');
    perCol[dr.a.x] = (perCol[dr.a.x] || 0) + 1;
  }
  const maxPerCol = Math.max.apply(null, Object.values(perCol));
  check(maxPerCol <= 8,
    'part19: run merging ineffective (' + maxPerCol + ' strokes in one column)');
  check(Object.keys(perCol).length > PR19.w * 0.5,
    'part19: column coverage too sparse');
  // rowsPlot off => nothing drawn by the plotter, payload still present
  const draws19b = [];
  custom19({ drawLine: (a, b, s) => draws19b.push(1) },
    { props: { rowsPlot: '0' }, _plotProfiles: [PR19] }, hist19);
  check(draws19b.length === 0, 'part19: rows drawn despite rowsPlot=0');
  // rowsPlot='0' at the frame level restores the v9.3 Shapes path
  inst.props = Object.assign({}, inst.props, { rowsPlot: '0' });
  const it19b = inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  check(it19b.some(x => x.tag === 'Shapes' && x.key.startsWith('dpro')),
    'part19: v9.3 fallback rows missing with rowsPlot=0');
  check(inst._plotProfiles === null, 'part19: payload not cleared in fallback mode');
  console.log('part19 plotter rows:        day-wide payload, strips, merge, fallback OK');
}

// -- part 20: full row migration (v10.1, green-lit after the live v10
// verification). With rowsPlot on, session/ACCUM/HTF row fills leave the
// Shapes path too: payloads carry ramp colors (sessions), family colors
// (ACCUM/HTF), the HTF mirror grows LEFT, the list is priority-ordered,
// and rowsPlot=0 restores every Shapes family exactly. --
{
  const R20 = runModel('A', 400, { htfSessions: 20 });   // rowsPlot default ON
  const inst = R20.inst;
  const iLast = n - 1;
  // fabricate an ACCUM window so all four families publish
  const out20 = inst.lastOut;
  out20.accum = { level: out20.prev.poc + 1, short: false,
    start: inst.tmsList[inst.tmsList.length - 400],
    end: inst.tmsList[inst.tmsList.length - 100],
    winHi: out20.prev.poc + 2, winLo: out20.prev.poc - 1,
    rows: [{ price: out20.prev.poc, frac: 1, inVA: true, isPoc: true, h: 0.5 }] };
  const it20 = inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  // no Shapes row fills remain for any family
  check(it20.every(x => !(x.tag === 'Shapes' &&
    (/^sp\d+C\d+$/.test(x.key) || x.key.startsWith('hpro') ||
     x.key.startsWith('apro') || x.key.startsWith('dpro')))),
    'part20: Shapes row fills still present with rowsPlot on');
  // structural non-fill items stay as graphics (medians, brackets, box)
  check(it20.some(x => /^sp\d+M$/.test(x.key)) && it20.some(x => /^sp\d+B$/.test(x.key)),
    'part20: session medians/brackets missing');
  check(it20.some(x => x.key === 'accB'), 'part20: ACCUM box missing');
  const PP = inst._plotProfiles;
  check(!!PP && PP.length >= 4, 'part20: expected >=4 payloads, got ' + (PP ? PP.length : 0));
  // priority order: dev first, HTF mirror last
  for (let j = 1; j < PP.length; j++)
    check((PP[j - 1].pri || 0) <= (PP[j].pri || 0), 'part20: payloads not priority-sorted');
  check(PP[0].pri === 0 && PP[PP.length - 1].pri === 3, 'part20: dev/HTF not at the ends');
  const sess20 = PP.filter(x => x.pri === 1);
  check(sess20.length > 0, 'part20: no session payloads');
  const rampRe20 = /^#([0-9A-F]{2})00([0-9A-F]{2})$/;
  for (const sp of sess20)
    for (const r of sp.rows) {
      const m20 = r.color.match(rampRe20);
      check(!!m20 && parseInt(m20[1], 16) + parseInt(m20[2], 16) === 255,
        'part20: session payload color off the ramp: ' + r.color);
    }
  const htf20 = PP.find(x => x.pri === 3);
  check(!!htf20 && htf20.dir === -1, 'part20: HTF payload not a left mirror');
  // per-family emphasis (section 10): dev prominent, history quieter,
  // HTF faintest -- and the plotter must apply rowOpacity x opMul
  check(PP[0].opMul === 1.0, 'part20: dev emphasis not 1.0');
  check(sess20.every(x => x.opMul === 0.5), 'part20: session emphasis not 0.5');
  check(htf20.opMul === 0.4, 'part20: HTF emphasis not 0.4');
  {
    const drawsE = [];
    const custom20e = (mod.plotter || []).find(pl => pl && pl.type === 'custom').fn;
    custom20e({ drawLine: (a, b, s) => drawsE.push(s.opacity) },
      { props: { rowOpacity: '40' }, _plotProfiles: [sess20[0]] },
      { data: { length: iLast + 1 }, get: j => ({ __x: j }) });
    check(drawsE.length > 0 && drawsE.every(o => Math.abs(o - 0.2) < 1e-9),
      'part20: emphasis multiplier not applied (want 0.40*0.5=0.20, got ' +
      drawsE[0] + ')');
  }
  // plotter: HTF strokes land at x <= anchor; total obeys the budget
  const custom20 = (mod.plotter || []).find(pl => pl && pl.type === 'custom').fn;
  const draws20 = [];
  custom20({ drawLine: (a, b, s) => draws20.push({ a, b, s }) },
    { props: {}, _plotProfiles: [htf20] },
    { data: { length: iLast + 1 }, get: j => ({ __x: j }) });
  check(draws20.length > 0, 'part20: plotter drew nothing for the HTF mirror');
  for (const dr of draws20)
    check(dr.a.x <= htf20.anchor && dr.a.x >= htf20.anchor - htf20.w,
      'part20: HTF stroke outside the mirror span');
  const drawsAll = [];
  custom20({ drawLine: () => drawsAll.push(1) },
    { props: {}, _plotProfiles: PP },
    { data: { length: iLast + 1 }, get: j => ({ __x: j }) });
  check(drawsAll.length > 0 && drawsAll.length <= 12000,
    'part20: stroke budget violated: ' + drawsAll.length);
  // rowsPlot='0' restores every Shapes family (ACCUM fixture still set)
  inst.props = Object.assign({}, inst.props, { rowsPlot: '0' });
  const it20b = inst.buildItems(entity(bars[n - 1], true, true), iLast, null);
  check(it20b.some(x => /^sp\d+C\d+$/.test(x.key)) &&
    it20b.some(x => x.key.startsWith('hpro')) &&
    it20b.some(x => x.key.startsWith('apro')) &&
    it20b.some(x => x.key.startsWith('dpro')),
    'part20: Shapes families not restored with rowsPlot=0');
  console.log('part20 full row migration:  payloads, ramp, mirror, budget, fallback OK');
}

// -- part 21: community anchoring study items 1-3. barMin is derived
// from observed bar spacing ALWAYS (chartDescription is a hint we never
// depend on): no-description charts infer it, wrong hints correct, a
// coarser feed is detected on unanimous evidence (closing the v9.1
// residual gap), and quiet stretches on a fine chart can never fake a
// coarser one. Every LEVEL-class layer is an anchor-free full-width
// line whose only coordinates are the live edge. --
{
  const agg21 = (src, k) => {
    const m = new Map();
    for (const b of src) {
      const slot = Math.floor(b.tMs / (k * 60e3)) * k * 60e3;
      let e = m.get(slot);
      if (!e) { e = { tMs: slot, o: b.o, h: b.h, l: b.l, c: b.c, vol: 0, offv: 0, bidv: 0 }; m.set(slot, e); }
      if (b.h > e.h) e.h = b.h;
      if (b.l < e.l) e.l = b.l;
      e.c = b.c; e.vol += b.vol; e.offv += b.offv; e.bidv += b.bidv;
    }
    return [...m.values()].sort((a, b) => a.tMs - b.tMs);
  };
  const feed = (inst, arr) => {
    let r = null;
    const ents = arr.map((b, j, a2) => entity(b, j === a2.length - 1, true));
    for (let j = 0; j < ents.length; j++)
      r = inst.map(ents[j], j, makeHistory(ents.slice(0, j + 1)));
    return r;
  };
  // 21a: NO chartDescription at all, 5M bars -> barMin observed as 5
  const instA = new Calc();
  instA.props = { htfSessions: 20 };
  instA.contractInfo = { tickSize: 0.1 };
  instA.chartDescription = undefined;
  instA.init();
  feed(instA, agg21(bars.slice(0, 1500), 5));
  check(instA.barMin === 5,
    'part21a: barMin not observed without a description: ' + instA.barMin);
  // 21b: THE v9.1 RESIDUAL GAP -- a stale episode (5M -> 1M with the
  // description stuck at 5) followed by a coarse RETURN to 5M with the
  // description STILL stuck. Detector A is suppressed by staleCd; the
  // description disagrees with the observed barMin, so unanimous-coarser
  // evidence is allowed to decide -- and must.
  const instB = new Calc();
  instB.props = { htfSessions: 20 };
  instB.contractInfo = { tickSize: 0.1 };
  instB.chartDescription = { underlyingType: 'MinuteBar', elementSize: 5 };
  instB.init();
  feed(instB, agg21(bars.slice(0, 1500), 5));      // healthy 5M phase
  feed(instB, bars.slice(1500, 1650));             // 1M re-feed, cd stuck at 5
  check(instB.barMin === 1, 'part21b: stale-episode downswitch failed');
  check(instB._staleCd === 5, 'part21b: staleCd not recorded');
  feed(instB, agg21(bars.slice(1650, 3500), 5));   // coarse RETURN, cd still 5
  check(instB.barMin === 5,
    'part21b: the v9.1 residual gap not closed: barMin=' + instB.barMin);
  check(!instB._resetLoop, 'part21b: escalated instead of inferring');
  // 21c: quiet stretches cannot fake coarser -- 1M bars with omitted
  // minutes (varied 2-4 min gaps) must keep barMin=1, zero resets
  const instC = new Calc();
  instC.props = { htfSessions: 20 };
  instC.contractInfo = { tickSize: 0.1 };
  instC.chartDescription = { underlyingType: 'MinuteBar', elementSize: 1 };
  instC.init();
  const quiet = [];
  let t21 = bars[0].tMs;
  const gaps = [1, 2, 1, 3, 1, 4, 2, 1];
  for (let j = 0; j < 400; j++) {
    t21 += gaps[j % gaps.length] * 60e3;
    quiet.push(Object.assign({}, bars[j], { tMs: t21 }));
  }
  feed(instC, quiet);
  check(instC.barMin === 1, 'part21c: quiet stretch faked a coarser feed');
  check(!(instC._resetTimes && instC._resetTimes.length),
    'part21c: spurious resets on a quiet fine chart');
  // 21d: LEVEL-class lines are anchor-free full-width for the whole
  // family, and the diag line carries the passive bidx probe
  const R21 = runModel('A', 400, { htfSessions: 20, diag: 1 });
  const it21 = R21.lastResult.graphics.items;
  const lvlKeys = it21.filter(x => x.tag === 'LineSegments' &&
    x.lines.length === 1 && x.lines[0].infiniteStart === true)
    .map(x => x.key);
  for (const k21 of ['pocL', 'vahL', 'valL', 'dpocL', 'dvahL', 'dvalL'])
    check(lvlKeys.indexOf(k21) >= 0, 'part21d: not anchor-free: ' + k21);
  for (const it of it21)
    if (lvlKeys.indexOf(it.key) >= 0) {
      check(it.lines[0].a.x.v === (n - 1) - 1 && it.lines[0].b.x.v === (n - 1) + 2,
        'part21d: level endpoints not at the live edge: ' + it.key);
    }
  const s421 = it21.find(x => x.key === 'stat4');
  check(s421 && / bidx=/.test(s421.text), 'part21d: bidx probe missing from diag');
  console.log('part21 anchor-free levels:  observed barMin (a-c), full-width family, bidx OK');
}

// -- part 22: v12 right-edge pinned live profile (HANDOFF_v12). The
// structural invariant that IS the feature: no X coordinate or width in
// this family may carry unit du -- time-axis independence is enforced by
// the sim, not promised in review. Plus: grid-right container shape,
// session-keyed, offset applied, survives the emitted-geometry scan,
// duTime cannot move it, purely additive, default ON. --
{
  const R22 = runModel('A', 400, { htfSessions: 20 });   // edgeProfile default ON
  const iLast = n - 1;
  const it22 = R22.lastResult.graphics.items;
  const cont = it22.find(x => x.tag === 'Container' && x.key.startsWith('edge'));
  check(!!cont, 'part22: edge profile container missing');
  if (cont) {
    check(cont.key === 'edge' + R22.inst.lastOut.dayStartTms,
      'part22: not session-keyed (A8 rule)');
    check(cont.origin && cont.origin.cs === 'grid' && cont.origin.h === 'right',
      'part22: not grid-right pinned');
    let rects = 0, pocSeen = false;
    for (const ch of cont.children) {
      if (ch.tag === 'Shapes') {
        for (const pr of ch.primitives) {
          rects++;
          check(pr.position.x.unit === 'px' && pr.size.width.unit === 'px',
            'part22: du leaked into an X coordinate/width');
          check(pr.position.x.v === -170, 'part22: edgeOffset not applied: ' + pr.position.x.v);
          check(pr.size.width.v < 0, 'part22: rows not growing left');
          check(pr.position.y.unit === 'du' && pr.size.height.unit === 'du',
            'part22: y must stay price-space du');
          if (ch.key.endsWith('P')) pocSeen = true;
        }
      } else if (ch.tag === 'Text') {
        check(ch.point.x.unit === 'px', 'part22: label x not px');
        check(/[*]?$/.test(ch.text) && /(VAH|POC|VAL) /.test(ch.text),
          'part22: key-row label malformed: ' + ch.text);
      }
    }
    check(rects > 0 && pocSeen, 'part22: rows/POC missing');
    check(cont.children.filter(ch => ch.tag === 'Text').length === 3,
      'part22: expected exactly 3 key-row labels');
  }
  // duTime cannot move it: force minute-slot mode, compare the container
  const inst22 = R22.inst;
  inst22.props = Object.assign({}, inst22.props, { duTime: '1' });
  const itT = inst22.buildItems(entity(bars[n - 1], true, true), iLast, null);
  const contT = itT.find(x => x.tag === 'Container' && x.key.startsWith('edge'));
  check(!!contT && JSON.stringify(contT) === JSON.stringify(cont),
    'part22: duTime moved the edge profile -- independence broken');
  // purely additive: toggling off removes ONLY the edge family
  inst22.props = Object.assign({}, inst22.props, { duTime: '0', edgeProfile: '0' });
  const itOff = inst22.buildItems(entity(bars[n - 1], true, true), iLast, null);
  check(itOff.every(x => !x.key.startsWith('edge')), 'part22: toggle off failed');
  const keysOn = itT.filter(x => !x.key.startsWith('edge')).map(x => x.key).sort().join();
  const keysOff = itOff.map(x => x.key).sort().join();
  check(keysOn === keysOff, 'part22: not purely additive (other layers changed)');
  console.log('part22 edge profile:        px-only X, pinned, session-keyed, duTime-immune, additive OK');
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
