/*
 * wrapper.js -- the Tradovate custom-indicator shell around DaleCore.
 * NOT used directly: build.js splices dale_core.js + this file into
 * TraderMachell.js (the single module you paste into Tradovate's
 * Indicator Editor).
 *
 * VISUAL SUITE (v3 -- alignment + legibility overhaul, modeled on Trader
 * Dale's software look):
 *  - PREV-SESSION VOLUME PROFILE: teal horizontal histogram growing right
 *    from the session start; rows sit exactly on their price span (the
 *    exact row pitch carried by the core is used -- no re-estimation);
 *    value-area rows brighter; POC row gold; whisper-alpha VALUE-AREA BAND
 *    from VAL to VAH across the session so value reads at a glance.
 *  - HTF COMPOSITE PROFILE: dark-gold ghost histogram growing LEFT from
 *    the session start (true mirror -- left-anchored positive-width rects,
 *    never negative widths), + thick POC ray, dashed VAH/VAL.
 *  - ZOOM-SCALING WIDTHS: histogram rows are sized in du (bar-index)
 *    units by default so profiles scale with the chart like the reference
 *    software. `scaledWidths=false` falls back to the px-width mode that
 *    is empirically PROVEN to render (see fallback notes below).
 *  - RIGHT-EDGE LABEL COLUMN: labels extend RIGHT of the last bar into
 *    empty margin (rightMiddle -- the platform's leftMiddle extends text
 *    LEFT, over the candles: that was v2's biggest legibility bug), and
 *    run through a de-collision pass that stacks labels of nearby levels
 *    at a fixed pixel pitch so they can never sit on each other.
 *  - ACCUM rotation: gold box outline + gold histogram + level ray.
 *  - LEG cluster ray (untested tag).
 *  - MARKS with noise control: absorption/flow-quit stamps only for the
 *    CURRENT session; older signals shrink to bare arrows (set
 *    showHistory=true to label them again). Evidence tags are verbatim.
 *  - SESSION START marker: subtle dashed vertical line at the day anchor,
 *    so a wrong time anchor is visible immediately.
 *  - ALIGNMENT SELF-TEST (alignTest=true): draws a magenta test row
 *    centered on PREV POC through the same code path as every histogram
 *    row. The white POC ray must bisect it. If the row sits entirely
 *    ABOVE the ray, the platform's Rectangle y-anchor is top-left: set
 *    RECT_Y_ANCHOR to "top" below (one line) and every row is fixed.
 *  - STATUS BANNER pinned to the viewport top-left (always visible),
 *    fixed line slots (no jumping), second line of key level numbers.
 *
 * Platform facts (verified): graphics via map() return on d.isLast();
 * LineSegments (+infiniteEnd rays), Text (needs fontSize+fill), du/px/op
 * coordinate helpers, origin{cs:'frame'} pins to viewport; leftMiddle
 * extends text LEFT of the point, rightMiddle extends RIGHT; mixed-unit
 * op() on the X axis of Line endpoints does not render; lineStyle.opacity
 * kills the group (alpha lives inside rgba strings); graphics do not
 * stretch autoscale; intra-bar state rolls back to last closed bar, so
 * bars are committed once via the lastPushedMs guard + history walk-back
 * (correct under both candidate live-engine models).
 */

/* __CORE_SPLICE__ */

const predef = require("./tools/predef");
const meta = require("./tools/meta");
const { px, du, op } = require("./tools/graphics");

// ---- render configuration ------------------------------------------------
// RECT_Y_ANCHOR: which edge of a Rectangle `position.y` names. "bottom"
// matches the one community indicator proven to render (it passes
// priceTop - binSize). If the alignTest row draws ABOVE its ray, the
// platform is top-anchored: flip this to "top". Single source of truth --
// every rectangle in the file goes through vrect()/hrect().
const RECT_Y_ANCHOR = "bottom";
const VIS = {
  rowFill: 0.92,        // row height as fraction of its pitch (hairline gap)
  minRowBars: 0.35,     // du mode: shortest visible row, in bar widths
  minRowPx: 3,          // px mode: shortest visible row, in pixels
  prevMaxBars: 180,     // du mode: longest prev-profile row (1-min bars)
  htfMaxBars: 150,      // du mode: longest HTF ghost row
  sessMaxBars: 110,     // du mode: longest per-session row
  accMaxBars: 110,      // du mode: longest ACCUM row (also capped by box)
  prevMaxPx: 160,       // px fallback widths (the v2 proven values)
  sessMaxPx: 110,
  accMaxPx: 90,
  labelGapPx: 15,       // de-collision stack pitch
  clusterATR: 0.25,     // labels closer than this (in ATR) share a stack
};

const COLORS = {
  profile: "rgba(64,158,186,0.26)",     // teal tails (Dale's look)
  profileVA: "rgba(96,204,236,0.50)",   // brighter inside the value area
  pocRow: "rgba(255,203,54,0.95)",      // gold POC row
  vaBand: "rgba(96,204,236,0.07)",      // whisper value-area band
  sess: "rgba(122,134,170,0.18)",       // historical sessions: muted slate
  sessVA: "rgba(152,164,205,0.32)",
  sessPoc: "rgba(206,213,240,0.72)",
  htfGhost: "rgba(201,150,43,0.22)",    // HTF mirror rows
  htfPocRow: "rgba(201,150,43,0.70)",
  poc: "#FFFFFF", va: "#62A8E8",
  htf: "#C9962B", accum: "#FFD54F", leg: "#26C6DA",
  naked: "#E53935", nakedTxt: "#EF9A9A",
  buy: "#00C853", sell: "#FF5252", tp: "#00C853", sl: "#FF5252",
  absorb: "#FFA500", conflu: "#FF8C00", warn: "#FFA500",
  status: "#E0E0E0", dim: "#9E9E9E",
  dayLine: "rgba(158,158,158,0.45)",
  test: "rgba(255,0,255,0.55)",
};
const FONT = { fontSize: 13, fontWeight: "bold" };
const FONT_SM = { fontSize: 11, fontWeight: "bold" };

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
// Shapes->Rectangle rows, the pattern PROVEN to render (Rectangle
// primitives, du heights, alpha baked into rgba colors, global:true under
// isLast()). Each row uses the EXACT pitch carried by the core (r.h) --
// never an estimate -- so rows tile the profile's true price span.
//   duMode=true : widths in bar units (scale with zoom); dir=-1 mirrors
//                 LEFT via left-anchored positive-width rects.
//   duMode=false: px widths (v2 proven mode); leftward growth is NOT
//                 expressible without negative widths (unproven), so
//                 dir=-1 callers must skip in px mode.
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
function box(key, xA, xB, hi, lo, color) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [
      { tag: "Line", a: { x: du(xA), y: du(hi) }, b: { x: du(xB), y: du(hi) } },
      { tag: "Line", a: { x: du(xA), y: du(lo) }, b: { x: du(xB), y: du(lo) } },
      { tag: "Line", a: { x: du(xA), y: du(hi) }, b: { x: du(xA), y: du(lo) } },
      { tag: "Line", a: { x: du(xB), y: du(hi) }, b: { x: du(xB), y: du(lo) } },
    ],
    lineStyle: { lineWidth: 1, color, lineStyle: 3 },
  };
}

// ---- right-edge label column with de-collision -----------------------------
// Collect {key, price, text, color, font} entries, then lay them out top to
// bottom. Labels whose prices sit within clusterATR of each other are drawn
// as one stack fanned around the cluster midpoint at a fixed pixel pitch,
// ordered by price -- close levels can never overprint each other.
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
      htfSessions: (this.props && this.props.htfSessions) || 20,
    });
    const p = this.props || {};
    this.optScaled = p.scaledWidths === undefined ? true : !!p.scaledWidths;
    this.optAlignTest = !!p.alignTest;
    this.optHistory = !!p.showHistory;
    // du-mode row caps, rescaled so a "row bar-width" tracks real time when
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
    const duMode = this.optScaled;
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
    if (ctx.length)
      items.push(frameTxt("stat3", 70, 54, ctx.join("   |   "),
        out.confluence ? COLORS.conflu : (this.barMin !== 1 ? COLORS.warn : COLORS.htf),
        FONT_SM));

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

    // ---- value-area band (VAL..VAH, whisper alpha, du mode only) ----
    if (duMode && out.prev && i > x0) {
      items.push({ tag: "Shapes", key: "vaB", global: true,
        primitives: [vrect(x0, (i - x0) + 2, out.prev.val, out.prev.vah)],
        fillStyle: { color: COLORS.vaBand } });
    }

    // ---- HTF composite (dark gold ghost, true mirror: grows LEFT) ----
    // px fallback cannot mirror left (negative widths are unproven), so the
    // ghost is du-mode only; rays + labels always draw.
    if (duMode && out.htfRows && x0 > 2) {
      items.push(...histogram("hpro", out.htfRows, x0, -1,
        COLORS.htfGhost, COLORS.htfGhost, COLORS.htfPocRow, this.wHtf, true));
    }

    // ---- per-session profiles (MarketProfile-style: one histogram per
    // day, anchored at each session's own start -- the MT5 look) ----
    if (out.sessionProfiles) {
      for (let s = 0; s < out.sessionProfiles.length; s++) {
        const sp = out.sessionProfiles[s];
        const six = idx(sp.start);
        if (six === undefined) continue;
        items.push(...histogram("sp" + s, sp.rows, six, 1,
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

    // ---- ACCUM rotation: box + gold histogram + level ray ----
    if (out.accum) {
      const ia = idx(out.accum.start);
      const ib = idx(out.accum.end);
      if (ia !== undefined && ib !== undefined && out.accum.winHi) {
        items.push(box("accB", ia, ib, out.accum.winHi, out.accum.winLo, COLORS.accum));
        if (out.accum.rows) {
          const wCap = duMode ? Math.min(this.wAcc, Math.max(10, ib - ia)) : VIS.accMaxPx;
          items.push(...histogram("apro", out.accum.rows, ia, 1,
            "rgba(255,213,79,0.28)", "rgba(255,213,79,0.28)",
            "rgba(255,255,255,0.85)", wCap, duMode));
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
    // arrows (showHistory=true restores short labels); absorption and
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
      else if (this.optHistory)
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
    if (this.optAlignTest && out.prev && out.prevProf && out.prevProf.length) {
      const h = out.prevProf[0].h || 0.5;
      const pLo = out.prev.poc - h / 2, pHi = out.prev.poc + h / 2;
      items.push({ tag: "Shapes", key: "alnR", global: true,
        primitives: [duMode ? vrect(x0, Math.max(10, Math.round((i - x0) / 3)), pLo, pHi)
          : pxrect(x0, 80, pLo, pHi)],
        fillStyle: { color: COLORS.test } });
      items.push(frameTxt("alnT", 70, 72,
        "ALIGN TEST: white POC ray must bisect the magenta row. Row ABOVE ray => set RECT_Y_ANCHOR='top'",
        COLORS.test, FONT_SM));
    }

    // ---- right-edge labels, de-collided ----
    items.push(...layoutLabels(labels, lx, out.atr || 0));
    return items;
  }

  filter() { return true; }
}

// paramSpecs.bool is not in the verified platform-facts list; degrade to a
// 0/1 number spec if this build of the platform lacks it.
const boolSpec = (predef.paramSpecs && typeof predef.paramSpecs.bool === "function")
  ? predef.paramSpecs.bool
  : (dflt) => predef.paramSpecs.number(dflt ? 1 : 0, 1, 0);

module.exports = {
  name: "traderMachell",
  description: "TraderMachell - Dale volume-profile model (tested grades)",
  calculator: traderMachell,
  inputType: meta.InputType.BARS,
  areaChoice: meta.AreaChoice.OVERLAY,
  tags: ["TraderMachell"],
  params: {
    htfSessions: predef.paramSpecs.period(20),
    scaledWidths: boolSpec(true),   // du-width rows (scale with zoom); off = proven px mode
    showHistory: boolSpec(false),   // label signals from prior sessions
    alignTest: boolSpec(false),     // one-time Rectangle y-anchor self-test
  },
};
