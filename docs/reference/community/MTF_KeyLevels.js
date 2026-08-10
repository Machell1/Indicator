// ============================================================
// MTF Key Levels — Enhanced Edition
// Original: © Frien_dd  Mozilla Public License 2.0
// https://mozilla.org/MPL/2.0/
// Ported & Enhanced for Tradovate Custom Indicator (JavaScript)
// ============================================================
//
// WHAT'S NEW vs. V1
// ─────────────────
// [PERF]    Price-hash cache — skips full rebuild when levels
//           haven't changed; only rebuilds on new H/L or close tick
// [VISUAL]  Dashed lines for all prior-period levels (pdX, pwX, pmX)
//           Solid lines for current-period levels
// [VISUAL]  Lines span full chart width (du(0) → du(index + extend))
//           instead of the old short right-side stub
// [VISUAL]  Semi-transparent fill band behind every level line
// [VISUAL]  Glow effect (3 layered lines) on the level nearest to price
// [VISUAL]  Stacked labels — no text overlap when levels are close
// [VISUAL]  Dark-mode–optimised default colours
// [S/R]     Confluence zones — orange band when ≥2 levels cluster
//           within confluenceThreshold price units
// [LEVELS]  pmEQ  — monthly midpoint (same style as pdEQ / pwEQ)
// [LEVELS]  yEQ   — yearly midpoint
// [LEVELS]  pmktH / pmktL — pre-market session high & low
//           Configurable RTH start time (default 9:30 local)
//
// INSTALL
// ───────
//   1. Tradovate → Charts → Indicators → Custom → Code Explorer
//   2. File → New, paste entire file, Save (Ctrl+S)
//   3. Add to chart from the Custom section
//   Apply to an intraday chart (1m – 30m) for best results.
// ============================================================

const predef = require('./tools/predef');
const meta   = require('./tools/meta');
const { du } = require('./tools/graphics');

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - jan4) / 86400000 - 3 + (jan4.getDay() + 6) % 7) / 7);
}

function sameDay(a, b) {
    return a && b
        && a.getFullYear() === b.getFullYear()
        && a.getMonth()    === b.getMonth()
        && a.getDate()     === b.getDate();
}
function sameWeek(a, b) {
    return a && b
        && a.getFullYear() === b.getFullYear()
        && isoWeek(a)      === isoWeek(b);
}
function sameMonth(a, b) {
    return a && b
        && a.getFullYear() === b.getFullYear()
        && a.getMonth()    === b.getMonth();
}
function sameYear(a, b) {
    return a && b && a.getFullYear() === b.getFullYear();
}

// Converts a #RRGGBB hex colour to rgba() with an alpha channel.
// Falls back to the original string if the format isn't recognised
// (so user-entered rgba() colours still work fine).
function withAlpha(color, alpha) {
    if (typeof color === 'string' && color[0] === '#' && color.length >= 7) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
    return color;
}

// ── Calculator ────────────────────────────────────────────────────────────────

class MTFKeyLevels {

    init() {
        // Period boundary timestamps
        this.lastDay   = null;
        this.lastWeek  = null;
        this.lastMonth = null;
        this.lastYear  = null;

        // Current-period OHLC running values
        this.dOpen = 0;  this.dHigh = 0;  this.dLow = Infinity;
        this.wOpen = 0;  this.wHigh = 0;  this.wLow = Infinity;
        this.mOpen = 0;  this.mHigh = 0;  this.mLow = Infinity;
        this.yOpen = 0;  this.yHigh = 0;  this.yLow = Infinity;

        // Previous completed period snapshots
        this.pdOpen = 0;  this.pdHigh = 0;  this.pdLow = 0;
        this.pwOpen = 0;  this.pwHigh = 0;  this.pwLow = 0;
        this.pmOpen = 0;  this.pmHigh = 0;  this.pmLow = 0;

        // VWAP accumulators (sum of typicalPrice*volume, sum of volume)
        this.dvTP = 0;  this.dvVol = 0;
        this.wvTP = 0;  this.wvVol = 0;
        this.mvTP = 0;  this.mvVol = 0;
        this.yvTP = 0;  this.yvVol = 0;

        // Pre-market session H/L
        this.pmktHigh         = 0;
        this.pmktLow          = Infinity;
        this.lastPreMarketDay = null;

        // Graphics cache — only rebuilt when prices or nearest level changes
        this.cachedItems = [];
        this.prevHash    = '';
    }

    map(d, index) {
        const p   = this.props;
        const o   = d.open();
        const h   = d.high();
        const l   = d.low();
        const c   = d.close();
        const vol = d.volume ? d.volume() : 0;
        const tp  = (h + l + c) / 3;           // HLC/3 typical price
        const ts  = new Date(d.timestamp());

        // ── Period boundaries ─────────────────────────────────────────────────
        const newDay   = !sameDay(ts,   this.lastDay);
        const newWeek  = !sameWeek(ts,  this.lastWeek);
        const newMonth = !sameMonth(ts, this.lastMonth);
        const newYear  = !sameYear(ts,  this.lastYear);

        // ── Daily ─────────────────────────────────────────────────────────────
        if (newDay) {
            if (this.dHigh > 0) {
                this.pdOpen = this.dOpen;
                this.pdHigh = this.dHigh;
                this.pdLow  = this.dLow;
            }
            this.dOpen = o;  this.dHigh = h;  this.dLow = l;
            this.lastDay = ts;
            this.dvTP = tp * vol;  this.dvVol = vol;
        } else {
            this.dHigh = Math.max(this.dHigh, h);
            this.dLow  = Math.min(this.dLow,  l);
            this.dvTP += tp * vol;  this.dvVol += vol;
        }

        // ── Weekly ────────────────────────────────────────────────────────────
        if (newWeek) {
            if (this.wHigh > 0) {
                this.pwOpen = this.wOpen;
                this.pwHigh = this.wHigh;
                this.pwLow  = this.wLow;
            }
            this.wOpen = o;  this.wHigh = h;  this.wLow = l;
            this.lastWeek = ts;
            this.wvTP = tp * vol;  this.wvVol = vol;
        } else {
            this.wHigh = Math.max(this.wHigh, h);
            this.wLow  = Math.min(this.wLow,  l);
            this.wvTP += tp * vol;  this.wvVol += vol;
        }

        // ── Monthly ───────────────────────────────────────────────────────────
        if (newMonth) {
            if (this.mHigh > 0) {
                this.pmOpen = this.mOpen;
                this.pmHigh = this.mHigh;
                this.pmLow  = this.mLow;
            }
            this.mOpen = o;  this.mHigh = h;  this.mLow = l;
            this.lastMonth = ts;
            this.mvTP = tp * vol;  this.mvVol = vol;
        } else {
            this.mHigh = Math.max(this.mHigh, h);
            this.mLow  = Math.min(this.mLow,  l);
            this.mvTP += tp * vol;  this.mvVol += vol;
        }

        // ── Yearly ────────────────────────────────────────────────────────────
        if (newYear) {
            this.yOpen = o;  this.yHigh = h;  this.yLow = l;
            this.lastYear = ts;
            this.yvTP = tp * vol;  this.yvVol = vol;
        } else {
            this.yHigh = Math.max(this.yHigh, h);
            this.yLow  = Math.min(this.yLow,  l);
            this.yvTP += tp * vol;  this.yvVol += vol;
        }

        // ── VWAP values ───────────────────────────────────────────────────────
        const dvwap = this.dvVol > 0 ? this.dvTP / this.dvVol : 0;
        const wvwap = this.wvVol > 0 ? this.wvTP / this.wvVol : 0;
        const mvwap = this.mvVol > 0 ? this.mvTP / this.mvVol : 0;
        const yvwap = this.yvVol > 0 ? this.yvTP / this.yvVol : 0;

        // ── Pre-market H/L ────────────────────────────────────────────────────
        // Bars whose local-time hour:min falls before rthStartHour:rthStartMin
        // are counted as pre-market.  The H/L resets each calendar day.
        if (p.showPreMarket) {
            const localDecHour = ts.getHours() + ts.getMinutes() / 60;
            const rthStart     = p.rthStartHour + p.rthStartMin / 60;
            if (localDecHour < rthStart) {
                if (!sameDay(ts, this.lastPreMarketDay)) {
                    this.pmktHigh         = h;
                    this.pmktLow          = l;
                    this.lastPreMarketDay = ts;
                } else {
                    this.pmktHigh = Math.max(this.pmktHigh, h);
                    this.pmktLow  = Math.min(this.pmktLow,  l);
                }
            }
        }

        // ── Collect levels ────────────────────────────────────────────────────
        // Signature: add(show, price, color, lw, label, isDashed, extend)
        //   isDashed — true = prior-period level, rendered with a dash pattern
        const levels = [];
        const add = (show, price, color, lw, label, isDashed, extend) => {
            if (show && price > 0 && price !== Infinity) {
                levels.push({ price, color, lw, label, isDashed, extend, labelY: price });
            }
        };

        // Daily ───────────────────────────────────────────────────────────────
        add(p.showDOpen,  this.dOpen,  p.dailyColor, 1, 'dOpen',  false, p.dExtend);
        add(p.showDHigh,  this.dHigh,  p.dailyColor, 2, 'dHigh',  false, p.dExtend);
        add(p.showDLow,   this.dLow,   p.dailyColor, 2, 'dLow',   false, p.dExtend);
        add(p.showPDOpen, this.pdOpen, p.dailyColor, 1, 'pdOpen', true,  p.dExtend);
        add(p.showPDHigh, this.pdHigh, p.dailyColor, 1, 'pdHigh', true,  p.dExtend);
        add(p.showPDLow,  this.pdLow,  p.dailyColor, 1, 'pdLow',  true,  p.dExtend);
        if (p.showPDEQ && this.pdHigh > 0 && this.pdLow > 0 && this.pdLow !== Infinity) {
            add(true, (this.pdHigh + this.pdLow) / 2, p.dailyColor, 1, 'pdEQ', true, p.dExtend);
        }

        // Weekly ──────────────────────────────────────────────────────────────
        add(p.showWOpen,  this.wOpen,  p.weeklyColor, 1, 'wOpen',  false, p.wExtend);
        add(p.showWHigh,  this.wHigh,  p.weeklyColor, 2, 'wHigh',  false, p.wExtend);
        add(p.showWLow,   this.wLow,   p.weeklyColor, 2, 'wLow',   false, p.wExtend);
        add(p.showPWOpen, this.pwOpen, p.weeklyColor, 1, 'pwOpen', true,  p.wExtend);
        add(p.showPWHigh, this.pwHigh, p.weeklyColor, 1, 'pwHigh', true,  p.wExtend);
        add(p.showPWLow,  this.pwLow,  p.weeklyColor, 1, 'pwLow',  true,  p.wExtend);
        if (p.showPWEQ && this.pwHigh > 0 && this.pwLow > 0 && this.pwLow !== Infinity) {
            add(true, (this.pwHigh + this.pwLow) / 2, p.weeklyColor, 1, 'pwEQ', true, p.wExtend);
        }

        // Monthly ─────────────────────────────────────────────────────────────
        add(p.showMOpen,  this.mOpen,  p.monthlyColor, 1, 'mOpen',  false, p.mExtend);
        add(p.showMHigh,  this.mHigh,  p.monthlyColor, 2, 'mHigh',  false, p.mExtend);
        add(p.showMLow,   this.mLow,   p.monthlyColor, 2, 'mLow',   false, p.mExtend);
        add(p.showPMOpen, this.pmOpen, p.monthlyColor, 1, 'pmOpen', true,  p.mExtend);
        add(p.showPMHigh, this.pmHigh, p.monthlyColor, 1, 'pmHigh', true,  p.mExtend);
        add(p.showPMLow,  this.pmLow,  p.monthlyColor, 1, 'pmLow',  true,  p.mExtend);
        if (p.showPMEQ && this.pmHigh > 0 && this.pmLow > 0 && this.pmLow !== Infinity) {
            add(true, (this.pmHigh + this.pmLow) / 2, p.monthlyColor, 1, 'pmEQ', true, p.mExtend);
        }

        // Yearly ──────────────────────────────────────────────────────────────
        add(p.showYOpen, this.yOpen, p.yearlyColor, 1, 'yOpen', false, p.yExtend);
        add(p.showYHigh, this.yHigh, p.yearlyColor, 2, 'yHigh', false, p.yExtend);
        add(p.showYLow,  this.yLow,  p.yearlyColor, 2, 'yLow',  false, p.yExtend);
        if (p.showYEQ && this.yHigh > 0 && this.yLow > 0 && this.yLow !== Infinity) {
            add(true, (this.yHigh + this.yLow) / 2, p.yearlyColor, 1, 'yEQ', false, p.yExtend);
        }

        // VWAPs ───────────────────────────────────────────────────────────────
        add(p.showDVWAP, dvwap, p.dvwapColor, 2, 'D-VWAP', false, p.dExtend);
        add(p.showWVWAP, wvwap, p.wvwapColor, 2, 'W-VWAP', false, p.wExtend);
        add(p.showMVWAP, mvwap, p.mvwapColor, 2, 'M-VWAP', false, p.mExtend);
        add(p.showYVWAP, yvwap, p.yvwapColor, 2, 'Y-VWAP', false, p.yExtend);

        // Pre-market ──────────────────────────────────────────────────────────
        // pmktHigh starts at 0 and pmktLow at Infinity so add() naturally
        // filters them until real pre-market bars have been processed.
        add(p.showPreMarket, this.pmktHigh, p.pmktColor, 1, 'pmktH', true, p.dExtend);
        add(p.showPreMarket, this.pmktLow,  p.pmktColor, 1, 'pmktL', true, p.dExtend);

        // ── Performance cache ─────────────────────────────────────────────────
        // Rebuild graphics only when a level price changed OR the nearest-level
        // glow needs to move (tracked via close price in the hash).
        const hash = levels.map(lv => lv.price.toFixed(4)).join(',')
                   + '|' + c.toFixed(4);
        if (hash === this.prevHash) {
            return { graphics: { items: this.cachedItems } };
        }
        this.prevHash = hash;

        // ── Nearest level to current close (glow target) ──────────────────────
        let nearestIdx  = -1;
        let nearestDist = Infinity;
        levels.forEach((lv, i) => {
            const dist = Math.abs(lv.price - c);
            if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
        });

        // ── Confluence detection ──────────────────────────────────────────────
        // Find groups of levels within confluenceThreshold of each other.
        // Produces: confluentPrices (Set) for per-line band-alpha styling,
        //           confluenceBands  (Array<{lo,hi}>) for background zones.
        const threshold       = p.confluenceThreshold || 0;
        const confluentPrices = new Set();
        const confluenceBands = [];

        if (threshold > 0 && p.showConfluence) {
            const sp = [...levels].sort((a, b) => a.price - b.price);
            let i = 0;
            while (i < sp.length - 1) {
                if (sp[i + 1].price - sp[i].price <= threshold) {
                    let lo = sp[i].price;
                    let hi = sp[i + 1].price;
                    confluentPrices.add(lo);
                    confluentPrices.add(hi);
                    let j = i + 1;
                    while (j + 1 < sp.length
                           && sp[j + 1].price - sp[j].price <= threshold) {
                        j++;
                        hi = sp[j].price;
                        confluentPrices.add(hi);
                    }
                    confluenceBands.push({ lo, hi });
                    i = j + 1;
                } else {
                    i++;
                }
            }
        }

        // ── Label stacking ────────────────────────────────────────────────────
        // When two labels would sit within labelSpacing price units of each
        // other, the lower one is nudged downward so they never overlap.
        // Tune labelSpacing per-instrument: ~2.0 for ES, ~5.0 for NQ.
        if (p.labelSpacing > 0) {
            const sorted = [...levels].sort((a, b) => b.price - a.price);
            let lastY = null;
            sorted.forEach(lv => {
                if (lastY !== null && lastY - lv.price < p.labelSpacing) {
                    lv.labelY = lastY - p.labelSpacing;
                } else {
                    lv.labelY = lv.price;
                }
                lastY = lv.labelY;
            });
        }

        // ── Build graphics items ──────────────────────────────────────────────
        const items  = [];
        const maxExt = Math.max(p.dExtend, p.wExtend, p.mExtend, p.yExtend);

        // 1. Confluence background zones (drawn first — behind all level lines)
        confluenceBands.forEach((band, bi) => {
            const mid = (band.lo + band.hi) / 2;
            items.push({
                tag: 'Container',
                key: `conf${bi}`,
                children: [
                    // Wide semi-transparent fill centred on zone midpoint
                    {
                        tag: 'LineSegment',
                        key: `conf${bi}_fill`,
                        a: { x: du(0), y: mid },
                        b: { x: du(index + maxExt), y: mid },
                        lineStyle: { lineWidth: 16, color: withAlpha(p.confluenceColor, 0.16) }
                    },
                    // Dashed top boundary
                    {
                        tag: 'LineSegment',
                        key: `conf${bi}_hi`,
                        a: { x: du(0), y: band.hi },
                        b: { x: du(index + maxExt), y: band.hi },
                        lineStyle: { lineWidth: 1, color: withAlpha(p.confluenceColor, 0.40), dash: [3, 3] }
                    },
                    // Dashed bottom boundary
                    {
                        tag: 'LineSegment',
                        key: `conf${bi}_lo`,
                        a: { x: du(0), y: band.lo },
                        b: { x: du(index + maxExt), y: band.lo },
                        lineStyle: { lineWidth: 1, color: withAlpha(p.confluenceColor, 0.40), dash: [3, 3] }
                    }
                ]
            });
        });

        // 2. Individual level lines + labels ──────────────────────────────────
        levels.forEach((lv, i) => {
            const isNearest = p.showNearestGlow && i === nearestIdx;
            const isConfl   = confluentPrices.has(lv.price);
            const lineColor = isNearest ? p.nearestColor : lv.color;
            const lineWidth = isNearest ? lv.lw + 1 : lv.lw;
            const bandAlpha = isConfl ? 0.18 : 0.10;

            // Lines run from the very first loaded bar (du(0)) to the
            // current bar plus the user-configured extension stub.
            const x0 = du(0);
            const x1 = du(index + lv.extend);

            const displayTxt = p.showPrice
                ? `${lv.label}  ${lv.price.toFixed(2)}`
                : lv.label;

            // Prior-period lines use a dash pattern; current-period are solid.
            const lineStyle = lv.isDashed
                ? { lineWidth, color: lineColor, dash: [6, 4] }
                : { lineWidth, color: lineColor };

            const children = [];

            // — Semi-transparent fill band behind the main line ———————————————
            children.push({
                tag: 'LineSegment',
                key: `lv${i}_band`,
                a: { x: x0, y: lv.price },
                b: { x: x1, y: lv.price },
                lineStyle: { lineWidth: 7, color: withAlpha(lv.color, bandAlpha) }
            });

            // — Glow: three concentric soft lines for the nearest level ————————
            if (isNearest) {
                children.push({
                    tag: 'LineSegment', key: `lv${i}_glow3`,
                    a: { x: x0, y: lv.price }, b: { x: x1, y: lv.price },
                    lineStyle: { lineWidth: 15, color: withAlpha(p.nearestColor, 0.05) }
                });
                children.push({
                    tag: 'LineSegment', key: `lv${i}_glow2`,
                    a: { x: x0, y: lv.price }, b: { x: x1, y: lv.price },
                    lineStyle: { lineWidth: 9, color: withAlpha(p.nearestColor, 0.12) }
                });
                children.push({
                    tag: 'LineSegment', key: `lv${i}_glow1`,
                    a: { x: x0, y: lv.price }, b: { x: x1, y: lv.price },
                    lineStyle: { lineWidth: 5, color: withAlpha(p.nearestColor, 0.22) }
                });
            }

            // — Main precise line (solid current / dashed prior) ———————————————
            children.push({
                tag: 'LineSegment', key: `lv${i}_l`,
                a: { x: x0, y: lv.price },
                b: { x: x1, y: lv.price },
                lineStyle
            });

            // — Label with stacked Y so no two labels overlap ——————————————————
            children.push({
                tag:           'Text',
                key:           `lv${i}_t`,
                point:         { x: x1, y: lv.labelY },
                text:          displayTxt,
                style:         { fontSize: isNearest ? 11 : 10, fill: lineColor },
                textAlignment: 'rightMiddle'
            });

            items.push({ tag: 'Container', key: `lv${i}`, children });
        });

        this.cachedItems = items;
        return { graphics: { items } };
    }
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
    name:        'mtfKeyLevels',
    description: 'MTF Key Levels (S/R) — Enhanced',
    calculator:  MTFKeyLevels,
    inputType:   meta.InputType.BARS,
    tags:        ['Support/Resistance'],

    params: {
        // ── Daily ─────────────────────────────────────────────────────────────
        showDOpen:   predef.paramSpecs.bool(true),
        showDHigh:   predef.paramSpecs.bool(true),
        showDLow:    predef.paramSpecs.bool(true),
        showPDOpen:  predef.paramSpecs.bool(true),
        showPDHigh:  predef.paramSpecs.bool(true),
        showPDLow:   predef.paramSpecs.bool(true),
        showPDEQ:    predef.paramSpecs.bool(true),
        dailyColor:  predef.paramSpecs.color('#5B8FF9'),   // bright periwinkle blue
        dExtend:     predef.paramSpecs.number(25, 1, 0),

        // ── Weekly ────────────────────────────────────────────────────────────
        showWOpen:   predef.paramSpecs.bool(true),
        showWHigh:   predef.paramSpecs.bool(true),
        showWLow:    predef.paramSpecs.bool(true),
        showPWOpen:  predef.paramSpecs.bool(true),
        showPWHigh:  predef.paramSpecs.bool(true),
        showPWLow:   predef.paramSpecs.bool(true),
        showPWEQ:    predef.paramSpecs.bool(true),
        weeklyColor: predef.paramSpecs.color('#F5C842'),   // warm gold
        wExtend:     predef.paramSpecs.number(35, 1, 0),

        // ── Monthly ───────────────────────────────────────────────────────────
        showMOpen:    predef.paramSpecs.bool(true),
        showMHigh:    predef.paramSpecs.bool(true),
        showMLow:     predef.paramSpecs.bool(true),
        showPMOpen:   predef.paramSpecs.bool(true),
        showPMHigh:   predef.paramSpecs.bool(true),
        showPMLow:    predef.paramSpecs.bool(true),
        showPMEQ:     predef.paramSpecs.bool(true),        // NEW
        monthlyColor: predef.paramSpecs.color('#A68BE8'),  // medium purple
        mExtend:      predef.paramSpecs.number(45, 1, 0),

        // ── Yearly ────────────────────────────────────────────────────────────
        showYOpen:   predef.paramSpecs.bool(true),
        showYHigh:   predef.paramSpecs.bool(true),
        showYLow:    predef.paramSpecs.bool(true),
        showYEQ:     predef.paramSpecs.bool(true),         // NEW
        yearlyColor: predef.paramSpecs.color('#F76060'),   // soft coral-red
        yExtend:     predef.paramSpecs.number(55, 1, 0),

        // ── VWAPs ─────────────────────────────────────────────────────────────
        showDVWAP:  predef.paramSpecs.bool(true),
        showWVWAP:  predef.paramSpecs.bool(true),
        showMVWAP:  predef.paramSpecs.bool(true),
        showYVWAP:  predef.paramSpecs.bool(true),
        dvwapColor: predef.paramSpecs.color('#5B8FF9'),
        wvwapColor: predef.paramSpecs.color('#F5C842'),
        mvwapColor: predef.paramSpecs.color('#A68BE8'),
        yvwapColor: predef.paramSpecs.color('#F76060'),

        // ── Pre-market ────────────────────────────────────────────────────────
        // Uses local (browser) time.  Adjust rthStartHour / rthStartMin if
        // your machine clock doesn't match the exchange session open.
        showPreMarket: predef.paramSpecs.bool(true),       // NEW
        pmktColor:     predef.paramSpecs.color('#50C878'), // emerald green
        rthStartHour:  predef.paramSpecs.number(9,  1, 0),
        rthStartMin:   predef.paramSpecs.number(30, 1, 0),

        // ── Confluence ────────────────────────────────────────────────────────
        // Levels within confluenceThreshold price units of each other are
        // highlighted as a zone.  Set confluenceThreshold to 0 to disable.
        showConfluence:      predef.paramSpecs.bool(true), // NEW
        confluenceThreshold: predef.paramSpecs.number(2.0, 0.25, 0),
        confluenceColor:     predef.paramSpecs.color('#FFA500'),

        // ── Visual ────────────────────────────────────────────────────────────
        showNearestGlow: predef.paramSpecs.bool(true),          // NEW
        nearestColor:    predef.paramSpecs.color('#00D4FF'),     // electric cyan
        // Min price gap between label Y positions.  Increase until labels
        // stop overlapping for your instrument (e.g. 2.0 ES, 5.0 NQ, 0.5 CL).
        labelSpacing:    predef.paramSpecs.number(2.0, 0.25, 0), // NEW
        showPrice:       predef.paramSpecs.bool(false),
    },

    schemeStyles: { dark: {} }
};
