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

'use strict';

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
  nyStartHour: 9,      // NY morning window (FundedNext overlap)
  nyEndHour: 11,
  asianStartHour: 18,  // Asian session start, New York (Tokyo open ~19:00)
  asianEndHour: 3,     // Asian session end (wraps midnight)
  sessionWindow: 2,    // 0 = NY only, 1 = Asian only, 2 = both (default)
  avoidPreLon: true,   // skip 1st pre-London open hour (manipulation window)
  preLonStartHour: 2,  // pre-London blackout start (NY clock)
  preLonEndHour: 3,    // pre-London blackout end (exclusive)
  // FundedNext Rapid Daily account rules (display + activity tracking)
  accountSize: 100000,
  trackActivity: true,
  activityMaxIdleDays: 2,  // min one trade within 2 FundedNext activity days
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
function inHourWindow(tMs, start, end) {
  const h = nyParts(tMs).hour;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;   // wraps midnight (Asian 18:00-03:00)
}
function inNyWindow(tMs, cfg) {
  return inHourWindow(tMs, cfg.nyStartHour, cfg.nyEndHour);
}
function inAsianWindow(tMs, cfg) {
  return inHourWindow(tMs, cfg.asianStartHour, cfg.asianEndHour);
}
function inPreLonBlackout(tMs, cfg) {
  if (!cfg.avoidPreLon) return false;
  return inHourWindow(tMs, cfg.preLonStartHour, cfg.preLonEndHour);
}
function inTradeWindow(tMs, cfg) {
  const mode = Number(cfg.sessionWindow);
  let inWin;
  if (mode === 0) inWin = inNyWindow(tMs, cfg);
  else if (mode === 2) inWin = inNyWindow(tMs, cfg) || inAsianWindow(tMs, cfg);
  else inWin = inAsianWindow(tMs, cfg);
  if (inWin && inPreLonBlackout(tMs, cfg)) inWin = false;
  return inWin;
}
function sessionWindowLabel(cfg) {
  const mode = Number(cfg.sessionWindow);
  let label;
  if (mode === 0) label = 'NY ' + cfg.nyStartHour + ':00-' + cfg.nyEndHour + ':00';
  else if (mode === 2) label = 'Asian ' + cfg.asianStartHour + '-' + cfg.asianEndHour +
    ' + NY ' + cfg.nyStartHour + '-' + cfg.nyEndHour;
  else label = 'Asian ' + cfg.asianStartHour + ':00-' + cfg.asianEndHour + ':00 NY';
  if (cfg.avoidPreLon)
    label += ' (no ' + cfg.preLonStartHour + '-' + cfg.preLonEndHour + ' pre-Lon)';
  return label;
}

// FundedNext Futures Rapid Daily limits (help center / challenge terms)
const FN_RAPID_DAILY = {
  25000: { dll: 500, mll: 1250, buffer: 26100, profitTarget: 1500, maxPayout: 800 },
  50000: { dll: 1000, mll: 2000, buffer: 52100, profitTarget: 3000, maxPayout: 1200 },
  100000: { dll: 1250, mll: 2500, buffer: 102600, profitTarget: 5000, maxPayout: 2500 },
};
function fnRulesFor(accountSize) {
  const sz = Number(accountSize);
  return FN_RAPID_DAILY[sz] || FN_RAPID_DAILY[100000];
}

// FundedNext activity day rolls at 16:01 US Central (inactivity policy uses CT)
function ctOffsetHours(tMs) {
  const y = new Date(tMs).getUTCFullYear();
  const dstStart = nthSundayUtcMs(y, 2, 2) + 8 * 3600e3;
  const dstEnd = nthSundayUtcMs(y, 10, 1) + 7 * 3600e3;
  return (tMs >= dstStart && tMs < dstEnd) ? -5 : -6;
}
function activityDayKey(tMs) {
  const off = ctOffsetHours(tMs);
  const d = new Date(tMs + off * 3600e3);
  let dayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const rollSec = 16 * 3600 + 61;   // 16:01:00 CT
  const sec = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  if (sec >= rollSec) dayMs += 86400e3;
  const dd = new Date(dayMs);
  const mm = String(dd.getUTCMonth() + 1).padStart(2, '0');
  const ddN = String(dd.getUTCDate()).padStart(2, '0');
  return `${dd.getUTCFullYear()}-${mm}-${ddN}`;
}
function activityDaysBetween(keyA, keyB) {
  const a = Date.parse(keyA + 'T12:00:00Z');
  const b = Date.parse(keyB + 'T12:00:00Z');
  return Math.round((b - a) / 86400e3);
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
    this.lastTradeDayKey = null;   // last FundedNext activity day with a trade
    this.activityAnchorDay = null; // chart-load anchor when no trade logged yet
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
    this.absorbZones = {};    // priceKey -> { price, bidVol, offerVol, firstTms, lastTms, tag }
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

  // Order-flow absorption ledger at key levels (Tradovate bid/offer split).
  // Bid absorption (green): sellers hit bids, price holds. Offer absorption
  // (red): buyers hit offers, price stalls. No L2 book — inferred from
  // bar delta + hold-at-level, same playbook semantics.
  _absorbKey(price, atr) {
    const step = Math.max(atr * 0.05, 0.1);
    return Math.round(price / step);
  }

  _trackLevelAbsorption(bar, atr) {
    const cfg = this.cfg;
    const n = this.dayBars.length;
    if (n < 5 || atr <= 0) return;
    const w = this.dayBars.slice(-cfg.sigStatWindow);
    const vmed = median(w.map(b => b.vol));
    const rmed = median(w.map(b => b.h - b.l));
    if (vmed <= 0 || rmed <= 0) return;
    const bidVol = bar.bidVol != null ? bar.bidVol
      : Math.max(0, (bar.vol - bar.delta) / 2);
    const offerVol = bar.offerVol != null ? bar.offerVol
      : Math.max(0, (bar.vol + bar.delta) / 2);
    const zone = 0.30 * atr;
    const churn = bar.vol >= 1.2 * vmed && (bar.h - bar.l) <= 1.0 * rmed;

    const levels = [];
    if (this.prev) levels.push({ price: this.prev.poc, tag: 'POC' });
    if (this.acc.level !== null) levels.push({ price: this.acc.level, tag: 'ACCUM' });
    if (this.htf) levels.push({ price: this.htf.poc, tag: 'HTF' });

    for (const lvl of levels) {
      if (bar.l > lvl.price + zone || bar.h < lvl.price - zone) continue;
      const holds = lvl.price >= bar.l - zone && lvl.price <= bar.h + zone;
      if (!holds) continue;

      const bidAbs = churn && bidVol >= offerVol * 1.05 &&
        bar.l >= lvl.price - zone;
      const offerAbs = churn && offerVol >= bidVol * 1.05 &&
        bar.h <= lvl.price + zone;

      if (!bidAbs && !offerAbs) continue;
      const key = this._absorbKey(lvl.price, atr);
      let z = this.absorbZones[key];
      if (!z) {
        z = { price: lvl.price, bidVol: 0, offerVol: 0,
          firstTms: bar.tMs, lastTms: bar.tMs, tag: lvl.tag };
        this.absorbZones[key] = z;
      }
      if (bidAbs) z.bidVol += bidVol;
      if (offerAbs) z.offerVol += offerVol;
      z.lastTms = bar.tMs;
      if (!z.tag && lvl.tag) z.tag = lvl.tag;
    }
  }

  _absorbZonesOut(vmed) {
    const zones = Object.values(this.absorbZones);
    if (!zones.length) return null;
    const minVol = vmed > 0 ? vmed * 0.5 : 0;
    const out = zones.filter(z => z.bidVol + z.offerVol >= minVol);
    return out.length ? out : null;
  }

  recordTradeActivity(tMs) {
    this.lastTradeDayKey = activityDayKey(tMs);
  }

  _activityOut(tMs) {
    const cfg = this.cfg;
    if (!cfg.trackActivity) return null;
    const today = activityDayKey(tMs);
    if (!this.activityAnchorDay) this.activityAnchorDay = today;
    const ref = this.lastTradeDayKey || this.activityAnchorDay;
    const daysSince = activityDaysBetween(ref, today);
    const maxIdle = Math.max(1, Number(cfg.activityMaxIdleDays) || 2);
    return {
      daysSince, maxIdle, today,
      lastTrade: this.lastTradeDayKey,
      urgent: daysSince >= maxIdle - 1,
      breach: daysSince >= maxIdle,
      rules: fnRulesFor(cfg.accountSize),
    };
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
      absorb: false, absorbZones: null, nakedPocs: null,
      sessionLabel: sessionWindowLabel(cfg),
      activity: null, fnRules: fnRulesFor(cfg.accountSize),
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
    const inWin = inTradeWindow(bar.tMs, cfg);
    const i = this.dayBars.length - 1;
    const sigW = this.dayBars.slice(-cfg.sigStatWindow);
    const vmedSig = median(sigW.map(b => b.vol));

    this._trackLevelAbsorption(bar, atr);
    out.absorbZones = this._absorbZonesOut(vmedSig);

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
    else if (P.armed && inPreLonBlackout(bar.tMs, cfg) && cfg.avoidPreLon &&
      (inAsianWindow(bar.tMs, cfg) || inNyWindow(bar.tMs, cfg)))
      out.status = 'stand down: pre-London manipulation hour (' +
        cfg.preLonStartHour + ':00-' + cfg.preLonEndHour + ':00 NY)';
    else if (P.armed) out.status = 'armed - outside trade window (' +
      sessionWindowLabel(cfg) + ' NY)';
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

    if (out.signal) this.recordTradeActivity(bar.tMs);
    out.activity = this._activityOut(bar.tMs);

    return out;
  }
}

// Node + Tradovate-module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DaleCore, buildProfile, stopBehindLVN, sessionKey, nyOffsetHours, CFG };
}
