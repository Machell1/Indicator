/*
 * wrapper.js -- the Tradovate custom-indicator shell around DaleCore.
 * NOT used directly: build.js splices dale_core.js + this file into
 * TraderMachell.js (the single module you paste into Tradovate's
 * Indicator Editor).
 *
 * VISUAL SUITE v4 -- field fixes from the 2026-08-09 live session
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
    this.lastPushedMs = 0;
    this.lastOut = null;
    this.marks = [];              // {tMs, price, day, ev} -- NO indexes stored:
    // the chart PREPENDS bars when older history loads, shifting every
    // absolute index; anchors are resolved from timestamps at draw time
    this.tmsList = [];            // pushed-bar timestamps, in order -- our
    // own mirror of the chart's tail, used to turn timestamps into indexes
    // by offset-from-the-end (immune to prepends AND to platform history
    // indexing quirks)
  }

  // effective options, re-derived EVERY draw from coerced props (field
  // report requirement: never trust platform prop types or delivery; the
  // defaults here are what actually runs when a prop never arrives)
  _opts() {
    const p = this.props || {};
    return {
      duMode: pBool(p.scaledWidths, true),   // du widths live-proven 2026-08-09
      history: pBool(p.showHistory, false),
      alignTest: pBool(p.alignTest, false),
      diag: pBool(p.diag, false),
    };
  }

  _pushEntity(e) {
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
    if (this.tmsList.length > 12000) this.tmsList.splice(0, 2000);
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
    if (history && typeof history.get === "function" && i > 0) {
      let k = i - 1, backlog = [];
      while (k >= 0 && backlog.length < 500) {
        const e = history.get(k);
        if (!e || typeof e.timestamp !== "function") break;
        if (e.timestamp().getTime() <= this.lastPushedMs) break;
        backlog.push(e);
        k--;
      }
      for (let b = backlog.length - 1; b >= 0; b--)
        this._pushEntity(backlog[b]);
    }
    const complete = typeof d.isComplete === "function" ? d.isComplete() : !d.isLast();
    if (complete) this._pushEntity(d);

    if (!d.isLast()) return {};
    return { graphics: { items: this.buildItems(d, i, history) } };
  }

  // resolve a bar-start timestamp to its CURRENT chart index. The pushed
  // bars are exactly the chart's TAIL (one per closed chart bar, in
  // order), so a timestamp's offset from the end of tmsList equals its
  // offset from the end of the chart -- valid regardless of how many old
  // bars the chart prepends, and using no platform history APIs at all.
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
      res = (L[lo] === tMs) ? endIdx - (L.length - 1 - lo) : undefined;
      if (res !== undefined && res < 0) res = undefined;
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
    const idx = t => this._idxOf(t, endIdx, tcache);
    let x0 = idx(out.dayStartTms);
    if (x0 === undefined) x0 = Math.max(0, i - 60);
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
      const dump = ["htfSessions", "scaledWidths", "showHistory", "alignTest", "diag"]
        .map(k => k + "=" + (typeof p[k]) + ":" + String(p[k])).join("  ");
      items.push(frameTxt("stat4", 70, 72, "props: " + dump, COLORS.dim, FONT_SM));
    }

    // ---- session start marker (verifies the time anchor at a glance) ----
    if (out.prevProf && out.prevProf.length) {
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
    if (out.prev && i > x0)
      items.push(box("vaZ", x0, i + 1, out.prev.vah, out.prev.val, COLORS.vaZone, 3));

    // ---- HTF composite (dark gold ghost, true mirror: grows LEFT) ----
    // px fallback cannot mirror left (negative widths are unproven), so the
    // ghost is du-mode only; rays + labels always draw.
    if (duMode && out.htfRows && x0 > 2) {
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

    // ---- PREV-SESSION volume profile (teal, grows right from day start) ----
    if (out.prevProf) {
      items.push(...histogram("ppro", out.prevProf, x0, 1,
        COLORS.profile, COLORS.profileVA, COLORS.pocRow,
        duMode ? this.wPrev : VIS.prevMaxPx, duMode));
    }
    if (out.prev) {
      const thin = out.prev.liquid ? "" : "  [THIN - no signals]";
      items.push(ray("pocL", x0, out.prev.poc, COLORS.poc, 3, 1));
      lab("pocT", out.prev.poc, "PREV POC " + fmt(out.prev.poc) + thin, COLORS.poc);
      items.push(ray("vahL", x0, out.prev.vah, COLORS.va, 1, 3));
      lab("vahT", out.prev.vah, "VAH " + fmt(out.prev.vah), COLORS.va, FONT_SM);
      items.push(ray("valL", x0, out.prev.val, COLORS.va, 1, 3));
      lab("valT", out.prev.val, "VAL " + fmt(out.prev.val), COLORS.va, FONT_SM);
    }

    // ---- naked POC rays (Dale's signature: red, extended until tested) ----
    if (out.nakedPocs) {
      for (let n = 0; n < out.nakedPocs.length; n++) {
        const np = out.nakedPocs[n];
        if (out.prev && Math.abs(np.poc - out.prev.poc) < 1e-9) continue; // white ray owns it
        const ix = idx(np.endTms);
        // keyed by session end time, not list position: entries shift as
        // rays get tested, and positional keys would swap identities
        items.push(ray("nk" + np.endTms, ix !== undefined ? ix : Math.max(0, x0 - 200),
          np.poc, COLORS.naked, 1, 1));
        lab("nkT" + np.endTms, np.poc, "NPOC " + fmt(np.poc), COLORS.nakedTxt, FONT_SM);
      }
    }

    if (out.htf) {
      items.push(ray("hpocL", Math.max(0, x0 - 40), out.htf.poc, COLORS.htf, 3, 1));
      lab("hpocT", out.htf.poc,
        "HTF POC " + fmt(out.htf.poc) + " (" + out.htf.sessions + "s)", COLORS.htf);
      items.push(ray("hvahL", Math.max(0, x0 - 40), out.htf.vah, COLORS.htf, 1, 4));
      lab("hvahT", out.htf.vah, "HTF VAH " + fmt(out.htf.vah), COLORS.htf, FONT_SM);
      items.push(ray("hvalL", Math.max(0, x0 - 40), out.htf.val, COLORS.htf, 1, 4));
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
      items.push(ray("accL", ia !== undefined ? ia : x0, out.accum.level, COLORS.accum, 2, 1));
      lab("accT", out.accum.level,
        "ACCUM " + fmt(out.accum.level) +
        (out.accum.short ? "  SELL retest" : "  BUY retest") +
        "  [+0.28R/75% n12]", COLORS.accum);
    }

    // ---- LEG cluster ----
    if (out.leg) {
      items.push(ray("legL", x0, out.leg.level, COLORS.leg, 1, 1));
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
    if (O.alignTest && out.prev && out.prevProf && out.prevProf.length) {
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
    showHistory: predef.paramSpecs.number(0, 1, 0),   // 1 = label signals from prior sessions
    alignTest: predef.paramSpecs.number(0, 1, 0),     // 1 = Rectangle y-anchor self-test row
    diag: predef.paramSpecs.number(0, 1, 0),          // 1 = show raw prop delivery on the banner
  },
};
