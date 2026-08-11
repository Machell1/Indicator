"""
Diagnostics for dale_scalp: verify the two surprising results before they
are reported as findings.

  1. NY 09:00-11:00 returned n=0 for the stack. That is either a real
     property of the strategy or a bug in the time indexing. Print the
     actual entry-hour histogram to settle it.
  2. Multi-entry raised the stack from n=10 to n=17 but LOWERED E[R].
     Split first-touch vs later-touch to see whether the extra signals
     are the cause.
  3. Size the risk in points and dollars -- an R-multiple says nothing
     about whether the stop is scalp-sized.
"""

from __future__ import annotations

import glob
import os
from collections import defaultdict, deque

import numpy as np

from dale_tv import load_tv, session_key, build_profile, stop_behind_lvn, NY
from dale_scalp import (atr_of, stack_events, find_rotations, accum_events,
                        run_config, show, GC_COST, MGC_COST, ROWS, MIN_VOL, HTF_N)

MGC_PER_POINT = 10.0     # $ per point, micro gold


def main():
    files = sorted(glob.glob(os.path.join("..", "data_tv", "TV_*_1min.csv")))
    stack_by_day, accum_by_day = {}, {}
    first_by_day, later_by_day = {}, {}
    hours = defaultdict(int)
    ahours = defaultdict(int)
    Rpts_s, Rpts_a = [], []

    for f in files:
        bars = load_tv(f)
        sess = defaultdict(list)
        for b in bars:
            sess[session_key(b["t"])].append(b)
        prev = None; hist = deque(maxlen=HTF_N); prev_bars = None
        for day in sorted(sess):
            g = sess[day]
            if (sum(b["vol"] for b in g) >= MIN_VOL and len(g) >= 120
                    and prev is not None and len(hist) >= 5):
                atr = atr_of(g)
                if atr > 0:
                    cl = np.array([b["c"] for b in g]); hi = np.array([b["h"] for b in g])
                    lo = np.array([b["l"] for b in g]); dl = np.array([b["delta"] for b in g])
                    vl = np.array([b["vol"] for b in g]); rng = hi - lo
                    n = len(g)
                    tmin = np.array([b["t"].astimezone(NY).hour * 60 +
                                     b["t"].astimezone(NY).minute for b in g])
                    ev = stack_events(g, prev["poc"], atr, n, cl, hi, lo, dl, vl, rng)
                    if ev:
                        ev = sorted(ev, key=lambda x: x["j"])
                        stack_by_day[day] = (ev, cl, hi, lo, n, tmin)
                        first_by_day[day] = (ev[:1], cl, hi, lo, n, tmin)
                        if len(ev) > 1:
                            later_by_day[day] = (ev[1:], cl, hi, lo, n, tmin)
                        for E in ev:
                            hours[tmin[E["j"]] // 60] += 1
                            Rpts_s.append(abs(E["e"] - E["sl"]))
                    concat = (prev_bars or []) + g
                    R_ = find_rotations(concat, atr)
                    if R_:
                        aev = accum_events(R_, len(prev_bars or []), atr, n, cl, hi, lo)
                        if aev:
                            accum_by_day[day] = (aev, cl, hi, lo, n, tmin)
                            for E in aev:
                                ahours[tmin[E["j"]] // 60] += 1
                                Rpts_a.append(abs(E["e"] - E["sl"]))
            if len(g) >= 30 and sum(b["vol"] for b in g) > 0:
                pr = build_profile(g, max((max(b["h"] for b in g) -
                                           min(b["l"] for b in g)) / ROWS, 1e-9))
                if pr:
                    prev = pr
                hist.append(g); prev_bars = g

    print("\n1. ENTRY HOUR (New York time) -- is the NY-window n=0 real?")
    print("   stack:", "  ".join(f"{h:02d}h:{c}" for h, c in sorted(hours.items())))
    print("   accum:", "  ".join(f"{h:02d}h:{c}" for h, c in sorted(ahours.items())))
    ins = sum(c for h, c in hours.items() if 9 <= h < 11)
    ina = sum(c for h, c in ahours.items() if 9 <= h < 11)
    print(f"   -> inside 09:00-11:00 NY:  stack {ins}/{sum(hours.values())}"
          f"   accum {ina}/{sum(ahours.values())}")

    print("\n2. FIRST TOUCH vs LATER TOUCHES (stack) -- does multi-entry dilute?")
    for tp, mb, lbl in ((1.0, 60, "TP1.0R/60m"), (2.0, 60, "TP2.0R/60m"),
                        (1.0, None, "TP1.0R/close")):
        for nm, store in (("first touch only", first_by_day),
                          ("later touches   ", later_by_day),
                          ("all touches     ", stack_by_day)):
            rs, hd = run_config(store, tp, mb, MGC_COST)
            show(f"{lbl} {nm}", rs, hd, seed=int(tp * 10) + (mb or 0))
        print()

    print("3. RISK SIZE -- is the stop actually scalp-sized?")
    for nm, arr in (("stack", Rpts_s), ("accum", Rpts_a)):
        if arr:
            a = np.array(arr)
            print(f"   {nm}: R median {np.median(a):.2f} pts "
                  f"(${np.median(a)*MGC_PER_POINT:.0f} on 1 MGC)  "
                  f"min {a.min():.2f}  max {a.max():.2f}  "
                  f"mean {a.mean():.2f} pts (${a.mean()*MGC_PER_POINT:.0f})")

    print("\n4. DOLLARS at 1 MGC, best scalp-ish config vs best hold config")
    for nm, store, Rarr in (("stack", stack_by_day, Rpts_s),
                            ("accum", accum_by_day, Rpts_a)):
        med = float(np.median(Rarr)) if Rarr else 0.0
        for tp, mb, lbl in ((0.5, 15, "scalp  TP0.5R/15m"),
                            (1.0, 30, "middle TP1.0R/30m"),
                            (2.0, 60, "hold   TP2.0R/60m")):
            rs, _ = run_config(store, tp, mb, MGC_COST)
            if rs:
                tot = float(np.sum(rs)) * med * MGC_PER_POINT
                print(f"   {nm} {lbl}: n={len(rs):<3} "
                      f"{np.sum(rs):+6.1f}R  ~= ${tot:+,.0f} over 86 sessions "
                      f"(1 contract, R~${med*MGC_PER_POINT:.0f})")


if __name__ == "__main__":
    main()
