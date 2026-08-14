'use strict';

const assert = require('assert');
const {
  normalizeProfile,
  detectFootprintAbsorption,
} = require('./orderflow');
const { inNyWindow } = require('./dale_core');

const profile = [
  { price: 100, vol: 90, bidVol: 75, askVol: 15 },
  { price: 101, vol: 20, bidVol: 10, askVol: 10 },
  { price: 102, vol: 30, bidVol: 15, askVol: 15 },
  { price: 103, vol: 100, bidVol: 20, askVol: 80 },
];
const bar = { l: 100, h: 103, o: 101, c: 102, vol: 240 };
const hits = detectFootprintAbsorption(profile, bar, {
  minVolume: 20,
  relativeVolume: 1.5,
  imbalanceRatio: 2,
  maxLevelsPerBar: 4,
});

assert.strictEqual(hits.length, 2);
const bull = hits.find(h => h.long);
const bear = hits.find(h => !h.long);
assert(bull && bull.price === 100 && bull.aggressor === 'BID' && bull.amount === 75);
assert(bear && bear.price === 103 && bear.aggressor === 'ASK' && bear.amount === 80);
assert(hits.every(h => h.strength >= 0.2 && h.strength <= 1));

assert.deepStrictEqual(normalizeProfile(undefined), []);
assert.deepStrictEqual(normalizeProfile([{ price: 1, bidVol: -1, askVol: 2 }]), []);
assert.strictEqual(detectFootprintAbsorption(profile, bar, {
  minVolume: 1000,
}).length, 0);

const asia = {
  signalStartMinute: 18 * 60,
  signalEndMinute: 2 * 60,
  nyStartHour: 9,
  nyEndHour: 11,
};
assert.strictEqual(inNyWindow(Date.parse('2026-08-15T01:59:00Z'), asia), true); // 21:59 NY
assert.strictEqual(inNyWindow(Date.parse('2026-08-15T05:59:00Z'), asia), true); // 01:59 NY
assert.strictEqual(inNyWindow(Date.parse('2026-08-15T06:00:00Z'), asia), false); // 02:00 NY

console.log('RESULT: PASS -- footprint absorption + Asian window');
