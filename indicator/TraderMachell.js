/*
 * TraderMachell -- Tradovate custom indicator
 * Dale volume-profile model with backtest-earned evidence tags.
 * Generated 2026-08-09 by build.js -- do not edit by hand;
 * edit dale_core.js / wrapper.js and rebuild.
 *
 * Core math is regression-verified: identical POC/VAH/VAL to the Python
 * research harness on all 205 GCQ6 sessions (test_core.js), and the
 * wrapper survived a 110k-bar platform simulation under both candidate
 * live-engine models (sim_tradovate.js).
 *
 * HONESTY BOX (provenance of the on-chart grade tags):
 *  - Delta here = offerVolume - bidVolume (all the indicator API exposes).
 *    The grades were measured on upVolume - downVolume: corr 0.87, exact
 *    match on 24% of bars. Signature + flow-quit timing may differ a
 *    little from the backtest; levels/profiles are delta-free.
 *  - Grades were measured with NO time-of-day gate; this indicator (like
 *    the MT5 version and the playbook) only signals 09:00-11:00 NY.
 *  - Signals require the prior session to pass the harness liquidity gate
 *    (>= 2000 contracts, >= 120 minutes) -- thin sessions draw levels
 *    flagged [THIN] and stand down, matching how the grades were measured.
 *  - 1-minute bars are the graded configuration; other minute sizes are
 *    scaled approximations and the chart says so.
 *  - Signature/flow-quit volume+range statistics use a trailing ~2-hour
 *    window (live-causal). The backtest used whole-session statistics,
 *    which are impossible without lookahead and, computed causally, made
 *    absorption undetectable in NY hours. Same concept, local calibration.
 *  - No alerts: Tradovate custom indicators cannot fire alerts. This tool
 *    draws; the playbook's alert-driven routine stays on MT5.
 *
 * INSTALL: Tradovate -> Charts module -> Indicators -> Indicator Editor
 * (Code Explorer) -> New Indicator -> replace the template with this whole
 * file -> Save. Add "TraderMachell" to a 1-MINUTE chart of the front-month
 * GC/MGC contract (modern Chart module, not Legacy Chart). Set the chart's
 * "Bars to Load" as high as it allows (the 20-session HTF composite needs
 * deep history; it degrades gracefully and simply omits HTF lines when
 * history is short).
 */
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

/*
 * dale_core.js -- platform-independent core of the TraderDalePOC model,
 * ported from TraderDalePOC.mq5 v5.11 + the Python research harness
 * (dale_tv.py / dale_of2.py / dale_v5.py).
 *
 * Everything here is pure JS with no Tradovate API dependency, so the exact
 * same code can be (a) regression-tested in Node against the Python harness
 * on the GCQ6 dataset, and (b) wrapped in a Tradovate custom-indicator
 * module. Bars stream in one at a time (no lookahead).
 *
 * Bar shape: { tMs, o, h, l, c, vol, delta }
 *   tMs   = bar START time, UTC milliseconds
 *   vol   = real traded volume (d.volume() on Tradovate)
 *   delta = on Tradovate: offerVolume() - bidVolume(). DISCLOSURE: the
 *           backtest grades below were measured on upVolume - downVolume
 *           (the market-data API's uptick/downtick split), which the
 *           indicator runtime does not expose. On the test data the two
 *           correlate 0.87 and match exactly on 24% of bars -- a close
 *           cousin, not the same number. Only the prior-POC signature and
 *           flow-quit consume delta; profiles/levels are delta-free.
 *
 * Grades carried from the backtests (GCQ6 real volume, 86 sessions):
 *   prior-POC + signature + reaction stop : +0.40R, 80% win, n=10  [tested]
 *   ACCUM rotation retest                 : +0.28R, 75% win, n=12  [tested]
 *   LEG cluster retest                    : 0 completions          [untested]
 *   HTF alignment                         : contradictory -> tag only
 */



// ---- defaults (mirror the v5.11 inputs) ---------------------------------
const CFG = {
  rows: 80,            // price rows per profile
  vaPct: 0.70,         // value area
  priorDays: 10,       // prior POCs scanned for targets
  moveAwayATR: 1.0,    // arming distance
  flipBufATR: 0.15,    // close beyond POC = side flip
  lvnFrac: 0.30,       // LVN threshold vs POC row volume
  tpFrontATR: 0.15,    // front-run the target
  sigBars: 15,         // bars after touch to find the signature
  initBars: 5,         // initiative must follow absorption within N bars
  htfSessions: 20,     // sessions merged into the big picture
  legPivot: 12,        // pivot strength
  legMinATR: 0.75,     // min leg size (2.0 was unreachable in backtest)
  legLookback: 600,    // bars scanned for the leg
  accumLookback: 2880, // bars scanned for rotations (2 days)
  accumMinBars: 30,    // min rotation length
  accumMaxRangeATR: 1.5,
  accumBreakATR: 1.0,
  atrWindow: 420,      // 1-min bars ~ ATR(M30,14) horizon
  nyStartHour: 9,      // signal window, New York
  nyEndHour: 11,
  barMinutes: 1,       // chart bar size; scales the ATR factor + session mins
  liquidMinVol: 2000,  // prior session must have traded this to be trusted
  liquidMinBars: 120,  // ...and have this many bars (harness liquidity gate)
  sigStatWindow: 120,  // trailing bars for signature/flow-quit vol+range stats.
  // CALIBRATION NOTE: the backtest computed these medians over the whole
  // session (overnight included). Live+causal that made absorption
  // undetectable during NY hours (overnight medians are tiny), so the port
  // measures churn against the trailing ~2 hours instead -- same concept,
  // locally adaptive, consistent with the MT5 proxy. Disclosed in the banner.
};

// ---- New York time (US DST rule, no Intl dependency) --------------------
// DST: second Sunday of March 07:00 UTC -> first Sunday of November 06:00 UTC.
function nthSundayUtcMs(year, monthIdx, nth) {
  const first = Date.UTC(year, monthIdx, 1);
  const dow = new Date(first).getUTCDay();
  const firstSunday = 1 + ((7 - dow) % 7);
  return Date.UTC(year, monthIdx, firstSunday + 7 * (nth - 1));
}
function nyOffsetHours(tMs) {
  const y = new Date(tMs).getUTCFullYear();
  const dstStart = nthSundayUtcMs(y, 2, 2) + 7 * 3600e3;  // 2nd Sun Mar, 07:00 UTC
  const dstEnd = nthSundayUtcMs(y, 10, 1) + 6 * 3600e3;   // 1st Sun Nov, 06:00 UTC
  return (tMs >= dstStart && tMs < dstEnd) ? -4 : -5;
}
function nyParts(tMs) {
  const off = nyOffsetHours(tMs);
  const d = new Date(tMs + off * 3600e3);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    hour: d.getUTCHours(), dayMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  };
}
// CME session day: rolls at 17:00 New York. Returns "YYYY-MM-DD".
function sessionKey(tMs) {
  const p = nyParts(tMs);
  let dayMs = p.dayMs;
  if (p.hour >= 17) dayMs += 86400e3;
  const d = new Date(dayMs);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}
function inNyWindow(tMs, cfg) {
  const h = nyParts(tMs).hour;
  return h >= cfg.nyStartHour && h < cfg.nyEndHour;
}

// exact floor division matching CPython's float `//` (float_divmod), so bin
// boundaries land identically to the research harness. The final half-step
// correction is CPython's: (x - fmod) / y is mathematically an exact
// multiple of y, so if float rounding left div just under the integer,
// snap up to it.
function floorDiv(x, y) {
  let mod = x % y;                      // JS % on doubles = C fmod (exact)
  let div = (x - mod) / y;
  if (mod !== 0 && ((y < 0) !== (mod < 0))) { mod += y; div -= 1.0; }
  if (div !== 0) {
    const fl = Math.floor(div);
    return (div - fl > 0.5) ? fl + 1 : fl;
  }
  return 0;
}

// ---- volume profile (exact mirror of dale_tv.build_profile) -------------
function buildProfile(bars, step) {
  if (!bars.length || step <= 0 || !Number.isFinite(step)) return null;
  let lo = Infinity, hiAll = -Infinity;
  for (const b of bars) { if (b.l < lo) lo = b.l; if (b.h > hiAll) hiAll = b.h; }
  // degenerate-step guard: a near-zero ATR (flat overnight bars) can make the
  // grid explode; a real profile is ~80-160 rows, so thousands = garbage in
  if ((hiAll - lo) / step > 5000) return null;
  const gridLo = lo - 40 * step;
  const vol = new Map();
  let total = 0;
  for (const b of bars) {
    const a = floorDiv(b.l - gridLo, step);
    const z = floorDiv(b.h - gridLo, step);
    const share = z >= a ? b.vol / (z - a + 1) : b.vol;
    for (let k = a; k <= z; k++) vol.set(k, (vol.get(k) || 0) + share);
    total += b.vol;
  }
  if (!vol.size || total <= 0) return null;
  let pocRow = null, pocV = -1;
  for (const [k, v] of vol) if (v > pocV) { pocV = v; pocRow = k; }
  const poc = gridLo + (pocRow + 0.5) * step;
  const need = total * CFG.vaPct;
  let acc = vol.get(pocRow), up = pocRow, dn = pocRow;
  while (acc < need) {
    const a = vol.get(up + 1) || 0, b = vol.get(dn - 1) || 0;
    if (a <= 0 && b <= 0) break;
    if (a >= b) { up += 1; acc += a; } else { dn -= 1; acc += b; }
  }
  return {
    lo: gridLo, step, poc, pocRow,
    vah: gridLo + (up + 1) * step, val: gridLo + dn * step, vol,
  };
}

function stopBehindLVN(prof, forLong, atr) {
  const pv = prof.vol.get(prof.pocRow) || 0;
  const { lo, step, vol } = prof;
  if (forLong) {
    const k0 = floorDiv(prof.val - lo, step);
    for (let k = k0 - 1; k > k0 - 60; k--)
      if ((vol.get(k) || 0) < CFG.lvnFrac * pv) return lo + k * step - 0.10 * atr;
    return prof.val - 0.60 * atr;
  }
  // audit fix: start at k0 (the first bin above the VAH). The graded
  // harness carried a one-bin skip here (short stops one bin farther);
  // corrected for live use -- difference is at most one profile row.
  const k0 = floorDiv(prof.vah - lo, step);
  for (let k = k0; k < k0 + 60; k++)
    if ((vol.get(k) || 0) < CFG.lvnFrac * pv) return lo + (k + 1) * step + 0.10 * atr;
  return prof.vah + 0.60 * atr;
}

// ---- display helper: downsample a profile into <=N drawable rows --------
// Each row: { price, frac (0..1 of max volume), inVA, isPoc }
function displayRows(prof, N, maxPrice) {
  const keys = [...prof.vol.keys()].sort((a, b) => a - b);
  if (!keys.length) return null;
  const kLo = keys[0], kHi = keys[keys.length - 1];
  const span = kHi - kLo + 1;
  const group = Math.max(1, Math.ceil(span / N));
  const out = [];
  let vmax = 0;
  for (let g = kLo; g <= kHi; g += group) {
    // audit fix: clip the final (possibly partial) group before centering
    const kEnd = Math.min(g + group - 1, kHi);
    let v = 0;
    for (let k = g; k <= kEnd; k++) v += prof.vol.get(k) || 0;
    const price = prof.lo + ((g + kEnd + 1) / 2) * prof.step;
    // audit fix: skip the exact-edge overhang bin above the session high
    // (buildProfile parity with the graded harness is preserved; the clamp
    // is display-only)
    if (maxPrice !== undefined && prof.lo + g * prof.step >= maxPrice) continue;
    const isPoc = prof.pocRow >= g && prof.pocRow <= kEnd;
    const inVA = price >= prof.val && price <= prof.vah;
    out.push({ price, v, inVA, isPoc, h: group * prof.step });
    if (v > vmax) vmax = v;
  }
  if (vmax <= 0) return null;
  for (const r of out) { r.frac = r.v / vmax; delete r.v; }
  return out;
}

// ---- small helpers ------------------------------------------------------
function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pctile(a, p) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

// ---- the streaming core -------------------------------------------------
class DaleCore {
  constructor(cfg) {
    this.cfg = Object.assign({}, CFG, cfg || {});
    this.day = null;          // current session key
    this.dayBars = [];        // bars of the current session
    this.recent = [];         // rolling window (accumLookback) across sessions
    this.sessions = [];       // finalized sessions: {key, bars} (last htfSessions kept)
    this.prev = null;         // prior-session profile
    this.prevLiquid = false;  // prior session passed the harness liquidity gate
    this.priorPocs = [];      // recent prior POCs (targets)
    this.naked = [];          // untested session POCs (Dale's naked-POC rays)
    this.htf = null;          // composite profile {poc, vah, val}
    this.atr = 0;
    this._resetDayState();
    this.events = [];         // signal events accumulated over the run
  }

  _resetDayState() {
    // prior-POC machine (v5.11 FireSignal + SignatureScan semantics)
    this.poc = {
      side: null, wasOut: false, armed: false, maxd: 0, flipped: false,
      touchedAt: -1, reactExt: null, absorbAt: -1, done: false, fired: false,
    };
    // ACCUM machine (signed retest)
    this.acc = { level: null, prof: null, short: false, key: null,
      wasOut: false, maxd: 0, done: false, indep: false, start: null, end: null };
    // LEG machine (signed retest, v5.11 guards)
    this.leg = { level: null, prof: null, down: false, key: null,
      wasOut: false, maxd: 0, done: false, firedToday: false };
    this.sigLive = null;      // open signal being tracked for flow-quit
  }

  // ---- session roll ----
  _finalizeSession() {
    const minBars = Math.max(10, Math.round(30 / this.cfg.barMinutes));
    if (this.dayBars.length >= minBars) {
      let vol = 0, lo = Infinity, hi = -Infinity;
      for (const b of this.dayBars) { vol += b.vol; if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
      if (vol > 0) {
        const step = Math.max((hi - lo) / this.cfg.rows, 1e-9);
        const prof = buildProfile(this.dayBars, step);
        if (prof) {
          this.prev = prof;
          this._prevRows = displayRows(prof, 40, hi);
          // harness graded signals only when the prior session was liquid;
          // thin sessions still draw levels but are flagged + not traded
          this.prevLiquid = vol >= this.cfg.liquidMinVol &&
            this.dayBars.length >= Math.round(this.cfg.liquidMinBars / this.cfg.barMinutes);
          this.priorPocs.push(prof.poc);
          if (this.priorPocs.length > 50) this.priorPocs.shift();
          this.naked.push({ poc: prof.poc,
            endTms: this.dayBars[this.dayBars.length - 1].tMs, tested: false });
          if (this.naked.length > 12) this.naked.shift();
        }
        this.sessions.push({ key: this.day, bars: this.dayBars,
          startTms: this.dayBars[0].tMs,
          rows: prof ? displayRows(prof, 30, hi) : null });
        if (this.sessions.length > this.cfg.htfSessions) this.sessions.shift();
        this._rebuildHTF();
      }
    }
    this.dayBars = [];
    this._resetDayState();
  }

  _rebuildHTF() {
    if (this.sessions.length < 5) { this.htf = null; this._htfRows = null; return; }
    const all = [];
    for (const s of this.sessions) for (const b of s.bars) all.push(b);
    let lo = Infinity, hi = -Infinity;
    for (const b of all) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
    const step = Math.max((hi - lo) / this.cfg.rows, 1e-9);
    const p = buildProfile(all, step);
    this.htf = p ? { poc: p.poc, vah: p.vah, val: p.val, sessions: this.sessions.length } : null;
    this._htfRows = p ? displayRows(p, 40, hi) : null;
  }

  _updateATR() {
    const w = this.cfg.atrWindow;
    const src = this.recent.length > w ? this.recent.slice(-w) : this.recent;
    if (!src.length) { this.atr = 0; return; }
    let s = 0;
    for (const b of src) s += b.h - b.l;
    // harness definition: mean 1-min range x30. On k-minute bars the
    // equivalent linear scale is x(30/k). Grades were measured on 1-min.
    this.atr = (s / src.length) * (30 / this.cfg.barMinutes);
  }

  htfAligned(isLong, px) {
    if (!this.htf) return null;
    return isLong ? px >= this.htf.poc : px <= this.htf.poc;
  }

  _emit(ev) {
    this.events.push(ev);
    if (this.events.length > 200) this.events.shift();
    return ev;
  }

  // ---- ACCUM detection (mirror of DetectAccumulation / find_rotations) ----
  _detectAccum() {
    const cfg = this.cfg, atr = this.atr;
    const src = this.recent.length > cfg.accumLookback
      ? this.recent.slice(-cfg.accumLookback) : this.recent;
    const n = src.length, L = cfg.accumMinBars;
    if (n < L + 10 || atr <= 0) { this.acc.level = null; return; }
    const thresh = cfg.accumMaxRangeATR * atr, brk = cfg.accumBreakATR * atr;
    let e = n - 1 - L;
    while (e >= L) {
      let wHi = -Infinity, wLo = Infinity;
      for (let i = e - L + 1; i <= e; i++) { if (src[i].h > wHi) wHi = src[i].h; if (src[i].l < wLo) wLo = src[i].l; }
      if (wHi - wLo > thresh) { e -= 5; continue; }
      let s = e - L + 1;
      while (s > 0) {
        const nh = Math.max(wHi, src[s - 1].h), nl = Math.min(wLo, src[s - 1].l);
        if (nh - nl > thresh) break;
        wHi = nh; wLo = nl; s -= 1;
      }
      let up = false, dn = false, ext = 0, comp = -1, dead = false;
      for (let j = e + 1; j < n; j++) {
        const c = src[j].c;
        if (!up && !dn) {
          if (c > wHi + 0.2 * atr) up = true;
          else if (c < wLo - 0.2 * atr) dn = true;
          continue;
        }
        if (up) {
          if (src[j].h - wHi > ext) ext = src[j].h - wHi;
          if (c < wLo - 0.2 * atr) { dead = true; break; }
        } else {
          if (wLo - src[j].l > ext) ext = wLo - src[j].l;
          if (c > wHi + 0.2 * atr) { dead = true; break; }
        }
        if (ext >= brk && comp < 0) comp = j;
      }
      if (comp > 0 && !dead) {
        const step = Math.max((wHi - wLo + 2 * atr) / cfg.rows, 1e-9);
        const prof = buildProfile(src.slice(s, e + 1), step);
        if (prof) {
          const key = src[e].tMs;
          if (key !== this.acc.key) {
            this.acc = { level: prof.poc, prof, short: dn, key,
              wasOut: false, maxd: 0, done: false,
              start: src[s].tMs, end: src[e].tMs, indep: false,
              winHi: wHi, winLo: wLo, rows: displayRows(prof, 30) };
          } else {
            this.acc.level = prof.poc; this.acc.prof = prof; this.acc.short = dn;
            this.acc.winHi = wHi; this.acc.winLo = wLo;
            // audit fix: keep the display state in sync with the level
            this.acc.rows = displayRows(prof, 30);
            this.acc.start = src[s].tMs;
          }
          return;
        }
      }
      e = s - 5;
    }
    this.acc.level = null;
  }

  // ---- LEG detection (mirror of Leg2Update discovery, v5.11 guards) ----
  _detectLeg() {
    const cfg = this.cfg, atr = this.atr;
    const src = this.recent.length > cfg.legLookback
      ? this.recent.slice(-cfg.legLookback) : this.recent;
    const n = src.length, k = cfg.legPivot;
    if (n < 100 || atr <= 0) { this.leg.level = null; return; }
    let lastPH = -1, lastPL = -1;
    for (let i = n - 1 - k; i >= k && (lastPH < 0 || lastPL < 0); i--) {
      let ph = true, pl = true;
      for (let j = i - k; j <= i + k && (ph || pl); j++) {
        if (j === i) continue;
        if (src[j].h >= src[i].h) ph = false;
        if (src[j].l <= src[i].l) pl = false;
      }
      if (ph && lastPH < 0) lastPH = i;
      if (pl && lastPL < 0) lastPL = i;
    }
    if (lastPH < 0 || lastPL < 0) { this.leg.level = null; return; }
    const a = Math.min(lastPH, lastPL), b = Math.max(lastPH, lastPL);
    if (b - a < 15) { this.leg.level = null; return; }
    if (Math.abs(src[lastPH].h - src[lastPL].l) < cfg.legMinATR * atr) { this.leg.level = null; return; }
    const step = Math.max((src[lastPH].h - src[lastPL].l + atr) / cfg.rows, 1e-9);
    const prof = buildProfile(src.slice(a, b + 1), step);
    if (!prof) { this.leg.level = null; return; }
    // never duplicate the ACCUM level
    if (this.acc.level !== null && Math.abs(prof.poc - this.acc.level) < 0.30 * atr) {
      this.leg.level = null; return;
    }
    const key = src[b].tMs;
    if (key !== this.leg.key) {
      const fired = this.leg.firedToday;
      this.leg = { level: prof.poc, prof, down: lastPH < lastPL, key,
        wasOut: false, maxd: 0, done: false, firedToday: fired };
    } else {
      this.leg.level = prof.poc; this.leg.prof = prof;
    }
  }

  _target(entry, dirn, atr, rr) {
    let tp;
    const cand = this.priorPocs.slice(-this.cfg.priorDays)
      .filter(p => (p - entry) * dirn > 0.05 * atr);
    if (cand.length) {
      let best = cand[0];
      for (const p of cand) if (Math.abs(p - entry) < Math.abs(best - entry)) best = p;
      tp = best - dirn * this.cfg.tpFrontATR * atr;
    } else {
      tp = entry + dirn * 0.8 * atr;
    }
    // MT5 v5.11 sanity clamp (postdates the dale_of2 grade): never quote a
    // target closer than half the risk
    if (rr > 0 && Math.abs(tp - entry) < 0.5 * rr) tp = entry + dirn * rr;
    return tp;
  }

  _fastApproach(atr) {
    const n = this.dayBars.length;
    if (n < 6 || atr <= 0) return false;
    return Math.abs(this.dayBars[n - 1].c - this.dayBars[n - 6].c) > 0.8 * atr;
  }

  // ---- per-bar update. Call once per CLOSED bar, oldest first. ----
  push(bar) {
    const cfg = this.cfg;
    const key = sessionKey(bar.tMs);
    if (this.day !== null && key !== this.day) this._finalizeSession();
    this.day = key;
    this.dayBars.push(bar);
    this.recent.push(bar);
    if (this.recent.length > cfg.accumLookback + 200) this.recent.shift();
    this._updateATR();

    const out = {
      tMs: bar.tMs, day: key, atr: this.atr,
      dayStartTms: this.dayBars[0].tMs,
      prev: this.prev ? { poc: this.prev.poc, vah: this.prev.vah, val: this.prev.val,
        liquid: this.prevLiquid } : null,
      htf: this.htf, accum: null, leg: null, signal: null, flowQuit: false,
      confluence: false, status: '',
      prevProf: this._prevRows || null, htfRows: this._htfRows || null,
      absorb: false, nakedPocs: null,
      // per-session profiles for the MarketProfile-style display (each
      // session's histogram drawn at its own start, like the MT5 chart)
      sessionProfiles: this.sessions.slice(-6)
        .filter(s => s.rows)
        .map(s => ({ start: s.startTms, rows: s.rows })),
    };
    // Dale's naked-POC rule: a session POC stays drawn (extended right)
    // until price trades back through it
    for (const np of this.naked)
      if (!np.tested && bar.l <= np.poc && bar.h >= np.poc) np.tested = true;
    const nk = this.naked.filter(n => !n.tested);
    if (nk.length) out.nakedPocs = nk.map(n => ({ poc: n.poc, endTms: n.endTms }));
    const atr = this.atr;
    if (atr <= 0) return out;

    this._detectAccum();
    this._detectLeg();
    if (this.acc.level !== null)
      out.accum = { level: this.acc.level, short: this.acc.short,
        start: this.acc.start, end: this.acc.end,
        winHi: this.acc.winHi, winLo: this.acc.winLo, rows: this.acc.rows };
    if (this.leg.level !== null)
      out.leg = { level: this.leg.level, down: this.leg.down };

    // confluence (v5.11 guards: independence + info only)
    if (this.acc.level !== null && this.prev &&
        Math.abs(this.acc.level - this.prev.poc) < 0.30 * atr) {
      const dayStartMs = this.dayBars[0].tMs;
      const indep = this.acc.start >= dayStartMs ||
        (dayStartMs - this.acc.start) * 2 < (this.acc.end - this.acc.start);
      out.confluence = !!indep;
    }

    const px = bar.c;
    const inWin = inNyWindow(bar.tMs, cfg);
    const i = this.dayBars.length - 1;

    // ------- prior-POC machine: touch -> signature -> fire -------
    // gated on prior-session liquidity, matching how the grade was measured
    const P = this.poc;
    if (this.prev && this.prevLiquid && !P.done && this.dayBars.length >= 5) {
      const lvl = this.prev.poc;
      const above = px > lvl;
      if (P.side === null) P.side = above;
      else if (P.side !== above && P.touchedAt < 0) {
        const beyond = P.side ? lvl - px : px - lvl;
        if (!P.flipped && beyond >= cfg.flipBufATR * atr) {
          P.flipped = true; P.side = above;
          P.armed = false; P.wasOut = false; P.maxd = 0;
        }
        // NOTE: MT5 (tick-driven) additionally tracks the side after a flip;
        // in a bar-close-driven port that inverts the approach direction at
        // the touch bar. The GRADED machine (dale_of2, the +0.40R source)
        // takes direction from the PREVIOUS bar's close -- done below.
      }
      if (P.touchedAt < 0) {
        const d = Math.abs(px - lvl);
        if (d > P.maxd) P.maxd = d;
        if (d > 0.10 * atr) P.wasOut = true;
        if (!P.armed && P.maxd >= cfg.moveAwayATR * atr) P.armed = true;
        if (P.armed && P.wasOut && inWin) {
          // graded-exact touch: the bar spans the level; direction = side of
          // the previous bar's close (dale_of2: long = cl[i0-1] > poc)
          const touch = bar.l <= lvl && bar.h >= lvl;
          if (touch && this.dayBars.length >= 2) {
            const sideLong = this.dayBars[this.dayBars.length - 2].c > lvl;
            P.side = sideLong;
            P.touchedAt = i;
            P.reactExt = sideLong ? bar.l : bar.h;
          }
        }
      } else {
        // signature scan on REAL delta (dale_of2 semantics, causal medians)
        P.reactExt = P.side ? Math.min(P.reactExt, bar.l) : Math.max(P.reactExt, bar.h);
        const since = i - P.touchedAt;
        if (since > cfg.sigBars) { P.done = true; }
        else {
          const w = this.dayBars.slice(-cfg.sigStatWindow);
          const vols = w.map(b => b.vol);
          const rngs = w.map(b => b.h - b.l);
          const dmags = w.map(b => Math.abs(b.delta));
          const vmed = median(vols), rmed = median(rngs), d75 = pctile(dmags, 75);
          const long = P.side;
          if (P.absorbAt < 0) {
            const holds = long ? bar.l > lvl - 0.30 * atr : bar.h < lvl + 0.30 * atr;
            if (bar.vol >= 1.3 * vmed && (bar.h - bar.l) <= 0.9 * rmed && holds) {
              P.absorbAt = i;
              out.absorb = true;   // visual: churn/absorption bar at the level
              this._emit({ kind: 'absorb', tMs: bar.tMs, day: key,
                price: long ? bar.l : bar.h, long });
            }
          } else if (i - P.absorbAt > cfg.initBars) {
            P.absorbAt = -1; // absorption expired; keep looking within sigBars
          } else {
            const init = Math.abs(bar.delta) >= d75 &&
              (long ? bar.delta > 0 : bar.delta < 0);
            if (init) {
              P.done = true;
              const entry = bar.c;
              const sl = long ? P.reactExt - 0.10 * atr : P.reactExt + 0.10 * atr;
              const ok = long ? sl < entry : sl > entry;
              if (ok) {
                const dirn = long ? 1 : -1;
                const tp = this._target(lvl, dirn, atr, Math.abs(entry - sl));
                const al = this.htfAligned(long, entry);
                P.fired = true;
                this.sigLive = { long, entry, r: Math.abs(entry - sl), maxFav: 0 };
                out.signal = this._emit({
                  kind: 'prior-poc', tMs: bar.tMs, day: key, long,
                  entry, sl, tp, level: lvl,
                  tag: '[stack tested +0.40R/80% n10]',
                  htf: al === null ? '' : (al ? '[HTF aligned]' : '[HTF against]'),
                  flipped: P.flipped,
                });
              }
            }
          }
        }
      }
    }

    // ------- ACCUM retest (graded semantics: unsigned arming, no kill --
    // this is the machine the [+0.28R/75% n12] grade was measured on and
    // what MT5 v5.11 ships. The proximity + SL sanity guards below postdate
    // the grade; they exist only for bar-close granularity.) -------
    const A = this.acc;
    if (A.level !== null && !A.done) {
      const dAbs = Math.abs(px - A.level);
      if (dAbs > A.maxd) A.maxd = dAbs;
      if (dAbs > 0.10 * atr) A.wasOut = true;
      if (A.maxd >= cfg.moveAwayATR * atr && A.wasOut && inWin) {
        const touch = A.short ? bar.h >= A.level : bar.l <= A.level;
        if (touch) {
          A.done = true;
          if (Math.abs(px - A.level) <= 0.30 * atr) {
            const long = !A.short;
            const sl = stopBehindLVN(A.prof, long, atr);
            const entry = A.level;
            if ((long ? sl < entry : sl > entry) && (long ? px > sl : px < sl)) {
              const dirn = long ? 1 : -1;
              const tp = this._target(entry, dirn, atr, Math.abs(entry - sl));
              const al = this.htfAligned(long, entry);
              out.signal = out.signal || this._emit({
                kind: 'accum', tMs: bar.tMs, day: key, long,
                entry, sl, tp, level: A.level,
                tag: '[tested +0.28R/75% n12]' +
                  (this._fastApproach(atr) ? ' [fast approach - caution]' : ''),
                htf: al === null ? '' : (al ? '[HTF aligned]' : '[HTF against]'),
              });
            }
          }
        }
      }
    }

    // ------- LEG retest (signed, v5.11 guards, untested arm) -------
    const L = this.leg;
    if (L.level !== null && !L.done && !L.firedToday) {
      const dTrend = L.down ? L.level - px : px - L.level;
      if (dTrend > L.maxd) L.maxd = dTrend;
      if (dTrend > 0.10 * atr) L.wasOut = true;
      if (-dTrend > 0.50 * atr) { L.done = true; }
      else if (L.maxd >= cfg.moveAwayATR * atr && L.wasOut && inWin) {
        const touch = L.down ? bar.h >= L.level : bar.l <= L.level;
        if (touch) {
          L.done = true;
          const nearPrior = this.prev && Math.abs(L.level - this.prev.poc) < 0.30 * atr;
          if (Math.abs(px - L.level) <= 0.30 * atr && !nearPrior) {
            const long = !L.down;
            const sl = stopBehindLVN(L.prof, long, atr);
            const entry = L.level;
            if ((long ? sl < entry : sl > entry) && (long ? px > sl : px < sl)) {
              const dirn = long ? 1 : -1;
              const tp = this._target(entry, dirn, atr, Math.abs(entry - sl));
              L.firedToday = true;
              out.signal = out.signal || this._emit({
                kind: 'leg', tMs: bar.tMs, day: key, long,
                entry, sl, tp, level: L.level,
                tag: '[UNTESTED - inert in backtest]' +
                  (this._fastApproach(atr) ? ' [fast approach - caution]' : ''),
                htf: '',
              });
            }
          }
        }
      }
    }

    // ------- status line (mirrors the MT5 status text) -------
    if (!this.prev) out.status = 'waiting: no prior-session profile yet';
    else if (!this.prevLiquid) out.status = 'stand down: prior session too thin to trust';
    else if (this.sigLive) out.status = 'signal live - manage per playbook';
    else if (P.done && P.fired) out.status = 'signal complete for the session';
    else if (P.done && P.touchedAt >= 0)
      out.status = 'stood down: touch had no absorption-initiative signature';
    else if (P.done) out.status = 'done for the session';
    else if (P.touchedAt >= 0) out.status = 'TOUCHED - waiting for absorption-initiative';
    else if (P.armed && inWin)
      out.status = P.side ? 'armed: buy the retest from above' : 'armed: sell the retest from below';
    else if (P.armed) out.status = 'armed - outside the 09:00-11:00 NY window';
    else out.status = 'waiting: price has not moved 1 ATR from the level';

    // ------- flow-quit alert on the open prior-POC signal -------
    if (this.sigLive) {
      const S = this.sigLive;
      const fav = (S.long ? px - S.entry : S.entry - px) / S.r;
      if (fav > S.maxFav) S.maxFav = fav;
      if (fav <= -1 || S.maxFav >= 3) this.sigLive = null;
      else if (S.maxFav >= 0.3) {
        const w = this.dayBars.slice(-cfg.sigStatWindow);
        const vols = w.map(b => b.vol);
        const dmags = w.map(b => Math.abs(b.delta));
        const vmed = median(vols), d90 = pctile(dmags, 90);
        const opp = Math.abs(bar.delta) >= d90 && bar.vol >= 2 * vmed &&
          (S.long ? bar.delta < 0 : bar.delta > 0);
        if (opp) { out.flowQuit = true; this.sigLive = null; }
      }
    }

    return out;
  }
}



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
