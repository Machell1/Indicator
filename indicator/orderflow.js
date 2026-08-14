/*
 * orderflow.js -- pure footprint/executed-flow absorption sidecar.
 *
 * Tradovate's d.profile() rows describe EXECUTED volume at price. They do
 * not expose resting DOM size, cancellations, queue position, or icebergs.
 * Events produced here are therefore absorption candidates, not proof of
 * passive liquidity.
 */
'use strict';

const FLOW_DEFAULTS = {
  minVolume: 20,
  relativeVolume: 1.5,
  imbalanceRatio: 2.0,
  edgeFraction: 0.35,
  maxLevelsPerBar: 3,
};

function finite(v) {
  const n = Number(typeof v === 'function' ? v() : v);
  return Number.isFinite(n) ? n : null;
}

function field(row, names) {
  for (const name of names) {
    if (row && row[name] !== undefined) {
      const v = finite(row[name]);
      if (v !== null) return v;
    }
  }
  return null;
}

function normalizeProfile(raw) {
  if (!Array.isArray(raw)) return [];
  const rows = [];
  for (const r of raw) {
    const price = field(r, ['price']);
    const bid = field(r, ['bidVol', 'bidVolume', 'bid']);
    const ask = field(r, ['askVol', 'offerVol', 'offerVolume', 'ask']);
    let vol = field(r, ['vol', 'volume']);
    if (price === null || bid === null || ask === null || bid < 0 || ask < 0) continue;
    if (vol === null) vol = bid + ask;
    if (!(vol > 0)) continue;
    rows.push({ price, bid, ask, vol: Math.max(vol, bid + ask) });
  }
  rows.sort((a, b) => a.price - b.price);
  return rows;
}

function median(values) {
  if (!values.length) return 0;
  const a = values.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function detectFootprintAbsorption(raw, bar, options) {
  const cfg = Object.assign({}, FLOW_DEFAULTS, options || {});
  const rows = normalizeProfile(raw);
  if (rows.length < 2 || !bar || !(bar.h >= bar.l)) return [];
  const med = median(rows.map(r => r.vol));
  const range = Math.max(bar.h - bar.l, 1e-9);
  const threshold = Math.max(0, cfg.minVolume, med * Math.max(1, cfg.relativeVolume));
  const edge = Math.max(0.05, Math.min(0.5, cfg.edgeFraction));
  const ratioFloor = Math.max(1.01, cfg.imbalanceRatio);
  const hits = [];

  for (const r of rows) {
    if (r.vol < threshold) continue;
    const pos = (r.price - bar.l) / range;
    const sellRatio = r.bid / Math.max(1, r.ask);
    const buyRatio = r.ask / Math.max(1, r.bid);
    let long = null;
    let aggressorVolume = 0;
    let ratio = 0;
    let aggressor = '';
    if (pos <= edge && sellRatio >= ratioFloor) {
      // Sellers hit the bid at the lower edge but price held: bullish
      // demand/absorption candidate.
      long = true;
      aggressorVolume = r.bid;
      ratio = sellRatio;
      aggressor = 'BID';
    } else if (pos >= 1 - edge && buyRatio >= ratioFloor) {
      // Buyers lifted the offer at the upper edge but price held: bearish
      // supply/absorption candidate.
      long = false;
      aggressorVolume = r.ask;
      ratio = buyRatio;
      aggressor = 'ASK';
    }
    if (long === null) continue;
    const volumeScore = Math.min(1, r.vol / Math.max(threshold * 3, 1));
    const imbalanceScore = Math.min(1, (ratio - ratioFloor) / ratioFloor + 0.35);
    hits.push({
      price: r.price,
      long,
      aggressor,
      amount: Math.round(aggressorVolume),
      totalVolume: Math.round(r.vol),
      ratio,
      strength: Math.max(0.2, Math.min(1, 0.55 * volumeScore + 0.45 * imbalanceScore)),
      source: 'price-level executed bid/ask',
    });
  }

  hits.sort((a, b) =>
    (b.amount * b.ratio) - (a.amount * a.ratio));
  return hits.slice(0, Math.max(1, Math.round(cfg.maxLevelsPerBar)));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FLOW_DEFAULTS, normalizeProfile, detectFootprintAbsorption };
}
