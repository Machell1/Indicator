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
const FONT_XS = { fontSize: 10, fontWeight: "normal" };

// ---- MP-look time ramp (docs/MP55396_CLONE_SPEC.md section 2) ----------
// Row color encodes WHEN the row's volume traded within its session:
// session open = pure blue -> session close = pure red, interpolated as a
// pure R/B mix (G stays 00) so the at-a-glance reading matches the
// trader's MT5 Market Profile. Colors are bucketed into MP_RAMP_STEPS
// discrete stops so rows batch into few Shapes items (platform budget).
const MP_RAMP_STEPS = 10;
const MP_SPAN_FILL = 0.85;   // max row width as a fraction of the session's bar span
const MP_PROMINENT = 0.8;    // POC-row bar coverage for a "prominent median"
// PER-FAMILY EMPHASIS (assessment section 10, tuned against the 5M
// patchwork frame): with every profile full-width AND translucent,
// neighbouring families share screen space and their opacities compound.
// The single rowOpacity knob still scales everything; these multipliers
// fix the RELATIVE emphasis -- the developing profile (the working
// context) stays prominent, history reads legible-not-prominent, the
// HTF mirror is the faintest backdrop.
const ROW_EMPHASIS = { dev: 1.0, session: 0.5, accum: 0.7, htf: 0.4 };
// WIDTH POLICY (docs/VISUAL_V9_3_ONE_MINUTE.md, a stated decision):
// FINALIZED session profiles fill MP_SPAN_FILL of their day at every
// timeframe (the MT5 look). The DEVELOPING/current-session profile and
// the v4 prev-projection stay capped at VIS.prevMaxBars (~150 one-minute
// bars) ON PURPOSE: rows render opaque (fill alpha is broken on this
// platform), and a day-wide developing profile would bury the session's
// candles. Revisit when the vaFill plotter test proves translucency.
function rampColor(t) {
  const T = Math.max(0, Math.min(1, t));
  const r = Math.round(255 * T), b = 255 - r;
  const hex = v => (v < 16 ? "0" : "") + v.toString(16).toUpperCase();
  return "#" + hex(r) + "00" + hex(b);
}
function rampBucket(t) {
  return Math.max(0, Math.min(MP_RAMP_STEPS - 1, Math.floor(t * MP_RAMP_STEPS)));
}

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

// ---- du emission transform (field report section 10) ---------------------
// MEASURED PLATFORM FACT (v7.2 probe, live 2026-08-09 21:41 CDT): on a
// LIVE chart, du(n) addresses the n-th MINUTE-SLOT of the laid-out time
// axis (weekend gap compressed, future session pre-gridded), NOT the n-th
// bar of the data array. Pre-open the two spaces coincide.
// Therefore: ALL internal logic (mirror, anchors, guards, telemetry)
// stays bar-index-true, and ONLY the final du() emission converts a bar
// index to a minute-slot -- x_du = (bar_timestamp - layout_origin_ts) /
// 60000 / barMinutes -- through the frame's DU_T, a piecewise-linear
// index->timestamp map built from the mirror (exact at every pushed bar,
// interpolated between, extrapolated 1 slot/index beyond the ends). The
// layout origin defaults to the current session start (the probe placed
// du 0 there) and is calibratable live via originShift (minutes).
// duX() replaces du() at every X-coordinate emission site; Y (price) and
// px/frame coordinates are untouched.
let DU_T = v => v;                 // identity when the transform is off
function duX(v) { return du(DU_T(v)); }

// ---- primitive helpers ---------------------------------------------------
function ray(key, x0, price, color, width, dash) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [{ tag: "Line",
      a: { x: duX(x0), y: du(price) }, b: { x: duX(x0 + 1), y: du(price) },
      infiniteEnd: true }],
    lineStyle: { lineWidth: width, color, lineStyle: dash || 1 },
  };
}
function vline(key, x, pLo, pHi, color, dash) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [{ tag: "Line", a: { x: duX(x), y: du(pLo) }, b: { x: duX(x), y: du(pHi) } }],
    lineStyle: { lineWidth: 1, color, lineStyle: dash || 3 },
  };
}
// rawX: the x is ALREADY in slot space (gauge-space callers transform
// once themselves); otherwise x is a bar index and goes through duX.
function txt(key, x, price, s, color, dyPx, font, align, rawX) {
  return {
    tag: "Text", key, global: true,
    point: { x: rawX ? du(x) : duX(x), y: dyPx ? op(du(price), "-", px(dyPx)) : du(price) },
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
// GAUGE SEMANTICS (spec section 7, the 30M slab): a histogram row's width
// is a VISUAL magnitude (volume gauge), never a time span -- it is
// emitted as a raw slot count from a PRE-transformed anchor. v8's
// endpoint transform (T(x+w) - T(x)) stretched any row whose index span
// crossed a weekend/overnight gap by the gap's wall-clock minutes: at
// 30M a 20-bar row became a multi-day slab. slotRect takes an anchor
// ALREADY in slot space (callers apply DU_T once) and a raw width.
function slotRect(xSlot, wSlots, pLo, pHi) {
  return { tag: "Rectangle",
    position: { x: du(xSlot), y: du(RECT_Y_ANCHOR === "bottom" ? pLo : pHi) },
    size: { width: du(wSlots), height: du(pHi - pLo) } };
}
function pxrect(x, wPx, pLo, pHi) {
  return { tag: "Rectangle",
    position: { x: duX(x), y: du(RECT_Y_ANCHOR === "bottom" ? pLo : pHi) },
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
  // the anchor is transformed ONCE; row widths are raw slot counts
  // (gauge semantics -- see slotRect)
  const sx = DU_T(x0);
  for (const r of rows) {
    if (!(r.frac > 0)) continue;          // no phantom stubs on gap rows
    const h = (r.h || 0) * VIS.rowFill;
    if (!(h > 0)) continue;
    const pLo = r.price - h / 2, pHi = r.price + h / 2;
    let rect;
    if (duMode) {
      const w = Math.max(VIS.minRowBars, r.frac * maxW);
      rect = slotRect(dir > 0 ? sx : sx - w, w, pLo, pHi);
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
      { tag: "Line", a: { x: duX(xA), y: du(hi) }, b: { x: duX(xB), y: du(hi) } },
      { tag: "Line", a: { x: duX(xA), y: du(lo) }, b: { x: duX(xB), y: du(lo) } },
      { tag: "Line", a: { x: duX(xA), y: du(hi) }, b: { x: duX(xA), y: du(lo) } },
      { tag: "Line", a: { x: duX(xB), y: du(hi) }, b: { x: duX(xB), y: du(lo) } },
    ],
    lineStyle: { lineWidth: 1, color, lineStyle: dash || 3 },
  };
}

// ---- right-edge label column with de-collision -----------------------------
// Labels whose prices sit within clusterATR of each other form a stack
// fanned around the cluster midpoint at a fixed pixel pitch, ordered by
// price -- close levels can never overprint each other, at any zoom.
function layoutLabels(labels, lx, atr, rawX, epsOverride) {
  const eps = Math.max(epsOverride || 0, atr * VIS.clusterATR, 1e-9);
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
      items.push(txt(L.key, lx, n > 1 ? mid : L.price, L.text, L.color, dy, L.font,
        undefined, rawX));
    }
    c = e + 1;
  }
  return items;
}

class traderMachell {
  // bmOverride: a timeframe-change reset passes the period DERIVED FROM
  // OBSERVED BAR SPACING here, because chartDescription is known-stale in
  // that path (the 5M->1M infinite reset loop, spec section 5). The
  // platform's own init() call passes nothing and reads chartDescription
  // as before. Fields deliberately NOT assigned here survive resets:
  // _resetTimes, _staleCd, _resetLoop (see _checkTimeframe).
  init(bmOverride) {
    let barMin = 1;
    const cd = this.chartDescription;
    this.timeBased = !cd || cd.underlyingType === "MinuteBar";
    if (cd && cd.underlyingType === "MinuteBar" && cd.elementSize > 0)
      barMin = cd.elementSize;
    if (bmOverride) barMin = bmOverride;
    this.barMin = barMin;
    this._obsDeltas = [];         // inter-bar spacing samples since reset
    this._obsFor = 0;             // last bar timestamp sampled
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
    this._overshoot = false;
    this.mirrorGapped = false;    // sticky: the walk-back stranded bars at
    // least once, so the mirror may not be one-entry-per-chart-bar
    this._tfReset = false;        // a timeframe change just rebuilt state
  }

  // ---- timeframe-change detection (TIMEFRAME_ANCHORING_SPEC.md sec 1+5) ----
  // The platform keeps a graphics indicator's state across a timeframe
  // change AND chartDescription can stay STALE at the old timeframe
  // (section 5, live-proven: after 5M->1M the description still read
  // MinuteBar/5). v9's reset re-read that stale description and trapped
  // the indicator in an infinite reset loop (mirror wiped every bar,
  // chart dead until F5). Rules now:
  //  - detector A (chartDescription) handles proper switches in both
  //    directions, but is suppressed while the description still shows a
  //    value we have PROVEN stale;
  //  - detector B (observed spacing) handles the stale-description case:
  //    an inter-bar spacing BELOW the known period is impossible on a
  //    legitimate feed, so one finer bar is proof. The new period is
  //    DERIVED FROM THE DATA -- chartDescription is not consulted in
  //    this branch (it is stale by definition);
  //  - resets are rate-limited; sustained flapping escalates to a
  //    [reset loop - press F5] banner with the indicator kept ALIVE at
  //    its current settings instead of dead.
  _checkTimeframe(d) {
    if (this._resetLoop) return;
    const cd = this.chartDescription;
    const cdSize = (cd && cd.underlyingType === "MinuteBar" && cd.elementSize > 0)
      ? cd.elementSize : null;
    const stale = this._staleCd || null;
    // once the platform's description agrees with reality again, trust it
    if (cdSize !== null && cdSize === this.barMin && stale !== null)
      this._staleCd = null;
    // one spacing sample per NEW bar timestamp
    const dMs = d.timestamp().getTime();
    if (this.lastPushedMs > 0 && dMs > this.lastPushedMs && dMs !== this._obsFor) {
      this._obsFor = dMs;
      this._obsDeltas.push(dMs - this.lastPushedMs);
      if (this._obsDeltas.length > 6) this._obsDeltas.shift();
    }
    // A) proper switch reported by the platform
    if (cdSize !== null && cdSize !== this.barMin && cdSize !== stale) {
      this._reset(cdSize, null);
      return;
    }
    // B) observation is AUTHORITATIVE in both directions (community
    // anchoring study item 1: chartDescription is only ever a hint --
    // MTF Key Levels proves an indicator can be fully correct knowing
    // nothing about its own timeframe).
    const per = this.barMin * 60e3;
    // finer: one spacing below the period is proof (impossible on a
    // legitimate feed)
    const finer = this._obsDeltas.filter(dl => dl < per);
    if (finer.length >= 1) {
      const inferred = Math.max(1, Math.round(Math.min.apply(null, finer) / 60e3));
      this._reset(inferred, cdSize !== inferred ? cdSize : null);
      return;
    }
    // coarser: demands unanimity (six IDENTICAL deltas, each an exact
    // >=2x minute multiple of the period) AND a disagreeing-or-absent
    // description. The second condition is engine-safety, learned from
    // the MUST-PASS gate: real overnight data CAN print six identical
    // multi-minute gaps, and a false coarser reset wipes graded engine
    // state mid-stream (signals diverge) -- while a missed coarse switch
    // only mis-scales display slots. When the description AGREES with the
    // current period, there is nothing to detect; when it disagrees (the
    // stale-description class) or is absent, unanimity decides. This
    // still closes the v9.1 residual gap: after a stale episode the
    // description disagrees with the observed barMin by definition.
    if ((cdSize === null || cdSize !== this.barMin) &&
        this._obsDeltas.length >= 6) {
      const d0 = this._obsDeltas[0];
      if (d0 >= 2 * per && d0 % 60e3 === 0 &&
          this._obsDeltas.every(x => x === d0)) {
        const inferred = d0 / 60e3;
        this._reset(inferred, cdSize !== inferred ? cdSize : null);
      }
    }
  }

  _reset(newBarMin, staleCd) {
    const now = Date.now();
    this._resetTimes = (this._resetTimes || []).filter(t => now - t < 60e3);
    this._resetTimes.push(now);
    if (this._resetTimes.length > 3) {
      // flapping: stop resetting, stay alive, surface the remedy
      this._resetLoop = true;
      return;
    }
    this.init(newBarMin);
    this._staleCd = staleCd;
    this._tfReset = true;
  }

  // effective options, re-derived EVERY draw from coerced props (field
  // report requirement: never trust platform prop types or delivery; the
  // defaults here are what actually runs when a prop never arrives)
  _opts() {
    const p = this.props || {};
    return {
      duMode: pBool(p.scaledWidths, true),   // du widths live-proven 2026-08-09
      dev: pBool(p.devProfile, true),        // developing session profile (SVP)
      rowsPlot: pBool(p.rowsPlot, true),     // translucent plotter rows (v10)
      edge: pBool(p.edgeProfile, true),      // right-edge pinned live profile (v12)
      fibs: pBool(p.fibs, true),             // fib retracements of the session leg (UNTESTED aid)
      edgeW: pNum(p.edgeWidth, 140),         // edge profile max row width, px
      edgeOff: Number.isFinite(Number(p.edgeOffset)) ? Number(p.edgeOffset) : 170,
      nodes: pBool(p.nodes, true),           // HVN/LVN ticks on the prior profile
      history: pBool(p.showHistory, false),
      alignTest: pBool(p.alignTest, false),
      diag: pBool(p.diag, false),
      calib: pBool(p.calib, false),          // du-axis calibration probe (section 9)
      // du emission mode (section 10): 0 = bar-index (pre-open behavior,
      // Saturday-proven), 1 = minute-slots (live axis, measured), 2 = AUTO
      // (minute-slots only while the chart is live: last pushed bar fresh)
      duTime: [0, 1, 2].indexOf(Number(p.duTime)) >= 0 ? Number(p.duTime) : 2,
      originShift: Number.isFinite(Number(p.originShift)) ? Number(p.originShift) : 0,
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

  // ---- MP-look per-session style pass (display-only, cached forever:
  // finalized sessions are immutable) ----
  // Recomputes the session's profile with the engine's own buildProfile
  // and grid convention, then adds what the engine's display rows don't
  // carry: per-row volume-weighted MEAN TIME (bar-position fraction of
  // the session -- drives the Blue->Red ramp), per-row bar coverage (the
  // POC row's coverage >= MP_PROMINENT of the session's bars = prominent
  // median, the behavior of the trader's MT5 tool), and VAH/VAL for the
  // bracket. Engine untouched; values converge with the graded profile
  // by construction (same math).
  _mpSession(sess) {
    if (!this._mp) this._mp = new Map();
    const hit = this._mp.get(sess.startTms);
    if (hit !== undefined) return hit;
    let res = null;
    const bars = sess.bars;
    if (bars && bars.length >= 2) {
      let lo = Infinity, hi = -Infinity, vol = 0;
      for (const b of bars) {
        if (b.l < lo) lo = b.l;
        if (b.h > hi) hi = b.h;
        vol += b.vol;
      }
      const step = Math.max((hi - lo) / this.core.cfg.rows, 1e-9);
      const prof = vol > 0 ? buildProfile(bars, step) : null;
      if (prof) {
        // per-grid-row volume, volume*time and bar-coverage accumulation,
        // same allocation the engine uses (equal share across the bar's
        // spanned rows)
        const acc = new Map();
        const nB = bars.length;
        for (let bi = 0; bi < nB; bi++) {
          const b = bars[bi];
          const a = floorDiv(b.l - prof.lo, step);
          const z = floorDiv(b.h - prof.lo, step);
          const share = z >= a ? b.vol / (z - a + 1) : b.vol;
          const tf = nB > 1 ? bi / (nB - 1) : 0;
          for (let k = a; k <= z; k++) {
            let e = acc.get(k);
            if (!e) { e = { v: 0, vt: 0, n: 0 }; acc.set(k, e); }
            e.v += share;
            e.vt += share * tf;
            e.n += 1;
          }
        }
        const pocAcc = acc.get(prof.pocRow);
        const prominent = !!pocAcc && pocAcc.n / nB >= MP_PROMINENT;
        // group into <=30 display rows exactly like the engine's
        // displayRows (same grouping, same edge clip), carrying mean time
        const keys = [...acc.keys()].sort((x, y) => x - y);
        const kLo = keys[0], kHi = keys[keys.length - 1];
        const group = Math.max(1, Math.ceil((kHi - kLo + 1) / 30));
        const rows = [];
        let vmax = 0;
        for (let g = kLo; g <= kHi; g += group) {
          const kEnd = Math.min(g + group - 1, kHi);
          if (prof.lo + g * step >= hi) continue;
          let v = 0, vt = 0;
          for (let k = g; k <= kEnd; k++) {
            const e = acc.get(k);
            if (e) { v += e.v; vt += e.vt; }
          }
          const price = prof.lo + ((g + kEnd + 1) / 2) * step;
          rows.push({ price, v, t: v > 0 ? vt / v : 0, h: group * step,
            inVA: price >= prof.val && price <= prof.vah,
            isPoc: prof.pocRow >= g && prof.pocRow <= kEnd });
          if (v > vmax) vmax = v;
        }
        if (vmax > 0) {
          for (const r of rows) { r.frac = r.v / vmax; delete r.v; }
          res = { rows, poc: prof.poc, vah: prof.vah, val: prof.val,
            prominent, nBars: nB };
        }
      }
    }
    this._mp.set(sess.startTms, res);
    if (this._mp.size > 12)
      this._mp.delete(this._mp.keys().next().value);
    return res;
  }

  // ---- session extremes for the fib layer (display-only, cached) ----
  _fibx(out) {
    const bars = this.core.dayBars;
    if (!bars || bars.length < 5) return null;
    const F = this._fx;
    if (F && F.day === out.day && F.n === bars.length) return F;
    let hi = -Infinity, lo = Infinity, hiT = 0, loT = 0;
    for (const b of bars) {
      if (b.h > hi) { hi = b.h; hiT = b.tMs; }
      if (b.l < lo) { lo = b.l; loT = b.tMs; }
    }
    this._fx = { day: out.day, n: bars.length, hi, lo, hiT, loT };
    return this._fx;
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
    this._checkTimeframe(d);
    // prepend rebase (Q2): a bar we have ALREADY pushed reveals its
    // current chart index; any shift versus what we stored means history
    // back-loading moved every index -- re-measure the frame offset so
    // stored indexes stay true. The current bar covers the common case...
    const dMs = d.timestamp().getTime();
    if (this.idxList.length && dMs === this.lastPushedMs)
      this.idxBase = i - this.idxList[this.idxList.length - 1];
    if (history && typeof history.get === "function" && i > 0) {
      let k = i - 1;
      let sawBoundary = false;
      const backlog = [], idxs = [];
      // after a timeframe reset the mirror is empty ON PURPOSE: allow one
      // deep backfill so PREV/HTF context rebuilds without an F5 (the
      // normal 500 cap only bounds steady-state per-call work)
      const cap = this._tfReset ? 6000 : 500;
      while (k >= 0 && backlog.length < cap) {
        const e = history.get(k);
        if (!e || typeof e.timestamp !== "function") break;
        const eMs = e.timestamp().getTime();
        if (eMs <= this.lastPushedMs) {
          sawBoundary = true;
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
      // a walk that ends WITHOUT reaching the already-pushed boundary
      // (history.get failed mid-walk, or the 500-bar cap filled) is about
      // to strand bars: everything older than this backlog gets locked
      // out by the lastPushedMs guard forever. Record the fact -- it
      // decides which anchor-resolution path can be trusted (see _idxOf).
      if (!sawBoundary && k >= 0 && this.idxList.length && backlog.length)
        this.mirrorGapped = true;
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

  // resolve a bar-start timestamp to its CURRENT chart index, by exact
  // binary search over actual mirror entries only (never by time).
  //
  // Two independent computations, each exact under a different live
  // failure mode (both observed on 2026-08-09):
  //  - TAIL-OFFSET (position in the mirror counted from the newest entry,
  //    anchored at the live bar's ground-truth index): exact even when
  //    the platform RE-INDEXES or TRIMS the chart array between pushes
  //    (the 18:00-ET-open frame: old anchors overshot into the future
  //    grid because stored indexes went stale with no rebase observable).
  //    Its only blind spot: a mirror that MISSED bars.
  //  - STORED-INDEX (chart index recorded at push time + prepend base):
  //    exact even when the mirror missed bars (Q3 walk-back failures),
  //    but stale if the chart re-indexed unseen.
  // The walk-back now records when it strands bars (mirrorGapped), which
  // is precisely when tail-offset loses its guarantee -- so: trust TAIL
  // unless the mirror is known-gapped; any disagreement raises the
  // [mirror desync] banner flag. Regardless of path, an anchor resolved
  // BEYOND the live bar is invalid: suppressed + [anchor overshoot].
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
        const stored = this.idxList[lo] + this.idxBase;
        const tail = endIdx - (L.length - 1 - lo);
        if (stored !== tail) this._desync = true;
        res = this.mirrorGapped ? stored : tail;
        if (res < 0) res = undefined;
        else if (res > endIdx + 1) {                // beyond the live bar
          this._overshoot = true;
          res = undefined;
        }
      }
    }
    cache.set(tMs, res);
    return res;
  }

  // index -> minute-slot conversion for the du emission transform.
  // Piecewise-linear through the mirror's (current-frame index, timestamp)
  // pairs: exact at every pushed bar, time-interpolated between entries
  // (a span crossing a session halt widens by the halt's minutes, exactly
  // like the laid-out axis), extrapolated 1 slot per index beyond the
  // ends (the pre-gridded future and the pre-history left).
  _slotOf(v, originTs) {
    const L = this.tmsList, base = this.idxBase, mPer = this.barMin * 60e3;
    const nL = L.length;
    if (!nL) return v;
    const idxAt = p => this.idxList[p] + base;
    let ts;
    const iFirst = idxAt(0), iLast = idxAt(nL - 1);
    if (v <= iFirst) ts = L[0] + (v - iFirst) * mPer;
    else if (v >= iLast) ts = L[nL - 1] + (v - iLast) * mPer;
    else {
      // binary search the mirror by current-frame index (ascending)
      let lo = 0, hi = nL - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (idxAt(mid) < v) lo = mid + 1; else hi = mid;
      }
      const iHi = idxAt(lo);
      if (iHi === v) ts = L[lo];
      else {
        const iLo = idxAt(lo - 1);
        ts = L[lo - 1] + (v - iLo) * (L[lo] - L[lo - 1]) / (iHi - iLo);
      }
    }
    return (ts - originTs) / mPer;
  }

  // independent pure tail-offset reference for the mismatch cross-check:
  // no trust selection, no base, no stored indexes -- just the entry's
  // position in the mirror counted from the newest entry.
  _tailRef(tMs, endIdx) {
    const L = this.tmsList;
    if (!L.length || tMs < L[0]) return undefined;
    let lo = 0, hi = L.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (L[mid] < tMs) lo = mid + 1; else hi = mid;
    }
    if (L[lo] !== tMs) return undefined;
    const r = endIdx - (L.length - 1 - lo);
    return r < 0 ? undefined : r;
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
    this._overshoot = false;
    // ---- du emission transform for this frame (section 10) ----
    // AUTO engages minute-slots only when the chart is live (the measured
    // divergence exists only once the live template is laid out; pre-open
    // the spaces coincide and bar-index emission is the Saturday-proven
    // behavior).
    const tMode = O.duTime === 1 ||
      (O.duTime === 2 && this.lastPushedMs > 0 &&
        Date.now() - this.lastPushedMs < 3 * this.barMin * 60e3);
    const originTs = (out.dayStartTms || 0) + O.originShift * 60e3;
    DU_T = tMode ? (v => this._slotOf(v, originTs)) : (v => v);
    // per-layer anchor-vs-timestamp cross-check (live field report section
    // 5): every consumer resolves through idx(t, layer); the resolved
    // anchor is compared against an INDEPENDENT pure tail-offset reference
    // for the same timestamp. Divergence beyond 1 bar means some path is
    // consuming a stale or fabricated index -- the layer name lands in
    // [anchor mismatch: ...] on the banner. This catches wrongness
    // anywhere IN RANGE, which the overshoot guard cannot see.
    const mism = new Set();
    let offscreen = false;
    const emits = { accB: "-", accL: "-", sp: "-", hpro: "-", apro: "-" };
    // v10.1: ALL profile row fills ride the translucent plotter path when
    // rowsPlot is on (live-verified alpha + repaint cost, 2026-08-10).
    // Publishers append with a priority (0=dev, 1=sessions, 2=ACCUM,
    // 3=HTF mirror); the list is priority-sorted before the frame ends so
    // the plotter's shared stroke budget degrades least-important last.
    this._plotProfiles = [];
    const rowsToPlotter = O.rowsPlot && duMode;
    const futureKeys = new Set();   // filled by guards below + the final scan
    const idx = (t, layer) => {
      const r = this._idxOf(t, endIdx, tcache);
      if (r !== undefined) {
        const ref = this._tailRef(t, endIdx);
        if (ref !== undefined && Math.abs(r - ref) > 1) mism.add(layer || "?");
      }
      return r;
    };
    // OCCLUSION RULE (live 2026-08-09 afternoon frame): a histogram may
    // never be placed relative to the LAST bar and may never paint over
    // the live edge. If the session-start anchor cannot be resolved,
    // histograms/zone/ticks are hidden (rays and labels stay -- levels
    // are horizontal and thin) and the banner says why. When resolved,
    // right-growing session histograms are width-capped so they stop
    // short of the final candles.
    const x0 = idx(out.dayStartTms, "day");
    const x0Ok = x0 !== undefined;
    const availBars = x0Ok ? (i - x0 - 12) : 0;
    const histOk = x0Ok && availBars >= 8;
    const capW = w => Math.min(w, availBars);
    const lx = i + 4;                       // label column, right of last bar
    const labels = [];                      // -> layoutLabels at the end
    const lab = (key, price, text, color, font) =>
      labels.push({ key, price, text, color, font });
    // LEVEL-class line (community anchoring study item 2): a level's only
    // information is its PRICE. Drawn full-width via infiniteStart with
    // both endpoints at the live edge -- the two coordinates that are
    // valid by construction on every frame -- so no prepend, re-index,
    // trim, weekend gap or timeframe switch can ever mis-anchor it.
    // Bounded right extension (study item 3) ends under the label column.
    const lvl = (key, price, color, width, dash) =>
      items.push({ tag: "LineSegments", key, global: true,
        lines: [{ tag: "Line",
          a: { x: duX(i - 1), y: du(price) }, b: { x: duX(i + 2), y: du(price) },
          infiniteStart: true }],
        lineStyle: { lineWidth: width, color, lineStyle: dash || 1 } });
    const fmt = p => (this.contractInfo && this.contractInfo.tickSize < 0.01)
      ? p.toFixed(3) : p.toFixed(1);
    // TIMEFRAME_ANCHORING_SPEC.md section 3B (constrain + disclose): every
    // profile-derived LEVEL label carries "*" when built from coarser
    // bins than the graded 1-minute basis -- a coarse-bin level must
    // never be mistaken for the graded one. The banner CAUTION line
    // explains the mark.
    const q = this.barMin !== 1 ? "*" : "";
    const fmtL = p => fmt(p) + q;

    // (the status banner is emitted at the END of this function: the
    // [mirror desync] / [anchor overshoot] flags are raised inside the
    // anchor resolutions below, and the live 2026-08-09 session proved
    // that printing the banner first silently hides them)

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
      const wH = Math.min(this.wHtf, x0);
      emits.hpro = x0 + "w" + wH;
      if (rowsToPlotter) {
        this._plotProfiles.push({ pri: 3, opMul: ROW_EMPHASIS.htf, anchor: x0, w: wH, dir: -1,
          rows: out.htfRows.map(r => ({ price: r.price, h: (r.h || 0) * VIS.rowFill,
            frac: r.frac,
            color: r.isPoc ? COLORS.htfPocRow : COLORS.htfGhost })) });
      } else
        items.push(...histogram("hpro", out.htfRows, x0, -1,
          COLORS.htfGhost, COLORS.htfGhost, COLORS.htfPocRow, wH, true));
    }

    // ---- per-session profiles: the MP_55396 look (docs/MP55396_CLONE_
    // SPEC.md). Per finalized session: Blue->Red time-graded rows filling
    // the session span, white solid median line (thick YELLOW when the
    // POC row is prominent), dashed white median ray to the right, white
    // VA bracket, and key-value text at the profile's edge. Keys carry
    // the session's own start tms (the A8 stable-key rule); widths keep
    // the v6.4 live-edge cap.
    {
      const sessions = this.core.sessions.slice(-6);
      const spEmit = [];              // one entry per session, oldest first
      for (const sess of sessions) {
        const six = idx(sess.startTms, "sp");
        if (six === undefined) {
          // v6.3 rule: a day-spanning box whose START cannot be resolved
          // is NOT drawn anywhere else -- no fallback of any kind (audit
          // for field report section 8: no session-END fallback exists
          // either). When the start predates loaded history, the banner
          // says so instead of skipping silently.
          if (this.tmsList.length && sess.startTms < this.tmsList[0]) {
            offscreen = true;
            spEmit.push("pre");
          } else spEmit.push("x");
          continue;
        }
        const mp = this._mpSession(sess);
        if (!mp) { spEmit.push("n"); continue; }
        const wS = duMode
          ? Math.min(Math.round(sess.bars.length * MP_SPAN_FILL), i - 12 - six)
          : VIS.sessMaxPx;
        if (duMode && wS < 8) { spEmit.push(six + "cap"); continue; }
        // px-mode live-edge rule: px row widths cannot be checked in du
        // space, so near-edge sessions are skipped entirely there
        if (!duMode && six > i - 60) { spEmit.push(six + "cap"); continue; }
        // emission-time span guard (spec section 4 defense in depth; the
        // width cap above makes this unreachable today, but a day-spanning
        // session structure must NEVER cross the live bar, whatever
        // upstream produced the numbers)
        if (duMode && six + wS > i - 10) {
          futureKeys.add("sp" + sess.startTms + "SPAN");
          spEmit.push(six + "SPAN");
          continue;
        }
        spEmit.push(six + "w" + wS);
        const K = "sp" + sess.startTms;
        // GAUGE SPACE (section 7): the anchor transforms once; the
        // profile's visual extent is [sx, sx + wS] in raw slots. The
        // median, bracket, ray anchor and key values all use the SAME
        // extent so they hug the rows exactly -- endpoint-transforming
        // them would stretch past the rows across halts/weekends.
        const sx = DU_T(six);
        const sRight = sx + wS;
        if (rowsToPlotter) {
          // v10.1: session rows ride the plotter path, keeping their
          // Blue->Red ramp per row (bucketed colors, same visual identity
          // as the Shapes path)
          this._plotProfiles.push({ pri: 1, opMul: ROW_EMPHASIS.session, anchor: six, w: wS,
            rows: mp.rows.filter(r => r.frac > 0 && r.h > 0)
              .map(r => ({ price: r.price, h: r.h * VIS.rowFill, frac: r.frac,
                color: rampColor((rampBucket(r.t) + 0.5) / MP_RAMP_STEPS) })) });
        } else {
          // rowsPlot=0 fallback: opaque Shapes, one item per ramp bucket
          const buckets = [];
          for (const r of mp.rows) {
            if (!(r.frac > 0) || !(r.h > 0)) continue;
            const h = r.h * VIS.rowFill;
            const pLo = r.price - h / 2, pHi = r.price + h / 2;
            const bkt = rampBucket(r.t);
            if (!buckets[bkt]) buckets[bkt] = [];
            buckets[bkt].push(duMode
              ? slotRect(sx, Math.max(VIS.minRowBars, r.frac * wS), pLo, pHi)
              : pxrect(six, Math.max(VIS.minRowPx, Math.round(r.frac * wS)), pLo, pHi));
          }
          for (let bkt = 0; bkt < MP_RAMP_STEPS; bkt++)
            if (buckets[bkt])
              items.push({ tag: "Shapes", key: K + "C" + bkt, global: true,
                primitives: buckets[bkt],
                fillStyle: { color: rampColor((bkt + 0.5) / MP_RAMP_STEPS) } });
        }
        // median line across the profile width; prominent = thick yellow
        items.push({ tag: "LineSegments", key: K + "M", global: true,
          lines: [{ tag: "Line",
            a: { x: du(sx), y: du(mp.poc) }, b: { x: du(sRight), y: du(mp.poc) } }],
          lineStyle: mp.prominent
            ? { lineWidth: 4, color: "#FFFF00", lineStyle: 1 }
            : { lineWidth: 1, color: "#FFFFFF", lineStyle: 1 } });
        // dashed median ray from the profile's right edge (ShowMedianRays=
        // All), unless the level is owned by a stronger layer: an untested
        // naked POC (red, encodes traded-through state the MT5 tool lacks)
        // or the PREV POC's solid white ray. The median ray takes over
        // once a naked level is traded through.
        const owned =
          (out.prev && mp.poc === out.prev.poc) ||
          (out.nakedPocs && out.nakedPocs.some(np => np.poc === mp.poc));
        if (!owned)
          items.push({ tag: "LineSegments", key: K + "R", global: true,
            lines: [{ tag: "Line", a: { x: du(sRight), y: du(mp.poc) },
              b: { x: du(sRight + 1), y: du(mp.poc) }, infiniteEnd: true }],
            lineStyle: { lineWidth: 1, color: "#FFFFFF", lineStyle: 3 } });
        // VA bracket: VAH/VAL spans + vertical connectors at both edges
        items.push({ tag: "LineSegments", key: K + "B", global: true,
          lines: [
            { tag: "Line", a: { x: du(sx), y: du(mp.vah) }, b: { x: du(sRight), y: du(mp.vah) } },
            { tag: "Line", a: { x: du(sx), y: du(mp.val) }, b: { x: du(sRight), y: du(mp.val) } },
            { tag: "Line", a: { x: du(sx), y: du(mp.vah) }, b: { x: du(sx), y: du(mp.val) } },
            { tag: "Line", a: { x: du(sRight), y: du(mp.vah) }, b: { x: du(sRight), y: du(mp.val) } },
          ],
          lineStyle: { lineWidth: 1, color: "#FFFFFF", lineStyle: 1 } });
        // key values at the profile's right edge (fanned per session) --
        // DROPPED at multi-session density (section 7 label collisions):
        // when sessions are shorter than ~150 bars (15M/30M), adjacent
        // stacks overprint; the right-edge column still carries levels
        // v12 cosmetic (HANDOFF carried item 1): the NEWEST finalized
        // session's key values ARE the main column's PREV levels --
        // suppress that one stack to stop the adjacent duplication
        if (sess.bars.length >= 150 && sess !== sessions[sessions.length - 1])
          items.push(...layoutLabels([
            { key: K + "TH", price: mp.vah, text: "VAH " + fmtL(mp.vah), color: "#FFFFFF", font: FONT_XS },
            { key: K + "TP", price: mp.poc, text: "POC " + fmtL(mp.poc), color: "#FFFFFF", font: FONT_XS },
            { key: K + "TL", price: mp.val, text: "VAL " + fmtL(mp.val), color: "#FFFFFF", font: FONT_XS },
          ], sRight + 2, out.atr || 0, true));
      }
      // full per-session telemetry (field report section 8: the culprit
      // must self-identify): anchor+width per rendered session, "pre" =
      // start predates loaded history, "x" = unresolved, "n" = no
      // profile, "<x>cap"/"<x>SPAN" = skipped by a live-edge guard
      if (spEmit.length) emits.sp = spEmit.join(",");
    }

    // ---- the CURRENT session's box (SVP layout) ----
    // devProfile=1 (default): the DEVELOPING session profile lives here --
    // the classic session-volume-profile reading -- with dPOC/dVAH/dVAL
    // rays updating as the session builds. The prior session's histogram
    // stays in its own box (sessionProfiles below).
    // devProfile=0: v4 layout -- prior-session histogram projected here.
    const dev = O.dev ? this._devProfile(out) : null;
    if (dev) {
      if (rowsToPlotter && x0Ok) {
        // v10: the developing profile moves to the TRANSLUCENT plotter
        // path (live-verified alpha, 2026-08-10) and fills the elapsed
        // day like the finalized sessions -- the 150-bar opaque cap and
        // the cross-timeframe width inconsistency retire together.
        // Anchor/width are CHART-INDEX space: the plotter uses the
        // platform's own per-bar plot coordinates.
        // (dev POC row keeps the teal-green dev color, never graded gold
        // -- evidence-honesty rule)
        this._plotProfiles.push({
          pri: 0, opMul: ROW_EMPHASIS.dev, anchor: x0,
          w: Math.max(8, Math.min(
            Math.round(this.core.dayBars.length * MP_SPAN_FILL), i - x0)),
          rows: dev.rows.map(r => ({ price: r.price, h: r.h * VIS.rowFill,
            frac: r.frac,
            color: r.isPoc ? COLORS.dev : (r.inVA ? COLORS.profileVA : COLORS.profile) })),
        });
      } else if (histOk)
        // fallback path (rowsPlot=0): the v9.3 opaque Shapes rows with
        // the occlusion-limiting 150-bar cap
        // (dev POC row wears the teal-green dev color, NOT the graded
        // gold: gold is v4's visual signature for the graded PRIOR POC,
        // and the developing dPOC carries no tested grade)
        items.push(...histogram("dpro", dev.rows, x0, 1,
          COLORS.profile, COLORS.profileVA, COLORS.dev,
          duMode ? capW(this.wPrev) : VIS.prevMaxPx, duMode));
      lvl("dpocL", dev.poc, COLORS.dev, 2, 2);
      lab("dpocT", dev.poc, "dPOC " + fmtL(dev.poc), COLORS.dev, FONT_SM);
      lvl("dvahL", dev.vah, COLORS.dev, 1, 5);
      lab("dvahT", dev.vah, "dVAH " + fmtL(dev.vah), COLORS.dev, FONT_SM);
      lvl("dvalL", dev.val, COLORS.dev, 1, 5);
      lab("dvalT", dev.val, "dVAL " + fmtL(dev.val), COLORS.dev, FONT_SM);
    } else if (!O.dev && out.prevProf && histOk) {
      // v4-layout projection of the prior session at today's start,
      // restyled with the same Blue->Red ramp so the chart reads as one
      // system (spec section 4); falls back to the teal rows if the
      // session's bars are no longer retained
      const prevSess = this.core.sessions[this.core.sessions.length - 1];
      const mpPrev = prevSess ? this._mpSession(prevSess) : null;
      const wP = duMode ? capW(this.wPrev) : VIS.prevMaxPx;
      if (mpPrev) {
        const px0 = DU_T(x0);
        const buckets = [];
        for (const r of mpPrev.rows) {
          if (!(r.frac > 0) || !(r.h > 0)) continue;
          const h = r.h * VIS.rowFill;
          const bkt = rampBucket(r.t);
          if (!buckets[bkt]) buckets[bkt] = [];
          buckets[bkt].push(duMode
            ? slotRect(px0, Math.max(VIS.minRowBars, r.frac * wP), r.price - h / 2, r.price + h / 2)
            : pxrect(x0, Math.max(VIS.minRowPx, Math.round(r.frac * wP)), r.price - h / 2, r.price + h / 2));
        }
        for (let bkt = 0; bkt < MP_RAMP_STEPS; bkt++)
          if (buckets[bkt])
            items.push({ tag: "Shapes", key: "pproC" + bkt, global: true,
              primitives: buckets[bkt],
              fillStyle: { color: rampColor((bkt + 0.5) / MP_RAMP_STEPS) } });
      } else {
        items.push(...histogram("ppro", out.prevProf, x0, 1,
          COLORS.profile, COLORS.profileVA, COLORS.pocRow, wP, duMode));
      }
    }
    if (out.prev) {
      const thin = out.prev.liquid ? "" : "  [THIN - no signals]";
      lvl("pocL", out.prev.poc, COLORS.poc, 3, 1);
      lab("pocT", out.prev.poc, "PREV POC " + fmtL(out.prev.poc) + thin, COLORS.poc);
      lvl("vahL", out.prev.vah, COLORS.va, 1, 3);
      lab("vahT", out.prev.vah, "VAH " + fmtL(out.prev.vah), COLORS.va, FONT_SM);
      lvl("valL", out.prev.val, COLORS.va, 1, 3);
      lab("valT", out.prev.val, "VAL " + fmtL(out.prev.val), COLORS.va, FONT_SM);
    }

    // ---- HVN / LVN node ticks, projected from the session start ----
    // Short, quiet ticks: dark red = low-volume pocket (where the engine's
    // stopBehindLVN sees structure), pale gold = high-volume node.
    if (O.nodes && x0Ok) {
      const nd = this._nodesOf(out);
      if (nd && (nd.lvns.length || nd.hvns.length)) {
        const tick = pr => ({ tag: "Line",
          a: { x: duX(x0), y: du(pr) }, b: { x: duX(x0 + 6), y: du(pr) } });
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
        // keyed by session end time, not list position: entries shift as
        // rays get tested, and positional keys would swap identities
        lvl("nk" + np.endTms, np.poc, COLORS.naked, 1, 1);
        lab("nkT" + np.endTms, np.poc, "NPOC " + fmtL(np.poc), COLORS.nakedTxt, FONT_SM);
      }
    }

    if (out.htf) {
      lvl("hpocL", out.htf.poc, COLORS.htf, 3, 1);
      lab("hpocT", out.htf.poc,
        "HTF POC " + fmtL(out.htf.poc) + " (" + out.htf.sessions + "s)", COLORS.htf);
      lvl("hvahL", out.htf.vah, COLORS.htf, 1, 4);
      lab("hvahT", out.htf.vah, "HTF VAH " + fmtL(out.htf.vah), COLORS.htf, FONT_SM);
      lvl("hvalL", out.htf.val, COLORS.htf, 1, 4);
      lab("hvalT", out.htf.val, "HTF VAL " + fmtL(out.htf.val), COLORS.htf, FONT_SM);
    }

    // ---- ACCUM rotation: box + histogram + level ray ----
    if (out.accum) {
      const ia = idx(out.accum.start, "accum");
      const ib = idx(out.accum.end, "accum");
      // section-6 audit guards: the window must be non-inverted (a stale
      // ia with a fresh ib -- or vice versa -- would otherwise draw a box
      // whose "width" points the wrong way and a histogram forced to its
      // 10-bar minimum growing PAST the anchor), and the histogram may
      // not cross the live edge when the window ends near it.
      if (ia !== undefined && ib !== undefined && ib > ia && out.accum.winHi) {
        emits.accB = ia + "-" + ib;
        items.push(box("accB", ia, ib, out.accum.winHi, out.accum.winLo, COLORS.accum));
        if (out.accum.rows) {
          let wCap = duMode ? Math.min(this.wAcc, Math.max(10, ib - ia)) : VIS.accMaxPx;
          if (duMode) wCap = Math.min(wCap, i - 12 - ia);
          if (!duMode || wCap >= 8) {
            emits.apro = ia + "w" + wCap;
            if (rowsToPlotter)
              this._plotProfiles.push({ pri: 2, opMul: ROW_EMPHASIS.accum, anchor: ia, w: wCap,
                rows: out.accum.rows.filter(r => r.frac > 0 && r.h > 0)
                  .map(r => ({ price: r.price, h: r.h * VIS.rowFill, frac: r.frac,
                    color: r.isPoc ? COLORS.accPocRow : COLORS.accHist })) });
            else
              items.push(...histogram("apro", out.accum.rows, ia, 1,
                COLORS.accHist, COLORS.accHist, COLORS.accPocRow, wCap, duMode));
          }
        }
      }
      // NEVER pin the ACCUM level at x0 when its window predates loaded
      // history (live 2026-08-09 evening: gold ray fabricated at the
      // session start) -- an old level honestly extends from the left edge
      emits.accL = "lvl";
      lvl("accL", out.accum.level, COLORS.accum, 2, 1);
      // the pre-history disclosure moves to the BOX path: the level line
      // itself is now anchor-free
      if (ia === undefined && this.tmsList.length &&
          out.accum.start < this.tmsList[0]) offscreen = true;
      // provenance suffix: when the rotation window sits LEFT of the
      // current session start, its box can be far off-viewport while this
      // right-edge label is all the trader sees of ACCUM -- say so
      // (live 2026-08-09 late session: the "cluster at the live edge" was
      // this label + ray + the dev profile; the box was off-screen left).
      const accAge = (ia === undefined || ia < x0)
        ? "  \u25C0 " + ((out.tMs - out.accum.start) / 86400e3).toFixed(1) + "d"
        : "";
      lab("accT", out.accum.level,
        "ACCUM " + fmtL(out.accum.level) +
        (out.accum.short ? "  SELL retest" : "  BUY retest") +
        "  [+0.28R/75% n12]" + accAge, COLORS.accum);
    }

    // ---- LEG cluster ----
    if (out.leg) {
      lvl("legL", out.leg.level, COLORS.leg, 1, 1);
      lab("legT", out.leg.level,
        "LEG " + fmtL(out.leg.level) +
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
      const mi = idx(mk.tMs, "mark");
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
          (ev.long ? "  BUY " : "  SELL ") + ev.kind + " " + fmtL(ev.entry) +
          "  " + ev.tag + q + (ev.htf ? "  " + ev.htf : ""), col,
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
      lab("tpT", ev.tp, "TP " + fmtL(ev.tp), COLORS.tp);
      items.push(ray("slL", lastSigIdx, ev.sl, COLORS.sl, 2, 2));
      lab("slT", ev.sl, "SL " + fmtL(ev.sl), COLORS.sl);
    }

    // ---- fib retracements of the CURRENT session leg (UNTESTED aid) ----
    // Assists entries as CONFLUENCE only -- like HTF alignment, it never
    // gates a graded machine. Leg direction follows which extreme is more
    // recent (low before high = up-leg, retrace measured down from the
    // high). Anchor-free level lines (v11 form); labels unstarred because
    // session extremes are exact at every timeframe (only profile-binned
    // levels earn the coarse-bin star).
    if (O.fibs) {
      const fx = this._fibx(out);
      if (fx && fx.hi > fx.lo) {
        const span = fx.hi - fx.lo;
        const upLeg = fx.hiT >= fx.loT;
        const ratios = [0.382, 0.5, 0.618, 0.786];
        for (let fi = 0; fi < ratios.length; fi++) {
          const r = ratios[fi];
          const pF = upLeg ? fx.hi - r * span : fx.lo + r * span;
          const near = out.prev && out.atr > 0 &&
            Math.abs(pF - out.prev.poc) < 0.15 * out.atr;
          lvl("fibL" + fi, pF, "#8A93A3", 1, 3);
          lab("fibT" + fi, pF,
            "FIB " + (r * 100).toFixed(1) + " " + fmt(pF) +
            (near ? "  ≈POC" : ""), "#8A93A3", FONT_XS);
        }
      }
    }

    // ---- v12: right-edge pinned LIVE-SESSION profile (HANDOFF_v12,
    // trader-approved, ADDITIVE) ----
    // Pinned to the pane's right edge via a grid-right container: the
    // VZO-proven combination for price-space rows with viewport-pinned
    // x. Every X coordinate/width in this family is PX -- it carries no
    // time information, so no prepend, re-index, minute-slot mapping or
    // duTime change can move it (duX is never called here). Y stays
    // price-space du(price), which the transform never touches -- the
    // rows must ride the shared price scale (open question 1: rows land
    // at true prices and CLIP when the viewport shows a narrow band;
    // compressing would fake the scale and slicing needs viewport data
    // the platform does not expose). Opaque by design: it sits in the
    // empty future grid with no candles to occlude (spec rationale).
    // edgeOffset (default 170px) seats it inboard of the trader's
    // VZOProfile_Customizable at 150px (open question 2). INSURANCE,
    // NOT A FIX: the daily-break AUTO flip still mis-places du-anchored
    // layers ~1h/day; deleting AUTO mode stays open pending the
    // 16:00-17:00 CT calib measurement.
    if (O.edge) {
      const devE = dev || this._devProfile(out);
      if (devE) {
        const KE = "edge" + out.dayStartTms;   // A8 rule: session-keyed
        const W = Math.max(20, O.edgeW);
        const offE = Math.max(0, O.edgeOff);
        const g = { main: [], va: [], poc: [] };
        for (const r of devE.rows) {
          if (!(r.frac > 0) || !(r.h > 0)) continue;
          const h = r.h * VIS.rowFill;
          const pLo = r.price - h / 2, pHi = r.price + h / 2;
          (r.isPoc ? g.poc : (r.inVA ? g.va : g.main)).push({
            tag: "Rectangle",
            position: { x: px(-offE),
              y: du(RECT_Y_ANCHOR === "bottom" ? pLo : pHi) },
            size: { width: px(-Math.max(2, Math.round(r.frac * W))),
              height: du(h) } });
        }
        const kids = [];
        if (g.main.length) kids.push({ tag: "Shapes", key: KE + "M",
          global: true, primitives: g.main, fillStyle: { color: COLORS.profile } });
        if (g.va.length) kids.push({ tag: "Shapes", key: KE + "V",
          global: true, primitives: g.va, fillStyle: { color: COLORS.profileVA } });
        if (g.poc.length) kids.push({ tag: "Shapes", key: KE + "P",
          global: true, primitives: g.poc, fillStyle: { color: COLORS.dev } });
        // key rows carry their prices (dev.rows keep only display
        // fractions by design, so per-row volume text is not available
        // without computing a second profile -- which the spec forbids);
        // leftMiddle extends the text LEFT of its point, into the empty
        // grid beside the row tips
        const eTxt = (sfx, price, txt2) => kids.push({ tag: "Text",
          key: KE + sfx, global: true,
          point: { x: px(-(offE + W + 4)), y: du(price) },
          text: txt2, style: { fontSize: 10, fontWeight: "bold", fill: "#FFFFFF" },
          textAlignment: "leftMiddle" });
        eTxt("TH", devE.vah, "VAH " + fmtL(devE.vah));
        eTxt("TP", devE.poc, "POC " + fmtL(devE.poc));
        eTxt("TL", devE.val, "VAL " + fmtL(devE.val));
        items.push({ tag: "Container", key: KE, global: true,
          origin: { cs: "grid", h: "right", v: "top" }, children: kids });
      }
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
        primitives: [duMode
          ? slotRect(DU_T(x0), Math.max(10, Math.round((i - x0) / 3)), pLo, pHi)
          : pxrect(x0, 80, pLo, pHi)],
        fillStyle: { color: COLORS.test } });
      items.push(frameTxt("alnT", 70, O.diag ? 90 : 72,
        "ALIGN TEST: white POC ray must bisect the magenta row. Row ABOVE ray => set RECT_Y_ANCHOR='top'",
        COLORS.test, FONT_SM));
    }

    // finalize the plotter payload: priority order (dev, sessions,
    // ACCUM, HTF mirror) so budget exhaustion degrades the tail first;
    // sessions keep publish order (oldest..newest) within their tier
    if (this._plotProfiles.length)
      this._plotProfiles.sort((a, b) => (a.pri || 0) - (b.pri || 0));
    else this._plotProfiles = null;

    // ---- right-edge labels, de-collided ----
    // At coarse timeframes the viewport shows weeks, so labels many
    // points apart still overlap on screen: widen the cluster pitch with
    // an HTF-span term (section 7's ACCUM/NPOC collision at 30M).
    // 0.12 tuned against the section-8 30M frame: the ACCUM label sat in
    // a cluster adjacent to the dPOC/PREV POC fan and their fans touched;
    // the wider pitch merges that neighborhood into ONE fan
    const coarseEps = (this.barMin >= 15 && out.htf)
      ? (out.htf.vah - out.htf.val) * 0.12 : 0;
    items.push(...layoutLabels(labels, lx, out.atr || 0, false, coarseEps));

    // ---- emitted-geometry invariant (field report section 6) ----
    // Final guard on the GEOMETRY ACTUALLY EMITTED, independent of where
    // any x came from: no chart-space rectangle or line may extend beyond
    // the live bar (+2 bars of slack for the zone/ray base segments).
    // Whatever produces an out-of-space coordinate -- a unit confusion, a
    // stale frame, a path an audit missed -- the item is dropped here and
    // NAMED on the banner instead of painting the future grid. Text is
    // exempt (the label column at i+4 is the designed exception).
    const xCap = i + 2;
    // MAX_ROW_SLOTS (spec section 7): no filled rect is ever legitimately
    // wider than a full 1-minute session's fill (~1,173 slots) plus
    // margin -- the 30M slab class (a gauge row stretched across a
    // weekend by a unit mixup) is caught here whatever produces it.
    const MAX_ROW_SLOTS = 1500;
    const oversize = new Set();
    for (let n2 = items.length - 1; n2 >= 0; n2--) {
      const it = items[n2];
      let bad = false, tooWide = false;
      if (it.tag === "Shapes") {
        for (const pr of it.primitives) {
          const x = pr.position.x;
          if (x.unit !== "du") continue;
          if (x.v > xCap ||
              (pr.size.width.unit === "du" && x.v + pr.size.width.v > xCap))
            bad = true;
          if (pr.size.width.unit === "du" && pr.size.width.v > MAX_ROW_SLOTS)
            tooWide = true;
        }
      } else if (it.tag === "LineSegments") {
        for (const ln of it.lines)
          for (const p2 of [ln.a, ln.b])
            if (p2.x.unit === "du" && p2.x.v > xCap) bad = true;
      }
      if (bad || tooWide) {
        if (tooWide) oversize.add(it.key);
        else futureKeys.add(it.key);
        items.splice(n2, 1);
      }
    }
    if (oversize.size) this._oversizeKeys = [...oversize].sort();
    else this._oversizeKeys = null;

    // ---- du-axis calibration probe (field report section 9) ----
    // Construction-truth telemetry proved every emitted structure sits at
    // sane bar indexes, yet the live render crosses the future grid: the
    // remaining variable is the platform's du->pixel mapping under
    // weekend-gap + pre-gridded-future conditions. These probes are thin
    // labeled verticals at KNOWN du values -- one screenshot maps the
    // empirical function. Each label rides its own line, so wherever the
    // platform paints the line, the label names the du it was given.
    // Emitted AFTER the future-grid scan on purpose: the i+60/i+300
    // probes must reach into the future grid to measure it -- probes are
    // the sanctioned exception to the guard. Probe first, transform
    // second: no coordinate transforms are applied anywhere in this
    // version.
    if (O.calib) {
      const cNow = d.close();
      const half = (out.atr || 0) > 0 ? 5 * out.atr : cNow * 0.02;
      const probes = [
        ["i", i], ["i-100", i - 100], ["i-500", i - 500],
        ["i-1000", i - 1000], ["i-2000", i - 2000], ["0", 0],
        ["i+60", i + 60], ["i+300", i + 300],
      ];
      const seen = new Set();
      let pn = 0;
      for (const [nm, xv] of probes) {
        const xP = Math.max(0, xv);
        if (seen.has(xP)) continue;
        seen.add(xP);
        items.push(vline("calL" + nm, xP, cNow - half, cNow + half, COLORS.test, 1));
        // vertical stagger: when the mapping bunches lines together the
        // labels still read apart. In t-du mode the label also prints the
        // POST-transform slot so the before/after verification is a
        // direct reading (section 10: same probe, both sides).
        items.push(txt("calT" + nm, xP, cNow + half - pn * (half / 4),
          " du " + xP + " (" + nm + ")" +
          (tMode ? " slot " + Math.round(DU_T(xP)) : ""), COLORS.test, 0, FONT_SM));
        pn++;
      }
      // price-anchored reference (the y axis is proven): a horizontal ray
      // at the live close marks the live candle, so the du=i probe can be
      // judged against it directly
      items.push(ray("calC", 0, cNow, "#FFFFFF", 1, 2));
      items.push(txt("calCT", lx, cNow, "LIVE CLOSE " + fmt(cNow),
        "#FFFFFF", 30, FONT_SM));
    }

    // ---- status banner, pinned to the viewport (fixed line slots) ----
    // Emitted LAST so every anchor-health flag raised during the item
    // builds above is reflected in THIS frame (frame-pinned text renders
    // at its px coords regardless of array position; being last also
    // keeps the banner on top).
    items.push(frameTxt("stat1", 70, 18,
      "TraderMachell  |  " + (out.status || ""), COLORS.status));
    if (out.prev)
      items.push(frameTxt("stat2", 70, 36,
        "PREV  POC " + fmt(out.prev.poc) + "   VAH " + fmt(out.prev.vah) +
        "   VAL " + fmt(out.prev.val) +
        (out.htf ? "      HTF POC " + fmt(out.htf.poc)
          // measured decision (docs/VISUAL_V9_3_ONE_MINUTE.md): a composite
          // from the ~2 sessions loadable at 1M misstates the 20-session
          // levels by a median ~90-150 pts -- never synthesize it; say
          // exactly what is missing and where to read it instead
          : "      HTF: n/a - " + this.core.sessions.length +
            "/5 sessions loadable here (read HTF on 30M)"),
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
      ctx.push("CAUTION: " + this.barMin + "-min bars - grades measured on 1-min; * marks " +
        this.barMin + "-min-bin levels");
    if (this.barMin > 30)
      ctx.push("UNSUPPORTED TIMEFRAME - use 1M-30M (1M = graded basis)");
    if (this._resetLoop) ctx.push("[reset loop - press F5]");
    else if (this._tfReset) {
      if (this.tmsList.length > 50) this._tfReset = false;
      else ctx.push("[timeframe changed - reloading]");
    }
    if (!x0Ok) ctx.push("[anchor unresolved - profiles hidden]");
    if (this._overshoot) ctx.push("[anchor overshoot]");
    if (mism.size) ctx.push("[anchor mismatch: " + [...mism].sort().join(",") + "]");
    if (futureKeys.size)
      ctx.push("[future-grid item: " + [...futureKeys].sort().join(",") + "]");
    if (this._oversizeKeys)
      ctx.push("[oversize item: " + this._oversizeKeys.join(",") + "]");
    if (offscreen) ctx.push("[old anchors offscreen - load more bars]");
    if (this._desync) ctx.push("[mirror desync]");
    if (O.calib) ctx.push("CALIB ACTIVE - each magenta line must stand on its bar");
    // delta-proxy disclosure (registry section 4: grades were measured on
    // up/down 1-min volume; live delta is the platform's bid/ask split,
    // corr 0.87 -- this caveat must stay on the banner)
    ctx.push("delta=bid/ask proxy (graded on up/down)");
    // effective modes, always visible: [t-du] = minute-slot emission
    // active (live axis), [du] = bar-index emission, [px] = px widths
    ctx.push(duMode ? (tMode ? "[t-du]" : "[du]") : "[px]");
    items.push(frameTxt("stat3", 70, 54, ctx.join("   |   "),
      out.confluence ? COLORS.conflu : (this.barMin !== 1 ? COLORS.warn : COLORS.dim),
      FONT_SM));
    // prop-delivery diagnostics (field report: instrument, don't assume)
    if (O.diag) {
      const p = this.props || {};
      const dump = ["htfSessions", "scaledWidths", "devProfile", "nodes",
        "vaFill", "vaFillColor", "vaFillOpacity", "showHistory", "alignTest",
        "diag", "calib"]
        .map(k => k + "=" + (typeof p[k]) + ":" + String(p[k])).join("  ");
      // anchor state FIRST: it is the load-bearing diagnostic and the props
      // dump is long enough to clip off the right edge of the viewport
      // (learned live 2026-08-09). i/gap/desync pin down the live
      // chart-index space so a displacement can be measured remotely.
      // acc=<start>..<end> in bars-back-from-now ("pre" = older than the
      // loaded history): separates "wrong anchor for an old window" from
      // "the engine detected a recent window" in one reading
      const age = t => {
        const r = this._tailRef(t, endIdx);
        return r === undefined
          ? (this.tmsList.length && t < this.tmsList[0] ? "pre" : "?")
          : String(endIdx - r);
      };
      // emit=: the du x actually EMITTED for the ACCUM box/ray and the
      // first session profile ("-" = item not drawn this frame), recorded
      // at CONSTRUCTION time in plain numbers. (v6.4 introspected the
      // platform's du() objects here, which are opaque on live -- the
      // "@undefined" readings in field report section 7 meant "cannot
      // introspect", NOT "suppressed". Fixed.)
      // tf= settles elementSize semantics per timeframe in one screenshot
      // (TIMEFRAME_ANCHORING_SPEC.md section 1.2)
      const cd4 = this.chartDescription;
      items.push(frameTxt("stat4", 70, 72,
        "tf=" + (cd4 ? cd4.underlyingType + "/" + cd4.elementSize : "none") +
        " barMin=" + this.barMin +
        " bidx=" + (typeof d.index === "function" ? d.index() : "-") +
        " rst=" + ((this._resetTimes && this._resetTimes.length) || 0) +
        (this._staleCd ? " staleCd=" + this._staleCd : "") +
        " anchor=" + (x0Ok ? "ok@" + x0 : "MISS") +
        " i=" + i + " base=" + this.idxBase + " mirror=" + this.tmsList.length +
        " gap=" + (this.mirrorGapped ? 1 : 0) +
        " desync=" + (this._desync ? 1 : 0) +
        (out.accum ? " acc=" + age(out.accum.start) + ".." + age(out.accum.end) : "") +
        " emit accB@" + emits.accB + " accL@" + emits.accL + " sp@" + emits.sp +
        " hpro@" + emits.hpro + " apro@" + emits.apro +
        (tMode ? " tdu origin=" + originTs + "+" + O.originShift + "m" : "") +
        "   props: " + dump,
        COLORS.dim, FONT_SM));
    }
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
    // ---- VA band (live-verified 2026-08-10: real alpha compositing;
    // production opacity 14, diagnostic probe 80) ----
    if (pBool(props.vaFill, false)) {
      const color = (typeof props.vaFillColor === "string" && props.vaFillColor)
        ? props.vaFillColor : "#3E7E93";
      let opac = Number(props.vaFillOpacity);
      if (!Number.isFinite(opac)) opac = 14;
      opac = Math.max(0, Math.min(100, opac)) / 100;
      if (opac > 0) {
        // cap the walk: one drawLine per bar over a deep-loaded 110k-bar
        // history would hammer every repaint
        const first = Math.max(0, history.data.length - 20000);
        for (let i = first; i < history.data.length; i++) {
          const item = history.get(i);
          if (!item || item.vaLo === undefined || item.vaHi === undefined) continue;
          const x = plt.x.get(item);
          canvas.drawLine(plt.offset(x, item.vaLo), plt.offset(x, item.vaHi),
            { color, relativeWidth: 1, opacity: opac });
        }
      }
    }
    // ---- translucent profile ROWS (v10: the current-session profile
    // moves off the opaque Shapes path so it stops hiding the candles it
    // sits on). buildItems publishes the frame's row set + anchor/width
    // in CHART-INDEX space -- the plotter's x comes from the platform's
    // own per-bar plot coordinates, so the minute-slot question never
    // arises on this path. Drawn as one bar-wide vertical strip per
    // column per contiguous same-color row run (the community zone
    // technique), with a stroke budget. ----
    const profiles = instance._plotProfiles;
    if (profiles && profiles.length && pBool(props.rowsPlot, true)) {
      let rOp = Number(props.rowOpacity);
      if (!Number.isFinite(rOp)) rOp = 20;
      rOp = Math.max(0, Math.min(100, rOp)) / 100;
      if (rOp <= 0) return;
      // one budget across all profiles; publishers order the list by
      // importance (dev, sessions newest-first, ACCUM, HTF mirror) so
      // exhaustion degrades the least-important layer first
      let budget = 12000;
      for (const PR of profiles) {
        if (budget <= 0) break;
        // per-family emphasis: rowOpacity x the payload's multiplier
        const opEff = Math.max(0.01, Math.min(1, rOp * (PR.opMul || 1)));
        const dir = PR.dir || 1;
        const jFrom = dir > 0 ? PR.anchor : Math.max(0, PR.anchor - PR.w);
        const jTo = dir > 0
          ? Math.min(PR.anchor + PR.w, history.data.length - 1)
          : Math.min(PR.anchor, history.data.length - 1);
        for (let j = jFrom; j <= jTo && budget > 0; j++) {
          const item = history.get(j);
          if (!item) continue;
          const x = plt.x.get(item);
          const d = dir > 0 ? j - PR.anchor : PR.anchor - j;
          // merge consecutive covered rows of the same color into strips
          let runLo = null, runHi = null, runColor = null;
          for (let r = 0; r <= PR.rows.length; r++) {
            const row = PR.rows[r];
            const covered = !!row && (row.frac * PR.w) > d && row.h > 0;
            const col = covered ? row.color : null;
            if (covered && col === runColor) {
              runHi = row.price + (row.h * 0.5);
              continue;
            }
            if (runColor !== null && budget > 0) {
              canvas.drawLine(plt.offset(x, runLo), plt.offset(x, runHi),
                { color: runColor, relativeWidth: 1, opacity: opEff });
              budget--;
            }
            runColor = col;
            if (covered) {
              runLo = row.price - (row.h * 0.5);
              runHi = row.price + (row.h * 0.5);
            }
          }
        }
      }
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
    vaFillOpacity: predef.paramSpecs.number(14, 1, 0),// band opacity 0..100 (14 = trader-calibrated live; 80 = "is it drawing at all?" probe)
    rowsPlot: predef.paramSpecs.number(1, 1, 0),      // 1 = developing rows translucent via plotter, day-wide (v10); 0 = v9.3 opaque 150-bar rows
    edgeProfile: predef.paramSpecs.number(1, 1, 0),   // 1 = right-edge pinned live-session profile (v12, time-axis-free)
    fibs: predef.paramSpecs.number(1, 1, 0),          // 1 = session-leg fib retracements (UNTESTED aid, info only)
    edgeWidth: predef.paramSpecs.number(140, 10, 20), // edge profile max row width, px
    edgeOffset: predef.paramSpecs.number(170, 10, 0), // px inboard from the pane edge (sits left of the community VZO at 150)
    rowOpacity: predef.paramSpecs.number(20, 1, 0),   // row opacity 0..100 (first guess -- calibrate live like the band)
    showHistory: predef.paramSpecs.number(0, 1, 0),   // 1 = label signals from prior sessions
    alignTest: predef.paramSpecs.number(0, 1, 0),     // 1 = Rectangle y-anchor self-test row
    diag: predef.paramSpecs.number(0, 1, 0),          // 1 = show raw prop delivery on the banner
    calib: predef.paramSpecs.number(0, 1, 0),         // 1 = du-axis calibration probe (one screenshot maps du->pixel)
    duTime: predef.paramSpecs.number(2, 1, 0),        // du emission: 0 = bar-index, 1 = minute-slots, 2 = auto (live only)
    originShift: predef.paramSpecs.number(0, 1),      // minutes added to the layout origin (live calibration)
  },
};

// plotter registration is the one construct Node cannot prove against the
// live platform -- register conditionally so a missing/renamed plotters
// API degrades to "no vaFill layer" instead of "no indicator at all"
if (plt && predef.plotters && typeof predef.plotters.custom === "function") {
  module.exports.plotter = [predef.plotters.custom(vaFillPlotter)];
}
