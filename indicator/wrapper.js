/*
 * wrapper.js -- the Tradovate custom-indicator shell around DaleCore.
 * NOT used directly: build.js splices dale_core.js + this file into
 * TraderMachell.js (the single module you paste into Tradovate's
 * Indicator Editor).
 *
 * VISUAL SUITE (v2, modeled on Trader Dale's software look):
 *  - PREV-SESSION VOLUME PROFILE: teal horizontal histogram growing right
 *    from the session start; value-area rows brighter; POC row gold+longer.
 *  - HTF COMPOSITE PROFILE: dark-gold ghost histogram growing LEFT from
 *    the session start (mirror side), + thick POC ray, dashed VAH/VAL.
 *  - Level rays with big bold right-edge labels.
 *  - ACCUM rotation: gold box outline + gold histogram + level ray.
 *  - LEG cluster ray (untested tag).
 *  - ABSORPTION: orange markers on churn bars at the level, live and
 *    historical; initiative fire = signal arrow + SL/TP rays.
 *  - STATUS BANNER pinned to the viewport top-left (always visible),
 *    with a second line of key level numbers.
 *
 * Platform facts (verified): graphics via map() return on d.isLast();
 * LineSegments (+infiniteEnd rays), Text (needs fontSize+fill), du/px/op
 * coordinate helpers, origin{cs:'frame'} pins to viewport; graphics do
 * not stretch autoscale; intra-bar state rolls back to last closed bar,
 * so bars are committed once via the lastPushedMs guard + history
 * walk-back (correct under both candidate live-engine models).
 */

/* __CORE_SPLICE__ */

const predef = require("./tools/predef");
const meta = require("./tools/meta");
const { px, du, op } = require("./tools/graphics");

const COLORS = {
  profile: "rgba(79,168,194,0.35)",    // teal rows (Dale's flexible-profile look)
  profileVA: "rgba(111,208,232,0.55)", // brighter inside the value area
  pocRow: "rgba(255,210,74,0.95)",     // gold POC row
  poc: "#FFFFFF", va: "#6FB6FF",
  htf: "#C9962B", accum: "#FFD700", leg: "#00E5FF",
  buy: "#00C853", sell: "#FF5252", tp: "#00C853", sl: "#FF5252",
  absorb: "#FFA500", conflu: "#FF8C00", warn: "#FFA500",
  status: "#E0E0E0", dim: "#9E9E9E",
};
const FONT = { fontSize: 13, fontWeight: "bold" };
const FONT_SM = { fontSize: 11, fontWeight: "bold" };
const PROFILE_BARS = 90;   // max histogram row length, in bar widths

function ray(key, x0, price, color, width, dash) {
  return {
    tag: "LineSegments", key, global: true,
    lines: [{ tag: "Line",
      a: { x: du(x0), y: du(price) }, b: { x: du(x0 + 1), y: du(price) },
      infiniteEnd: true }],
    lineStyle: { lineWidth: width, color, lineStyle: dash || 1 },
  };
}
function seg(x0, x1, price) {
  return { tag: "Line", a: { x: x0, y: du(price) }, b: { x: x1, y: du(price) } };
}
function txt(key, x, price, s, color, dyPx, font, align) {
  return {
    tag: "Text", key, global: true,
    point: { x: du(x), y: dyPx ? op(du(price), "-", px(dyPx)) : du(price) },
    text: s,
    style: Object.assign({ fill: color }, font || FONT),
    textAlignment: align || "leftMiddle",
  };
}
function frameTxt(key, xPx, yPx, s, color, font) {
  // rightMiddle = text extends to the RIGHT of the anchor point
  return {
    tag: "Text", key, global: true,
    point: { x: px(xPx), y: px(yPx) },
    text: s,
    style: Object.assign({ fill: color }, font || FONT),
    textAlignment: "rightMiddle",
    origin: { cs: "frame", h: "left", v: "top" },
  };
}
// histogram: Shapes->Rectangle rows, the pattern PROVEN to render by the
// VZO profile indicator on this chart (Rectangle primitives, px widths,
// du heights, alpha baked into rgba colors, global:true under isLast()).
// dir=+1 grows right from x0, -1 grows left. maxPx = longest row, pixels.
function histogram(keyBase, rows, x0, dir, colorMain, colorVA, colorPoc, maxPx) {
  const prices = rows.map(r => r.price).sort((a, b) => a - b);
  let rowH = 0;
  for (let i = 1; i < prices.length; i++) rowH += prices[i] - prices[i - 1];
  // audit fix: single-row fallback uses the true row pitch carried by core
  rowH = prices.length > 1 ? (rowH / (prices.length - 1)) * 0.85
    : (rows[0].h || 1) * 0.85;
  const groups = { main: [], va: [], poc: [] };
  for (const r of rows) {
    if (!(r.frac > 0)) continue;   // audit fix: no phantom stubs on gap rows
    const w = Math.max(3, Math.round(r.frac * maxPx)) * dir;
    // bottom-left position convention, matching the working reference
    // indicator (it passes priceTop - binSize, i.e. the bottom edge)
    const rect = {
      tag: "Rectangle",
      position: { x: du(x0), y: du(r.price - rowH / 2) },
      size: { width: px(w), height: du(rowH) },
    };
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
    this.lastPushedMs = 0;
    this.lastOut = null;
    this.marks = [];              // {tMs, price, ev} -- NO indexes stored:
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
      this.marks.push({ tMs, price: bar.c, ev: { kind: "absorb", long: this.core.poc.side } });
    if (out.signal)
      this.marks.push({ tMs, price: out.signal.entry, ev: out.signal });
    if (out.flowQuit)
      this.marks.push({ tMs, price: bar.c, ev: { kind: "flowquit" } });
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
    const SHOW_PROFILES = true;   // histograms on (redraws need a poke when market closed)
    const items = [];
    const out = this.lastOut;
    if (!this.timeBased) {
      items.push(frameTxt("tmWarn", 70, 20,
        "TraderMachell: use a time-based (minute) chart", COLORS.warn));
      return items;
    }
    if (!out) return items;
    const tcache = new Map();
    // index of the last PUSHED bar: i if the current bar is committed,
    // else i-1 (the developing bar is never pushed)
    const endIdx = this.lastPushedMs === d.timestamp().getTime() ? i : i - 1;
    const idx = t => this._idxOf(t, endIdx, tcache);
    let x0 = idx(out.dayStartTms);
    if (x0 === undefined) x0 = Math.max(0, i - 60);
    const lx = i + 4;                       // label column, right of last bar
    const fmt = p => (this.contractInfo && this.contractInfo.tickSize < 0.01)
      ? p.toFixed(3) : p.toFixed(1);

    // ---- status banner, pinned to the viewport (always readable) ----
    let lvls = "";
    if (out.prev)
      lvls = "PREV  POC " + fmt(out.prev.poc) + "   VAH " + fmt(out.prev.vah) +
        "   VAL " + fmt(out.prev.val) +
        (out.htf ? "      HTF POC " + fmt(out.htf.poc) : "      HTF: needs more history");
    items.push(frameTxt("stat1", 70, 18, "TraderMachell  |  " + (out.status || ""), COLORS.status));
    if (lvls) items.push(frameTxt("stat2", 70, 36, lvls, COLORS.dim, FONT_SM));
    if (this.barMin !== 1)
      items.push(frameTxt("statW", 70, 54,
        "CAUTION: " + this.barMin + "-min bars - grades measured on 1-min", COLORS.warn, FONT_SM));
    if (out.confluence)
      items.push(frameTxt("statC", 70, this.barMin !== 1 ? 72 : 54,
        "CONFLUENCE: ACCUM sits on prev POC  [n=1 - untested]", COLORS.conflu));

    // ---- per-session profiles (MarketProfile-style: one histogram per
    // day, anchored at each session's own start -- the MT5 look) ----
    if (SHOW_PROFILES && out.sessionProfiles) {
      for (let s = 0; s < out.sessionProfiles.length; s++) {
        const sp = out.sessionProfiles[s];
        const six = idx(sp.start);
        if (six === undefined) continue;
        items.push(...histogram("sp" + s, sp.rows, six, 1,
          "rgba(122,111,191,0.30)", "rgba(158,143,232,0.45)",
          "rgba(201,191,255,0.85)", 110));
      }
    }

    // ---- PREV-SESSION volume profile (teal, grows right from day start) ----
    if (SHOW_PROFILES && out.prevProf) {
      items.push(...histogram("ppro", out.prevProf, x0, 1,
        COLORS.profile, COLORS.profileVA, COLORS.pocRow, 160));
    }
    if (out.prev) {
      const thin = out.prev.liquid ? "" : "  [THIN - no signals]";
      items.push(ray("pocL", x0, out.prev.poc, COLORS.poc, 3, 1));
      items.push(txt("pocT", lx, out.prev.poc,
        "PREV POC " + fmt(out.prev.poc) + thin, COLORS.poc));
      items.push(ray("vahL", x0, out.prev.vah, COLORS.va, 1, 3));
      items.push(txt("vahT", lx, out.prev.vah, "VAH " + fmt(out.prev.vah), COLORS.va, 0, FONT_SM));
      items.push(ray("valL", x0, out.prev.val, COLORS.va, 1, 3));
      items.push(txt("valT", lx, out.prev.val, "VAL " + fmt(out.prev.val), COLORS.va, 0, FONT_SM));
    }

    // ---- naked POC rays (Dale's signature: red, extended until tested) ----
    if (out.nakedPocs) {
      for (let n = 0; n < out.nakedPocs.length; n++) {
        const np = out.nakedPocs[n];
        if (out.prev && Math.abs(np.poc - out.prev.poc) < 1e-9) continue; // white ray owns it
        const ix = idx(np.endTms);
        items.push(ray("nk" + n, ix !== undefined ? ix : Math.max(0, x0 - 200),
          np.poc, "#E53935", 1, 1));
        items.push(txt("nkT" + n, lx, np.poc,
          "naked POC " + fmt(np.poc), "#E57373", 0, FONT_SM));
      }
    }

    // ---- HTF composite (dark gold ghost, grows LEFT from day start) ----
    if (SHOW_PROFILES && out.htfRows && x0 > 2) {
      items.push(...histogram("hpro", out.htfRows, x0, -1,
        "rgba(201,150,43,0.30)", "rgba(201,150,43,0.30)",
        "rgba(201,150,43,0.80)", 130));
    }
    if (out.htf) {
      items.push(ray("hpocL", Math.max(0, x0 - 40), out.htf.poc, COLORS.htf, 3, 1));
      items.push(txt("hpocT", lx, out.htf.poc,
        "HTF POC " + fmt(out.htf.poc) + " (" + out.htf.sessions + "s)", COLORS.htf));
      items.push(ray("hvahL", Math.max(0, x0 - 40), out.htf.vah, COLORS.htf, 1, 4));
      items.push(txt("hvahT", lx, out.htf.vah, "HTF VAH " + fmt(out.htf.vah), COLORS.htf, 0, FONT_SM));
      items.push(ray("hvalL", Math.max(0, x0 - 40), out.htf.val, COLORS.htf, 1, 4));
      items.push(txt("hvalT", lx, out.htf.val, "HTF VAL " + fmt(out.htf.val), COLORS.htf, 0, FONT_SM));
      const pxNow = d.close();
      const ctx = pxNow > out.htf.vah ? "above value (info, not a gate)"
        : pxNow < out.htf.val ? "below value (info, not a gate)"
          : "inside value (balanced)";
      items.push(frameTxt("hctx", 70, out.confluence ? 90 : 72, "HTF: " + ctx, COLORS.htf, FONT_SM));
    }

    // ---- ACCUM rotation: box + gold histogram + level ray ----
    if (out.accum) {
      const ia = idx(out.accum.start);
      const ib = idx(out.accum.end);
      if (ia !== undefined && ib !== undefined && out.accum.winHi) {
        items.push(box("accB", ia, ib, out.accum.winHi, out.accum.winLo, COLORS.accum));
        if (SHOW_PROFILES && out.accum.rows)
          items.push(...histogram("apro", out.accum.rows, ia, 1,
            "rgba(255,215,0,0.30)", "rgba(255,215,0,0.30)",
            "rgba(255,255,255,0.85)", 90));
      }
      items.push(ray("accL", ia !== undefined ? ia : x0, out.accum.level, COLORS.accum, 2, 1));
      items.push(txt("accT", lx, out.accum.level,
        "ACCUM " + fmt(out.accum.level) +
        (out.accum.short ? "  SELL retest" : "  BUY retest") +
        "  [+0.28R/75% n12]", COLORS.accum));
    }

    // ---- LEG cluster ----
    if (out.leg) {
      items.push(ray("legL", x0, out.leg.level, COLORS.leg, 1, 1));
      items.push(txt("legT", lx, out.leg.level,
        "LEG " + fmt(out.leg.level) +
        (out.leg.down ? "  SELL retest" : "  BUY retest") + "  [untested]", COLORS.leg, 0, FONT_SM));
    }

    // ---- marks: absorption, signals, flow-quit ----
    let lastSig = null, lastSigIdx;
    for (let m = 0; m < this.marks.length; m++) {
      const mk = this.marks[m];
      const mi = idx(mk.tMs);
      if (mi === undefined) continue;
      const ev = mk.ev;
      if (ev.kind === "absorb") {
        items.push(txt("ab" + mk.tMs, mi, mk.price,
          "ABSORPTION", COLORS.absorb, ev.long ? 14 : -14, FONT_SM, "centerMiddle"));
        continue;
      }
      if (ev.kind === "flowquit") {
        items.push(txt("fq" + mk.tMs, mi, mk.price,
          "FLOW QUIT", COLORS.conflu, 16, FONT, "centerMiddle"));
        continue;
      }
      const col = ev.long ? COLORS.buy : COLORS.sell;
      items.push(txt("sgA" + mk.tMs, mi, ev.entry,
        ev.long ? "▲" : "▼", col, ev.long ? -10 : 10,
        { fontSize: 16, fontWeight: "bold" }, "centerMiddle"));
      items.push(txt("sg" + mk.tMs, mi, ev.entry,
        (ev.long ? "  BUY " : "  SELL ") + ev.kind + " " + fmt(ev.entry) +
        "  " + ev.tag + (ev.htf ? "  " + ev.htf : ""), col,
        ev.long ? -26 : 26, FONT_SM));
      lastSig = mk; lastSigIdx = mi;
    }
    if (lastSig && lastSig.ev.day === out.day && lastSigIdx !== undefined) {
      const ev = lastSig.ev;
      items.push(ray("tpL", lastSigIdx, ev.tp, COLORS.tp, 2, 3));
      items.push(txt("tpT", lx, ev.tp, "TP " + fmt(ev.tp), COLORS.tp));
      items.push(ray("slL", lastSigIdx, ev.sl, COLORS.sl, 2, 2));
      items.push(txt("slT", lx, ev.sl, "SL " + fmt(ev.sl), COLORS.sl));
    }
    return items;
  }

  filter() { return true; }
}

module.exports = {
  name: "traderMachell",
  description: "TraderMachell - Dale volume-profile model (tested grades)",
  calculator: traderMachell,
  inputType: meta.InputType.BARS,
  areaChoice: meta.AreaChoice.OVERLAY,
  tags: ["TraderMachell"],
  params: {
    htfSessions: predef.paramSpecs.period(20),
  },
};
