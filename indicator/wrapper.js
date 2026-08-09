/*
 * wrapper.js -- the Tradovate custom-indicator shell around DaleCore.
 * NOT used directly: build.js splices dale_core.js + this file into
 * TraderMachell.js (the single module you paste into Tradovate's
 * Indicator Editor).
 *
 * VISUAL SUITE v6 -- v5 + techniques learned from studying free community
 * indicator sources (docs/VISUAL_V6_SOURCES.md; all code here is original,
 * the studied repos are license-restricted and were used for technique
 * discovery only):
 *  - TRANSLUCENT VALUE-AREA FILL (vaFill=1, DEFAULT OFF until live-
 *    verified): community indicators achieve real translucency through
 *    the CUSTOM CANVAS PLOTTER pipeline (predef.plotters.custom ->
 *    canvas.drawLine with a first-class `opacity` style), which is
 *    independent of the graphics-items path where fill alpha proved
 *    broken (live Bug A). One bar-wide vertical line per bar from VAL to
 *    VAH shades the value area of every session on the chart. If the
 *    indicator fails to LOAD after this version, delete the clearly
 *    marked PLOTTER BLOCK at the bottom of the file -- everything else
 *    is unaffected.
 *  - HVN / LVN NODE TICKS (nodes=1, default): computed from THIS
 *    project's locked profile math. LVNs use the engine's own
 *    stopBehindLVN criterion (row volume < lvnFrac x POC volume), so the
 *    ticks mark exactly where the engine sees low-volume structure;
 *    HVNs are prominent local maxima. Display-only, capped, no labels.
 *  - USER COLOR/OPACITY PARAMS for the fill layer (paramSpecs.color is
 *    used by working community indicators), defensively coerced like
 *    every other prop.
 *
 * v5: native SESSION VOLUME PROFILE layer (docs/VISUAL_V5_SVP.md). The SVP feature set follows the leading
 * free/open TradingView tools (developing POC/VAH/VAL updating live,
 * prior-session levels locked and extended, per-session histograms), but
 * ALL math is this project's own regression-locked engine: the developing
 * profile is built by the SAME buildProfile/displayRows used for the
 * graded levels -- no cloned third-party math, no second profile engine,
 * no license entanglement (TradingView Pine sources are not portable or
 * license-free; see the doc).
 *
 *  SVP LAYER (v5):
 *  - DEVELOPING SESSION PROFILE (devProfile=1, default): the CURRENT
 *    session's volume profile, anchored at the session start in the
 *    session's own box, recomputed once per committed bar (cached; no
 *    per-tick cost). Rows use the identical binning/step convention the
 *    engine applies when it finalizes a session, so at the session roll
 *    the developing profile converges exactly into the graded one.
 *  - dPOC / dVAH / dVAL: teal-green dashed rays + labels, updating as the
 *    session builds (the hallmark SVP feature). DISPLAY-ONLY: signals
 *    still consume the locked PRIOR-session levels, never these.
 *  - SVP LAYOUT: with devProfile=1 each session box contains its own
 *    histogram (prior session's sits in ITS box via sessionProfiles) and
 *    prior-session structure projects across today as rays + VA zone.
 *    devProfile=0 restores the v4 layout (prior-session histogram
 *    projected at today's start instead).
 *
 * v4 field fixes from the 2026-08-09 live session
 * (FIELD_REPORT.md, docs/bug/live_bug_opaque_va_band_2026-08-09.png),
 * look modeled on Trader Dale's software (docs/reference/):
 *
 *  LIVE-VERIFIED FACTS driving this version:
 *  - FILL ALPHA IS NOT HONORED for Rectangle fills: the v3 value-area band
 *    (rgba alpha 0.07) rendered as a SOLID slab that swallowed the rows.
 *    => every color in this file is a solid hex tuned for the dark theme;
 *    nothing relies on translucency. Enforced by sim_synth.js.
 *  - DU-UNIT RECTANGLE WIDTHS RENDER CORRECTLY: the band was strictly
 *    duMode-gated, so duMode provably ran, and the du-width rows in the
 *    screenshot tiled cleanly at exact prices. du widths are now the
 *    proven default (zoom-scaling profiles); px mode kept as a toggle.
 *  - BOOL PARAM VALUES DO NOT REACH this.props: the dialog showed
 *    (20, false, false, false) yet duMode ran (scaledWidths fell back to
 *    its undefined-default true) while alignTest stayed false (!!undefined)
 *    -- both consistent ONLY with bool props arriving undefined.
 *    => toggles are number specs (0/1), every prop is defensively coerced
 *    (accepts true/'true'/1/'1'/...), effective values are re-derived on
 *    every draw, and code defaults match intended behavior when props
 *    never arrive. `diag=1` prints raw prop types on the banner so prop
 *    delivery is observable, never assumed.
 *
 *  THE CHART (Dale reading experience -- docs/reference/dale_poc/item1,
 *  item4; dale_orderflow/02,03):
 *  - PREV-SESSION VOLUME PROFILE: dark-teal histogram growing right from
 *    the session start; value-area rows a clearly brighter teal; POC row
 *    solid gold. Rows tile their exact core-computed price spans.
 *  - VALUE-AREA ZONE: dashed outline from session start to the current
 *    bar between VAL and VAH (Dale's zone, drawn with proven line
 *    primitives -- zero fill-alpha reliance) + white POC ray + dashed
 *    blue VAH/VAL rays.
 *  - HTF COMPOSITE: dark-gold ghost histogram mirrored LEFT of the
 *    session start (left-anchored positive du widths), thick POC ray,
 *    dash-dot VAH/VAL.
 *  - Historical SESSION PROFILES: muted slate, one per session at its own
 *    start. NAKED POC rays red until traded through.
 *  - ACCUM rotation: gold box + dark-gold histogram + level ray; LEG ray
 *    aqua (untested tag verbatim).
 *  - RIGHT-EDGE LABELS: extend RIGHT of the last bar (leftMiddle extends
 *    LEFT -- platform fact), de-collided by clustering + pixel fanning.
 *  - MARKS: absorption diamonds current-session only (latest one labeled),
 *    signal arrows always, full signal text current-session (showHistory=1
 *    labels older ones), SL/TP rays for the live signal. Evidence tags
 *    verbatim -- contractual honesty.
 *  - SESSION START marker line; STATUS BANNER top-left with fixed slots;
 *    alignTest=1 self-test row (RECT_Y_ANCHOR flip protocol below).
 *
 * Other platform facts respected (TraderMachell_Review_v2.md section 4):
 * graphics only on d.isLast(), global:true + stable keys, Text needs
 * fontSize+fill, no mixed-unit op() on X, no lineStyle.opacity, tmsList
 * timestamp->index anchoring (never bar indexes, never history.get), bars
 * committed once via lastPushedMs + walk-back (both engine models).
 */

/* __CORE_SPLICE__ */

const predef = require("./tools/predef");
const meta = require("./tools/meta");
const { px, du, op } = require("./tools/graphics");
// plotting helpers power the OPTIONAL vaFill canvas plotter only; if this
// require fails on some platform build, the indicator must still load
let plt = null;
try { plt = require("./tools/plotting"); } catch (e) { /* vaFill disabled */ }

// ---- render configuration ------------------------------------------------
// RECT_Y_ANCHOR: which edge of a Rectangle `position.y` names. "bottom"
// matched the live 2026-08-09 frame (gold POC row sat exactly at PREV POC
// 4324.9). alignTest=1 re-verifies: if the magenta row ever draws ABOVE
// its ray, flip this to "top". Single source of truth (vrect/pxrect).
const RECT_Y_ANCHOR = "bottom";
const VIS = {
  rowFill: 0.90,        // row height as fraction of its pitch (hairline gap)
  minRowBars: 0.35,     // du mode: shortest visible row, in bar widths
  minRowPx: 3,          // px mode: shortest visible row, in pixels
  prevMaxBars: 150,     // du mode: longest prev-profile row (1-min bars)
  htfMaxBars: 120,      // du mode: longest HTF ghost row
  sessMaxBars: 90,      // du mode: longest per-session row
  accMaxBars: 90,       // du mode: longest ACCUM row (also capped by box)
  prevMaxPx: 160,       // px fallback widths (proven v2 values)
  sessMaxPx: 110,
  accMaxPx: 90,
  labelGapPx: 15,       // de-collision stack pitch
  clusterATR: 0.25,     // labels closer than this (in ATR) share a stack
};

// ALL colors are solid hex: fill alpha proved unreliable live (Bug A).
// Values are tuned for Tradovate's dark chart theme at FULL opacity:
// tails dark enough to recede behind price, VA a clear step brighter,
// POC unmistakable.
const COLORS = {
  profile: "#1F4B58",     // prev-session tails: dark teal, recedes
  profileVA: "#3E7E93",   // value area: clearly brighter teal
  pocRow: "#FFC42C",      // POC row: solid gold
  sess: "#262C41",        // historical sessions: near-background slate
  sessVA: "#3A4263",
  sessPoc: "#8991BC",
  htfGhost: "#4E3D12",    // HTF mirror: dark gold-brown
  htfPocRow: "#A87E22",
  accHist: "#5C4A16",     // ACCUM histogram body
  accPocRow: "#E8E8E8",
  poc: "#FFFFFF", va: "#62A8E8", vaZone: "#3D5F80",
  dev: "#4DB6AC",         // developing dPOC/dVAH/dVAL (display-only levels)
  htf: "#C9962B", accum: "#FFD54F", leg: "#26C6DA",
  naked: "#E53935", nakedTxt: "#EF9A9A",
  buy: "#00C853", sell: "#FF5252", tp: "#00C853", sl: "#FF5252",
  absorb: "#FFA500", conflu: "#FF8C00", warn: "#FFA500",
  status: "#E0E0E0", dim: "#9E9E9E",
  dayLine: "#565B66",
  test: "#FF00FF",
};
const FONT = { fontSize: 13, fontWeight: "bold" };
const FONT_SM = { fontSize: 11, fontWeight: "bold" };

// ---- defensive prop coercion (bool prop VALUES observed undelivered
// live 2026-08-09; never trust platform prop types) -----------------------
function pBool(v, dflt) {
  if (v === undefined || v === null) return dflt;
  if (v === true || v === false) return v;
  const s = String(v).toLowerCase().trim();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off" || s === "") return false;
  return dflt;
}
function pNum(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

// ---- primitive helpers ---------------------------------------------------
function ray(key, x0, price, color, width, dash) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [{ tag: "Line",
      a: { x: du(x0), y: du(price) }, b: { x: du(x0 + 1), y: du(price) },
      infiniteEnd: true }],
    lineStyle: { lineWidth: width, color, lineStyle: dash || 1 },
  };
}
function vline(key, x, pLo, pHi, color, dash) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [{ tag: "Line", a: { x: du(x), y: du(pLo) }, b: { x: du(x), y: du(pHi) } }],
    lineStyle: { lineWidth: 1, color, lineStyle: dash || 3 },
  };
}
function txt(key, x, price, s, color, dyPx, font, align) {
  return {
    tag: "Text", key, global: true,
    point: { x: du(x), y: dyPx ? op(du(price), "-", px(dyPx)) : du(price) },
    text: s,
    style: Object.assign({ fill: color }, font || FONT),
    // rightMiddle extends text to the RIGHT of the anchor (into the empty
    // margin). leftMiddle extends LEFT -- over the candles. Platform fact.
    textAlignment: align || "rightMiddle",
  };
}
function frameTxt(key, xPx, yPx, s, color, font) {
  return {
    tag: "Text", key, global: true,
    point: { x: px(xPx), y: px(yPx) },
    text: s,
    style: Object.assign({ fill: color }, font || FONT),
    textAlignment: "rightMiddle",
    origin: { cs: "frame", h: "left", v: "top" },
  };
}
// the ONLY places a Rectangle's y anchor is decided. pLo/pHi are prices.
function vrect(x, wDu, pLo, pHi) {
  return { tag: "Rectangle",
    position: { x: du(x), y: du(RECT_Y_ANCHOR === "bottom" ? pLo : pHi) },
    size: { width: du(wDu), height: du(pHi - pLo) } };
}
function pxrect(x, wPx, pLo, pHi) {
  return { tag: "Rectangle",
    position: { x: du(x), y: du(RECT_Y_ANCHOR === "bottom" ? pLo : pHi) },
    size: { width: px(wPx), height: du(pHi - pLo) } };
}

// ---- histogram -----------------------------------------------------------
// Shapes->Rectangle rows. Each row uses the EXACT pitch carried by the core
// (r.h) so rows tile the profile's true price span -- verified live
// 2026-08-09 (rows outside the band tiled perfectly; the report calls them
// "the standard").
//   duMode=true : widths in bar units (scale with zoom; live-proven);
//                 dir=-1 mirrors LEFT via left-anchored positive widths.
//   duMode=false: px widths (v2 mode); leftward growth is NOT expressible
//                 without negative widths (unproven), so dir=-1 callers
//                 must skip in px mode.
function histogram(keyBase, rows, x0, dir, colorMain, colorVA, colorPoc, maxW, duMode) {
  const groups = { main: [], va: [], poc: [] };
  for (const r of rows) {
    if (!(r.frac > 0)) continue;          // no phantom stubs on gap rows
    const h = (r.h || 0) * VIS.rowFill;
    if (!(h > 0)) continue;
    const pLo = r.price - h / 2, pHi = r.price + h / 2;
    let rect;
    if (duMode) {
      const w = Math.max(VIS.minRowBars, r.frac * maxW);
      rect = vrect(dir > 0 ? x0 : x0 - w, w, pLo, pHi);
    } else {
      if (dir < 0) continue;              // negative px widths are unproven
      rect = pxrect(x0, Math.max(VIS.minRowPx, Math.round(r.frac * maxW)), pLo, pHi);
    }
    if (r.isPoc) groups.poc.push(rect);
    else if (r.inVA) groups.va.push(rect);
    else groups.main.push(rect);
  }
  const items = [];
  if (groups.main.length) items.push({ tag: "Shapes", key: keyBase + "M",
    global: true, primitives: groups.main, fillStyle: { color: colorMain } });
  if (groups.va.length) items.push({ tag: "Shapes", key: keyBase + "V",
    global: true, primitives: groups.va, fillStyle: { color: colorVA } });
  if (groups.poc.length) items.push({ tag: "Shapes", key: keyBase + "P",
    global: true, primitives: groups.poc, fillStyle: { color: colorPoc } });
  return items;
}
function box(key, xA, xB, hi, lo, color, dash) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [
      { tag: "Line", a: { x: du(xA), y: du(hi) }, b: { x: du(xB), y: du(hi) } },
      { tag: "Line", a: { x: du(xA), y: du(lo) }, b: { x: du(xB), y: du(lo) } },
      { tag: "Line", a: { x: du(xA), y: du(hi) }, b: { x: du(xA), y: du(lo) } },
      { tag: "Line", a: { x: du(xB), y: du(hi) }, b: { x: du(xB), y: du(lo) } },
    ],
    lineStyle: { lineWidth: 1, color, lineStyle: dash || 3 },
  };
}

// ---- right-edge label column with de-collision -----------------------------
// Labels whose prices sit within clusterATR of each other form a stack
// fanned around the cluster midpoint at a fixed pixel pitch, ordered by
// price -- close levels can never overprint each other, at any zoom.
function layoutLabels(labels, lx, atr) {
  const eps = Math.max(atr * VIS.clusterATR, 1e-9);
  const sorted = labels.slice().sort((a, b) => b.price - a.price);
  const items = [];
  let c = 0;
  while (c < sorted.length) {
    let e = c;
    while (e + 1 < sorted.length && sorted[e].price - sorted[e + 1].price < eps) e++;
    const cluster = sorted.slice(c, e + 1);
    const mid = (cluster[0].price + cluster[cluster.length - 1].price) / 2;
    const n = cluster.length;
    for (let k = 0; k < n; k++) {
      const dy = ((n - 1) / 2 - k) * VIS.labelGapPx;  // +dy raises the label
      const L = cluster[k];
      items.push(txt(L.key, lx, n > 1 ? mid : L.price, L.text, L.color, dy, L.font));
    }
    c = e + 1;
  }
  return items;
}

class traderMachell {
  init() {
    let barMin = 1;
    const cd = this.chartDescription;
    this.timeBased = !cd || cd.underlyingType === "MinuteBar";
    if (cd && cd.underlyingType === "MinuteBar" && cd.elementSize > 0)
      barMin = cd.elementSize;
    this.barMin = barMin;
    const s = (mins, floor) => Math.max(floor || 5, Math.round(mins / barMin));
    this.core = new DaleCore({
      barMinutes: barMin,
      atrWindow: s(420, 30),
      accumLookback: s(2880, 60),
      accumMinBars: s(30, 5),
      legLookback: s(600, 50),
      legPivot: Math.max(3, Math.round(12 / barMin)),
      sigBars: Math.max(3, Math.round(15 / barMin)),
      initBars: Math.max(2, Math.round(5 / barMin)),
      // core builds no HTF composite below 5 sessions (dale_core "< 5"
      // gate) -- clamp so a dialog value of 1-4 can't silently starve it
      htfSessions: Math.max(5, Math.round(pNum(this.props && this.props.htfSessions, 20))),
    });
    // du-mode row caps, rescaled so a row's bar-width tracks real time when
    // the zoom buttons switch aggregation (Q1 resets the indicator anyway)
    const cap = (b) => Math.max(20, Math.round(b / barMin));
    this.wPrev = cap(VIS.prevMaxBars);
    this.wHtf = cap(VIS.htfMaxBars);
    this.wSess = cap(VIS.sessMaxBars);
    this.wAcc = cap(VIS.accMaxBars);
    this.vaBySession = {};   // sessionKey -> {vaLo, vaHi} for the vaFill plotter
    this.lastPushedMs = 0;
    this.lastOut = null;
    this.marks = [];              // {tMs, price, day, ev} -- anchors are
    // resolved from timestamps at draw time, never from stale indexes
    this.tmsList = [];            // pushed-bar timestamps, in order
    this.idxList = [];            // each bar's chart index AT PUSH TIME,
    // normalized to frame-0 by idxBase. Two independent anchor paths:
    //  - PRIMARY: idxList[pos] + idxBase. Each entry was read straight
    //    off the platform when the bar was mapped, so it stays correct
    //    even if the walk-back MISSED bars (Q3 -- the live 2026-08-09pm
    //    right-shifted-histogram frame). Prepends (Q2) shift all indexes
    //    uniformly; idxBase is re-measured from any already-pushed bar.
    //  - CROSS-CHECK: offset-from-the-end of the mirror (the v2..v5
    //    method), which assumes one push per chart bar. Disagreement
    //    means the mirror missed bars -> flagged on the banner.
    this.idxBase = 0;
    this._desync = false;
  }

  // effective options, re-derived EVERY draw from coerced props (field
  // report requirement: never trust platform prop types or delivery; the
  // defaults here are what actually runs when a prop never arrives)
  _opts() {
    const p = this.props || {};
    return {
      duMode: pBool(p.scaledWidths, true),   // du widths live-proven 2026-08-09
      dev: pBool(p.devProfile, true),        // developing session profile (SVP)
      nodes: pBool(p.nodes, true),           // HVN/LVN ticks on the prior profile
      history: pBool(p.showHistory, false),
      alignTest: pBool(p.alignTest, false),
      diag: pBool(p.diag, false),
    };
  }

  // ---- HVN / LVN nodes on the PRIOR-session profile (display-only) ----
  // LVN: contiguous runs of rows below the engine's own stop criterion
  // (row volume < lvnFrac x POC volume -- identical to stopBehindLVN), so
  // a tick marks exactly where the engine sees a low-volume pocket.
  // HVN: local maxima >= 60% of POC volume, at least 3 rows from the POC.
  // Edge runs are excluded (profile tails are trivially thin), counts are
  // capped, recomputed once per session (cached by day).
  _nodesOf(out) {
    const prof = this.core.prev;
    if (!prof) return null;
    const N = this._nd;
    if (N && N.day === out.day) return N;
    const keys = [...prof.vol.keys()].sort((a, b) => a - b);
    const res = { day: out.day, lvns: [], hvns: [] };
    this._nd = res;
    if (!keys.length) return res;
    const kLo = keys[0], kHi = keys[keys.length - 1];
    const pocV = prof.vol.get(prof.pocRow) || 0;
    if (pocV <= 0) return res;
    const v = k => prof.vol.get(k) || 0;
    const lvnCut = CFG.lvnFrac * pocV;
    // LVN runs (missing rows count as zero volume)
    let runA = null;
    const runs = [];
    for (let k = kLo; k <= kHi + 1; k++) {
      const low = k <= kHi && v(k) < lvnCut;
      if (low && runA === null) runA = k;
      else if (!low && runA !== null) { runs.push([runA, k - 1]); runA = null; }
    }
    for (const [a, b] of runs) {
      if (a <= kLo || b >= kHi) continue;          // edge tails excluded
      let depth = Infinity;
      for (let k = a; k <= b; k++) if (v(k) < depth) depth = v(k);
      res.lvns.push({ price: prof.lo + ((a + b + 1) / 2) * prof.step, depth });
    }
    res.lvns.sort((x, y) => x.depth - y.depth);    // deepest pockets first
    res.lvns = res.lvns.slice(0, 4);
    // HVN local maxima
    for (let k = kLo + 1; k < kHi; k++) {
      if (Math.abs(k - prof.pocRow) < 3) continue; // the POC row owns its zone
      const vk = v(k);
      if (vk < 0.6 * pocV) continue;
      if (vk >= v(k - 1) && vk >= v(k + 1) &&
          vk >= v(k - 2) && vk >= v(k + 2))
        res.hvns.push({ price: prof.lo + (k + 0.5) * prof.step, vol: vk });
    }
    res.hvns.sort((x, y) => y.vol - x.vol);
    res.hvns = res.hvns.slice(0, 3);
    return res;
  }

  // ---- developing session profile (SVP layer, display-only) ----
  // Built from the CURRENT session's committed bars with the exact same
  // grid convention _finalizeSession uses (step = range/rows, same
  // buildProfile + displayRows), so at the session roll this converges
  // bit-identically into the graded prior-session profile. Cached and
  // recomputed only when a bar commits -- zero per-tick cost. Never feeds
  // the signal machines: those consume locked PRIOR-session levels only.
  _devProfile(out) {
    const bars = this.core.dayBars;
    const minBars = Math.max(10, Math.round(30 / this.barMin));
    if (!bars || bars.length < minBars) return null;
    const D = this._dev;
    if (D && D.day === out.day && D.n === bars.length) return D.ok ? D : null;
    let lo = Infinity, hi = -Infinity, vol = 0;
    for (const b of bars) {
      if (b.l < lo) lo = b.l;
      if (b.h > hi) hi = b.h;
      vol += b.vol;
    }
    let dev = { day: out.day, n: bars.length, ok: false };
    if (vol > 0) {
      const step = Math.max((hi - lo) / this.core.cfg.rows, 1e-9);
      const prof = buildProfile(bars, step);
      const rows = prof ? displayRows(prof, 40, hi) : null;
      if (rows) dev = { day: out.day, n: bars.length, ok: true, rows,
        poc: prof.poc, vah: prof.vah, val: prof.val };
    }
    this._dev = dev;
    return dev.ok ? dev : null;
  }

  _pushEntity(e, chartIdx) {
    const tMs = e.timestamp().getTime();
    if (tMs <= this.lastPushedMs) return;
    this.lastPushedMs = tMs;
    const off = typeof e.offerVolume === "function" ? e.offerVolume() : 0;
    const bid = typeof e.bidVolume === "function" ? e.bidVolume() : 0;
    const bar = {
      tMs, o: e.open(), h: e.high(), l: e.low(), c: e.close(),
      vol: e.volume(), delta: off - bid,
    };
    this.tmsList.push(tMs);
    this.idxList.push(chartIdx - this.idxBase);
    if (this.tmsList.length > 12000) {
      this.tmsList.splice(0, 2000);
      this.idxList.splice(0, 2000);
    }
    const out = this.core.push(bar);
    this.lastOut = out;
    if (out.absorb)
      this.marks.push({ tMs, price: bar.c, day: out.day,
        ev: { kind: "absorb", long: this.core.poc.side } });
    if (out.signal)
      this.marks.push({ tMs, price: out.signal.entry, day: out.day, ev: out.signal });
    if (out.flowQuit)
      this.marks.push({ tMs, price: bar.c, day: out.day, ev: { kind: "flowquit" } });
    if (this.marks.length > 60) this.marks.shift();
  }

  map(d, i, history) {
    // prepend rebase (Q2): a bar we have ALREADY pushed reveals its
    // current chart index; any shift versus what we stored means history
    // back-loading moved every index -- re-measure the frame offset so
    // stored indexes stay true. The current bar covers the common case...
    const dMs = d.timestamp().getTime();
    if (this.idxList.length && dMs === this.lastPushedMs)
      this.idxBase = i - this.idxList[this.idxList.length - 1];
    if (history && typeof history.get === "function" && i > 0) {
      let k = i - 1;
      const backlog = [], idxs = [];
      while (k >= 0 && backlog.length < 500) {
        const e = history.get(k);
        if (!e || typeof e.timestamp !== "function") break;
        const eMs = e.timestamp().getTime();
        if (eMs <= this.lastPushedMs) {
          // ...and the walk-back boundary covers the engine model where
          // closed bars are never re-mapped directly
          if (this.idxList.length && eMs === this.lastPushedMs)
            this.idxBase = k - this.idxList[this.idxList.length - 1];
          break;
        }
        backlog.push(e);
        idxs.push(k);
        k--;
      }
      for (let b = backlog.length - 1; b >= 0; b--)
        this._pushEntity(backlog[b], idxs[b]);
    }
    const complete = typeof d.isComplete === "function" ? d.isComplete() : !d.isLast();
    if (complete) this._pushEntity(d, i);

    // per-bar values consumed by the optional canvas plotter (vaFill):
    // each bar carries ITS session's prior value area, so the plotter can
    // shade the value area of every session on the chart. Plain data --
    // with no `plots` declared the platform draws nothing by itself
    // (community-indicator precedent).
    // resolve THIS bar's session VA from the bar's OWN timestamp. lastOut
    // tracks the newest session, which stamps wrong values on bars mapped
    // out of live order (model A re-maps closed bars; model B's first bar
    // of a session is last mapped before the roll commits). The per-session
    // map fills once per session during the oldest-first load and re-fills
    // identically after any prepend-triggered re-init.
    const out0 = this.lastOut;
    if (out0 && out0.prev && out0.dayStartTms)
      this.vaBySession[sessionKey(out0.dayStartTms)] =
        { vaLo: out0.prev.val, vaHi: out0.prev.vah };
    const vaVals = this.vaBySession[sessionKey(d.timestamp().getTime())] || {};

    if (!d.isLast()) return vaVals;
    return Object.assign({ graphics: { items: this.buildItems(d, i, history) } }, vaVals);
  }

  // resolve a bar-start timestamp to its CURRENT chart index.
  // PRIMARY: the chart index recorded when the bar was pushed (frame-0
  // normalized) + the current prepend base -- correct even if the mirror
  // missed bars. CROSS-CHECK: tail-offset (one push per chart bar); a
  // disagreement means the mirror is gappy (Q3) and is flagged visibly.
  _idxOf(tMs, endIdx, cache) {
    if (cache.has(tMs)) return cache.get(tMs);
    const L = this.tmsList;
    let res;
    if (!L.length || tMs < L[0]) res = undefined;   // older than our mirror
    else {
      let lo = 0, hi = L.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (L[mid] < tMs) lo = mid + 1; else hi = mid;
      }
      if (L[lo] !== tMs) res = undefined;
      else {
        res = this.idxList[lo] + this.idxBase;
        const tail = endIdx - (L.length - 1 - lo);
        if (tail !== res) this._desync = true;
        if (res < 0) res = undefined;
      }
    }
    cache.set(tMs, res);
    return res;
  }

  buildItems(d, i, history) {
    const items = [];
    const out = this.lastOut;
    if (!this.timeBased) {
      items.push(frameTxt("tmWarn", 70, 20,
        "TraderMachell: use a time-based (minute) chart", COLORS.warn));
      return items;
    }
    if (!out) return items;
    const O = this._opts();
    const duMode = O.duMode;
    const tcache = new Map();
    // index of the last PUSHED bar: i if the current bar is committed,
    // else i-1 (the developing bar is never pushed)
    const endIdx = this.lastPushedMs === d.timestamp().getTime() ? i : i - 1;
    this._desync = false;
    const idx = t => this._idxOf(t, endIdx, tcache);
    // OCCLUSION RULE (live 2026-08-09 afternoon frame): a histogram may
    // never be placed relative to the LAST bar and may never paint over
    // the live edge. If the session-start anchor cannot be resolved,
    // histograms/zone/ticks are hidden (rays and labels stay -- levels
    // are horizontal and thin) and the banner says why. When resolved,
    // right-growing session histograms are width-capped so they stop
    // short of the final candles.
    const x0 = idx(out.dayStartTms);
    const x0Ok = x0 !== undefined;
    const rayX0 = x0Ok ? x0 : 0;            // levels anchor at the chart edge
    const availBars = x0Ok ? (i - x0 - 12) : 0;
    const histOk = x0Ok && availBars >= 8;
    const capW = w => Math.min(w, availBars);
    const lx = i + 4;                       // label column, right of last bar
    const labels = [];                      // -> layoutLabels at the end
    const lab = (key, price, text, color, font) =>
      labels.push({ key, price, text, color, font });
    const fmt = p => (this.contractInfo && this.contractInfo.tickSize < 0.01)
      ? p.toFixed(3) : p.toFixed(1);

    // ---- status banner, pinned to the viewport (fixed line slots) ----
    items.push(frameTxt("stat1", 70, 18,
      "TraderMachell  |  " + (out.status || ""), COLORS.status));
    if (out.prev)
      items.push(frameTxt("stat2", 70, 36,
        "PREV  POC " + fmt(out.prev.poc) + "   VAH " + fmt(out.prev.vah) +
        "   VAL " + fmt(out.prev.val) +
        (out.htf ? "      HTF POC " + fmt(out.htf.poc) : "      HTF: needs more history"),
        COLORS.dim, FONT_SM));
    const ctx = [];
    if (out.htf) {
      const pxNow = d.close();
      ctx.push("HTF: " + (pxNow > out.htf.vah ? "above value (info, not a gate)"
        : pxNow < out.htf.val ? "below value (info, not a gate)"
          : "inside value (balanced)"));
    }
    if (out.confluence) ctx.push("CONFLUENCE: ACCUM on prev POC [n=1 - untested]");
    if (this.barMin !== 1)
      ctx.push("CAUTION: " + this.barMin + "-min bars - grades measured on 1-min");
    if (!x0Ok) ctx.push("[anchor unresolved - profiles hidden]");
    if (this._desync) ctx.push("[mirror desync]");
    // delta-proxy disclosure (registry section 4: grades were measured on
    // up/down 1-min volume; live delta is the platform's bid/ask split,
    // corr 0.87 -- this caveat must stay on the banner)
    ctx.push("delta=bid/ask proxy (graded on up/down)");
    ctx.push(duMode ? "[du]" : "[px]");     // effective mode, always visible
    items.push(frameTxt("stat3", 70, 54, ctx.join("   |   "),
      out.confluence ? COLORS.conflu : (this.barMin !== 1 ? COLORS.warn : COLORS.dim),
      FONT_SM));
    // prop-delivery diagnostics (field report: instrument, don't assume)
    if (O.diag) {
      const p = this.props || {};
      const dump = ["htfSessions", "scaledWidths", "devProfile", "nodes",
        "vaFill", "vaFillColor", "vaFillOpacity", "showHistory", "alignTest", "diag"]
        .map(k => k + "=" + (typeof p[k]) + ":" + String(p[k])).join("  ");
      // anchor state FIRST: it is the load-bearing diagnostic and the props
      // dump is long enough to clip off the right edge of the viewport
      // (learned live 2026-08-09). i/lastTms pin down the live chart-index
      // space so an anchor displacement can be measured remotely.
      items.push(frameTxt("stat4", 70, 72,
        "anchor=" + (x0Ok ? "ok@" + x0 : "MISS") +
        " i=" + i + " base=" + this.idxBase + " mirror=" + this.tmsList.length +
        "   props: " + dump,
        COLORS.dim, FONT_SM));
    }

    // ---- session start marker (verifies the time anchor at a glance) ----
    if (x0Ok && out.prevProf && out.prevProf.length) {
      let pLo = Infinity, pHi = -Infinity, ph = 0;
      for (const r of out.prevProf) {
        if (r.price < pLo) pLo = r.price;
        if (r.price > pHi) pHi = r.price;
        ph = r.h || ph;
      }
      items.push(vline("dayLn", x0, pLo - ph, pHi + ph, COLORS.dayLine, 3));
    }

    // ---- value-area ZONE: dashed outline, session start -> now ----
    // (v3 drew a filled band here; live 2026-08-09 proved fill alpha is
    // not honored -- it rendered as an opaque slab occluding the rows.
    // Dale's zone, rebuilt on proven line primitives.)
    if (x0Ok && out.prev && i > x0)
      items.push(box("vaZ", x0, i + 1, out.prev.vah, out.prev.val, COLORS.vaZone, 3));

    // ---- HTF composite (dark gold ghost, true mirror: grows LEFT) ----
    // px fallback cannot mirror left (negative widths are unproven), so the
    // ghost is du-mode only; rays + labels always draw.
    if (x0Ok && duMode && out.htfRows && x0 > 2) {
      // cap the mirror's max width at x0 so no row's left edge lands on a
      // negative du x (unproven coordinate region; shape is preserved --
      // rows scale proportionally to the cap)
      items.push(...histogram("hpro", out.htfRows, x0, -1,
        COLORS.htfGhost, COLORS.htfGhost, COLORS.htfPocRow,
        Math.min(this.wHtf, x0), true));
    }

    // ---- per-session profiles (MarketProfile-style: one histogram per
    // day, anchored at each session's own start -- the MT5 look) ----
    if (out.sessionProfiles) {
      for (let s = 0; s < out.sessionProfiles.length; s++) {
        const sp = out.sessionProfiles[s];
        const six = idx(sp.start);
        if (six === undefined) continue;
        // keyed by the session's own start tms (not loop position): the
        // slice window shifts at every 17:00 NY roll and positional keys
        // would swap identity across all six profiles (the A8 defect class)
        items.push(...histogram("sp" + sp.start, sp.rows, six, 1,
          COLORS.sess, COLORS.sessVA, COLORS.sessPoc,
          duMode ? this.wSess : VIS.sessMaxPx, duMode));
      }
    }

    // ---- the CURRENT session's box (SVP layout) ----
    // devProfile=1 (default): the DEVELOPING session profile lives here --
    // the classic session-volume-profile reading -- with dPOC/dVAH/dVAL
    // rays updating as the session builds. The prior session's histogram
    // stays in its own box (sessionProfiles below).
    // devProfile=0: v4 layout -- prior-session histogram projected here.
    const dev = O.dev ? this._devProfile(out) : null;
    if (dev) {
      if (histOk)
        // dev POC row wears the teal-green dev color, NOT the graded gold:
        // gold is v4's visual signature for the graded PRIOR POC, and the
        // developing dPOC carries no tested grade (evidence-honesty rule)
        items.push(...histogram("dpro", dev.rows, x0, 1,
          COLORS.profile, COLORS.profileVA, COLORS.dev,
          duMode ? capW(this.wPrev) : VIS.prevMaxPx, duMode));
      items.push(ray("dpocL", rayX0, dev.poc, COLORS.dev, 2, 2));
      lab("dpocT", dev.poc, "dPOC " + fmt(dev.poc), COLORS.dev, FONT_SM);
      items.push(ray("dvahL", rayX0, dev.vah, COLORS.dev, 1, 5));
      lab("dvahT", dev.vah, "dVAH " + fmt(dev.vah), COLORS.dev, FONT_SM);
      items.push(ray("dvalL", rayX0, dev.val, COLORS.dev, 1, 5));
      lab("dvalT", dev.val, "dVAL " + fmt(dev.val), COLORS.dev, FONT_SM);
    } else if (!O.dev && out.prevProf && histOk) {
      items.push(...histogram("ppro", out.prevProf, x0, 1,
        COLORS.profile, COLORS.profileVA, COLORS.pocRow,
        duMode ? capW(this.wPrev) : VIS.prevMaxPx, duMode));
    }
    if (out.prev) {
      const thin = out.prev.liquid ? "" : "  [THIN - no signals]";
      items.push(ray("pocL", rayX0, out.prev.poc, COLORS.poc, 3, 1));
      lab("pocT", out.prev.poc, "PREV POC " + fmt(out.prev.poc) + thin, COLORS.poc);
      items.push(ray("vahL", rayX0, out.prev.vah, COLORS.va, 1, 3));
      lab("vahT", out.prev.vah, "VAH " + fmt(out.prev.vah), COLORS.va, FONT_SM);
      items.push(ray("valL", rayX0, out.prev.val, COLORS.va, 1, 3));
      lab("valT", out.prev.val, "VAL " + fmt(out.prev.val), COLORS.va, FONT_SM);
    }

    // ---- HVN / LVN node ticks, projected from the session start ----
    // Short, quiet ticks: dark red = low-volume pocket (where the engine's
    // stopBehindLVN sees structure), pale gold = high-volume node.
    if (O.nodes && x0Ok) {
      const nd = this._nodesOf(out);
      if (nd && (nd.lvns.length || nd.hvns.length)) {
        const tick = pr => ({ tag: "Line",
          a: { x: du(x0), y: du(pr) }, b: { x: du(x0 + 6), y: du(pr) } });
        if (nd.lvns.length)
          items.push({ tag: "LineSegments", key: "ndL", global: true,
            lines: nd.lvns.map(n => tick(n.price)),
            lineStyle: { lineWidth: 3, color: "#8A4A50" } });
        if (nd.hvns.length)
          items.push({ tag: "LineSegments", key: "ndH", global: true,
            lines: nd.hvns.map(n => tick(n.price)),
            lineStyle: { lineWidth: 3, color: "#B0A060" } });
      }
    }

    // ---- naked POC rays (Dale's signature: red, extended until tested) ----
    if (out.nakedPocs) {
      for (let n = 0; n < out.nakedPocs.length; n++) {
        const np = out.nakedPocs[n];
        if (out.prev && Math.abs(np.poc - out.prev.poc) < 1e-9) continue; // white ray owns it
        const ix = idx(np.endTms);
        // keyed by session end time, not list position: entries shift as
        // rays get tested, and positional keys would swap identities
        items.push(ray("nk" + np.endTms, ix !== undefined ? ix : Math.max(0, rayX0 - 200),
          np.poc, COLORS.naked, 1, 1));
        lab("nkT" + np.endTms, np.poc, "NPOC " + fmt(np.poc), COLORS.nakedTxt, FONT_SM);
      }
    }

    if (out.htf) {
      const hx = Math.max(0, rayX0 - 40);
      items.push(ray("hpocL", hx, out.htf.poc, COLORS.htf, 3, 1));
      lab("hpocT", out.htf.poc,
        "HTF POC " + fmt(out.htf.poc) + " (" + out.htf.sessions + "s)", COLORS.htf);
      items.push(ray("hvahL", hx, out.htf.vah, COLORS.htf, 1, 4));
      lab("hvahT", out.htf.vah, "HTF VAH " + fmt(out.htf.vah), COLORS.htf, FONT_SM);
      items.push(ray("hvalL", hx, out.htf.val, COLORS.htf, 1, 4));
      lab("hvalT", out.htf.val, "HTF VAL " + fmt(out.htf.val), COLORS.htf, FONT_SM);
    }

    // ---- ACCUM rotation: box + histogram + level ray ----
    if (out.accum) {
      const ia = idx(out.accum.start);
      const ib = idx(out.accum.end);
      if (ia !== undefined && ib !== undefined && out.accum.winHi) {
        items.push(box("accB", ia, ib, out.accum.winHi, out.accum.winLo, COLORS.accum));
        if (out.accum.rows) {
          const wCap = duMode ? Math.min(this.wAcc, Math.max(10, ib - ia)) : VIS.accMaxPx;
          items.push(...histogram("apro", out.accum.rows, ia, 1,
            COLORS.accHist, COLORS.accHist, COLORS.accPocRow, wCap, duMode));
        }
      }
      items.push(ray("accL", ia !== undefined ? ia : rayX0, out.accum.level, COLORS.accum, 2, 1));
      lab("accT", out.accum.level,
        "ACCUM " + fmt(out.accum.level) +
        (out.accum.short ? "  SELL retest" : "  BUY retest") +
        "  [+0.28R/75% n12]", COLORS.accum);
    }

    // ---- LEG cluster ----
    if (out.leg) {
      items.push(ray("legL", rayX0, out.leg.level, COLORS.leg, 1, 1));
      lab("legT", out.leg.level,
        "LEG " + fmt(out.leg.level) +
        (out.leg.down ? "  SELL retest" : "  BUY retest") + "  [untested]",
        COLORS.leg, FONT_SM);
    }

    // ---- marks: absorption, signals, flow-quit (noise-controlled) ----
    // Current session: full detail. Prior sessions: signals shrink to bare
    // arrows (showHistory=1 restores short labels); absorption and
    // flow-quit stamps are current-session only.
    let lastSig = null, lastSigIdx, lastAbsorb = null, lastAbsorbIdx;
    for (let m = 0; m < this.marks.length; m++) {
      const mk = this.marks[m];
      const mi = idx(mk.tMs);
      if (mi === undefined) continue;
      const ev = mk.ev;
      const today = mk.day === out.day;
      if (ev.kind === "absorb") {
        if (!today) continue;
        items.push(txt("ab" + mk.tMs, mi, mk.price,
          "\u25C6", COLORS.absorb, ev.long ? 12 : -12, FONT_SM, "centerMiddle"));
        lastAbsorb = mk; lastAbsorbIdx = mi;
        continue;
      }
      if (ev.kind === "flowquit") {
        if (!today) continue;
        items.push(txt("fq" + mk.tMs, mi, mk.price,
          "FLOW QUIT", COLORS.conflu, 16, FONT, "centerMiddle"));
        continue;
      }
      const col = ev.long ? COLORS.buy : COLORS.sell;
      items.push(txt("sgA" + mk.tMs, mi, ev.entry,
        ev.long ? "\u25B2" : "\u25BC", col, ev.long ? -10 : 10,
        { fontSize: 16, fontWeight: "bold" }, "centerMiddle"));
      if (today)
        items.push(txt("sg" + mk.tMs, mi, ev.entry,
          (ev.long ? "  BUY " : "  SELL ") + ev.kind + " " + fmt(ev.entry) +
          "  " + ev.tag + (ev.htf ? "  " + ev.htf : ""), col,
          ev.long ? -26 : 26, FONT_SM, "centerMiddle"));
      else if (O.history)
        items.push(txt("sg" + mk.tMs, mi, ev.entry,
          (ev.long ? "BUY " : "SELL ") + ev.kind, col,
          ev.long ? -24 : 24, FONT_SM, "centerMiddle"));
      if (today) { lastSig = mk; lastSigIdx = mi; }
    }
    // label the most recent absorption of the session (the diamonds carry
    // the rest without stamping text over every churn bar)
    if (lastAbsorb && lastAbsorbIdx !== undefined) {
      items.push(txt("abT", lastAbsorbIdx, lastAbsorb.price,
        "ABSORPTION", COLORS.absorb, lastAbsorb.ev.long ? 26 : -26,
        FONT_SM, "centerMiddle"));
    }
    if (lastSig && lastSigIdx !== undefined) {
      const ev = lastSig.ev;
      items.push(ray("tpL", lastSigIdx, ev.tp, COLORS.tp, 2, 3));
      lab("tpT", ev.tp, "TP " + fmt(ev.tp), COLORS.tp);
      items.push(ray("slL", lastSigIdx, ev.sl, COLORS.sl, 2, 2));
      lab("slT", ev.sl, "SL " + fmt(ev.sl), COLORS.sl);
    }

    // ---- alignment self-test (opt-in) ----
    // Draws one magenta row centered on PREV POC through the SAME vrect
    // path as every histogram row. The white PREV POC ray must bisect the
    // magenta row. Row entirely ABOVE the ray => platform anchors rects at
    // the TOP edge: set RECT_Y_ANCHOR = "top" and rebuild.
    if (O.alignTest && x0Ok && out.prev && out.prevProf && out.prevProf.length) {
      const h = out.prevProf[0].h || 0.5;
      const pLo = out.prev.poc - h / 2, pHi = out.prev.poc + h / 2;
      items.push({ tag: "Shapes", key: "alnR", global: true,
        primitives: [duMode ? vrect(x0, Math.max(10, Math.round((i - x0) / 3)), pLo, pHi)
          : pxrect(x0, 80, pLo, pHi)],
        fillStyle: { color: COLORS.test } });
      items.push(frameTxt("alnT", 70, O.diag ? 90 : 72,
        "ALIGN TEST: white POC ray must bisect the magenta row. Row ABOVE ray => set RECT_Y_ANCHOR='top'",
        COLORS.test, FONT_SM));
    }

    // ---- right-edge labels, de-collided ----
    items.push(...layoutLabels(labels, lx, out.atr || 0));
    return items;
  }

  filter() { return true; }
}

// ---- PLOTTER BLOCK (optional translucent value-area fill) ----
// The custom-plotter pipeline (canvas.drawLine with a first-class
// `opacity` style) is how working community indicators render real
// translucency -- independent of the graphics-items path where fill
// alpha is broken (live Bug A). Draws one bar-wide vertical line per bar
// from that bar's session VAL to VAH. Gated by vaFill (DEFAULT OFF until
// live-verified). Defensive throughout: a failure here must never take
// the chart down. ROLLBACK: if the indicator fails to LOAD after adding
// this version, delete this block and the `plotter` key in
// module.exports below.
function vaFillPlotter(canvas, instance, history) {
  try {
    if (!plt) return;   // ./tools/plotting unavailable on this build
    const props = instance.props || {};
    if (!pBool(props.vaFill, false)) return;
    const color = (typeof props.vaFillColor === "string" && props.vaFillColor)
      ? props.vaFillColor : "#3E7E93";
    let opac = Number(props.vaFillOpacity);
    if (!Number.isFinite(opac)) opac = 18;
    opac = Math.max(0, Math.min(100, opac)) / 100;
    if (opac <= 0) return;
    // cap the walk: one drawLine per bar over a deep-loaded 110k-bar
    // history would hammer every repaint. ~20k 1-min bars = 2+ weeks of
    // shading, far beyond what any zoom level shows at once.
    const first = Math.max(0, history.data.length - 20000);
    for (let i = first; i < history.data.length; i++) {
      const item = history.get(i);
      if (!item || item.vaLo === undefined || item.vaHi === undefined) continue;
      const x = plt.x.get(item);
      canvas.drawLine(plt.offset(x, item.vaLo), plt.offset(x, item.vaHi),
        { color, relativeWidth: 1, opacity: opac });
    }
  } catch (e) { /* optional layer: swallow, never break the chart */ }
}

// Toggles are NUMBER specs (0/1): boolean paramSpecs registered in the
// settings dialog but their VALUES never reached this.props on live
// (2026-08-09 session) -- number/period specs follow the documented
// delivery path. Values are defensively coerced in _opts() regardless.
module.exports = {
  name: "traderMachell",
  description: "TraderMachell - Dale volume-profile model (tested grades)",
  calculator: traderMachell,
  inputType: meta.InputType.BARS,
  areaChoice: meta.AreaChoice.OVERLAY,
  tags: ["TraderMachell"],
  params: {
    htfSessions: predef.paramSpecs.period(20),
    scaledWidths: predef.paramSpecs.number(1, 1, 0),  // 1 = du widths (live-proven, scale with zoom); 0 = px mode
    devProfile: predef.paramSpecs.number(1, 1, 0),    // 1 = developing session profile + dPOC/dVAH/dVAL (SVP); 0 = v4 layout
    nodes: predef.paramSpecs.number(1, 1, 0),         // 1 = HVN/LVN ticks on the prior profile
    vaFill: predef.paramSpecs.number(0, 1, 0),        // 1 = translucent VA fill via canvas plotter (verify live first)
    // paramSpecs.color is community-proven but unverified on OUR live
    // build -- guard so its absence can't kill the whole module at load
    // (the plotter falls back to #3E7E93 when the value isn't a string)
    vaFillColor: (predef.paramSpecs && typeof predef.paramSpecs.color === "function")
      ? predef.paramSpecs.color("#3E7E93")
      : predef.paramSpecs.number(0, 1, 0),
    vaFillOpacity: predef.paramSpecs.number(18, 1, 0),// fill opacity, 0..100
    showHistory: predef.paramSpecs.number(0, 1, 0),   // 1 = label signals from prior sessions
    alignTest: predef.paramSpecs.number(0, 1, 0),     // 1 = Rectangle y-anchor self-test row
    diag: predef.paramSpecs.number(0, 1, 0),          // 1 = show raw prop delivery on the banner
  },
};

// plotter registration is the one construct Node cannot prove against the
// live platform -- register conditionally so a missing/renamed plotters
// API degrades to "no vaFill layer" instead of "no indicator at all"
if (plt && predef.plotters && typeof predef.plotters.custom === "function") {
  module.exports.plotter = [predef.plotters.custom(vaFillPlotter)];
}
