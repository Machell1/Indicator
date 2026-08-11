"""
Does the strategy actually NEED 1-minute bars, or was that calibration
inherited rather than earned?

Re-bins the same GCQ6 tape to 1/5/15-minute bars and re-runs the SAME
detection and the SAME exit rule on each. Everything scale-dependent is
normalised so the comparison is fair:

  - ATR proxy: mean(bar range) * (30 / barMin), so it always represents
    ~30 minutes of range regardless of bar size;
  - session liquidity gate: >=120 one-minute-equivalents;
  - signature search windows (15 bars for absorption, 5 for initiative)
    are expressed in MINUTES and converted, so a 5M chart looks over the
    same wall-clock span as a 1M chart rather than 5x longer;
  - exit: TP 2.0R with a 60-minute cap (the one config that was positive
    AND chronologically stable), cap in minutes, not bars.

If 1-minute calibration is earning its keep, the coarser rows should be
visibly worse. If they are not, the 1M requirement is costing the trader
the HTF composite for nothing.
"""

from __future__ import annotations

import glob
import os
from collections import defaultdict, deque

import numpy as np

from dale_tv import load_tv, session_key, build_profile, stop_behind_lvn
from stats import stationary_bootstrap_mean

ROWS = 80
MIN_VOL = 2000
HTF_N = 20
MGC_COST = 0.11
REARM_ATR = 0.5


def rebin(bars, m):
    """Aggregate 1-minute bars into m-minute bars on wall-clock boundaries."""
    if m == 1:
        return bars
    out = []
    cur = None
    for b in bars:
        k = (b["t"].timestamp() // (60 * m))
        if cur is None or cur["k"] != k:
            if cur:
                out.append(cur["b"])
            cur = {"k": k, "b": dict(t=b["t"], o=b["o"], h=b["h"], l=b["l"],
                                     c=b["c"], vol=b["vol"], delta=b["delta"])}
        else:
            x = cur["b"]
            x["h"] = max(x["h"], b["h"]); x["l"] = min(x["l"], b["l"])
            x["c"] = b["c"]; x["vol"] += b["vol"]; x["delta"] += b["delta"]
    if cur:
        out.append(cur["b"])
    return out


def run_tf(bars1, m):
    bars = rebin(bars1, m)
    sess = defaultdict(list)
    for b in bars:
        sess[session_key(b["t"])].append(b)
    prev = None; hist = deque(maxlen=HTF_N); prev_bars = None
    rs = []; nsig = 0; nsess = 0
    ABS_W = max(1, round(15 / m))       # 15 minutes of absorption search
    INI_W = max(1, round(5 / m))        # 5 minutes of initiative search
    CAP   = max(1, round(60 / m))       # 60-minute time stop
    MINB  = max(20, round(120 / m))

    for day in sorted(sess):
        g = sess[day]
        if (sum(b["vol"] for b in g) >= MIN_VOL and len(g) >= MINB
                and prev is not None and len(hist) >= 5):
            atr = float(np.mean([b["h"] - b["l"] for b in g])) * (30.0 / m)
            if atr > 0:
                nsess += 1
                cl = np.array([b["c"] for b in g]); hi = np.array([b["h"] for b in g])
                lo = np.array([b["l"] for b in g]); dl = np.array([b["delta"] for b in g])
                vl = np.array([b["vol"] for b in g]); rng = hi - lo
                n = len(g); poc = prev["poc"]
                vmed = float(np.median(vl)); rmed = float(np.median(rng))
                d75 = float(np.percentile(np.abs(dl), 75))
                armed = True
                i = max(2, round(5 / m))
                tail = max(5, round(30 / m))
                while i < n - tail:
                    if not armed:
                        if abs(cl[i] - poc) >= REARM_ATR * atr:
                            armed = True
                        i += 1; continue
                    if not (lo[i] <= poc <= hi[i]):
                        i += 1; continue
                    i0 = i; armed = False
                    long = cl[i0 - 1] > poc
                    ej = -1
                    for j in range(i0, min(i0 + ABS_W, n - max(3, round(20 / m)))):
                        ab = (vl[j] >= 1.3 * vmed and rng[j] <= 0.9 * rmed and
                              ((long and lo[j] > poc - 0.30 * atr) or
                               ((not long) and hi[j] < poc + 0.30 * atr)))
                        if not ab:
                            continue
                        for kk in range(j + 1, min(j + 1 + INI_W, n - max(2, round(15 / m)))):
                            if (abs(dl[kk]) >= d75 and
                                    ((long and dl[kk] > 0) or ((not long) and dl[kk] < 0))):
                                ej = kk; break
                        if ej > 0:
                            break
                    if ej > 0:
                        e = cl[ej]
                        react = (min(lo[i0:ej + 1]) - 0.10 * atr) if long \
                            else (max(hi[i0:ej + 1]) + 0.10 * atr)
                        if (react < e) if long else (react > e):
                            nsig += 1
                            R = abs(e - react); dirn = 1 if long else -1
                            tp = e + dirn * 2.0 * R
                            last = min(n, ej + 1 + CAP)
                            got = None
                            for z in range(ej + 1, last):
                                if (lo[z] <= react) if long else (hi[z] >= react):
                                    got = (-R - MGC_COST) / R; break
                                if (hi[z] >= tp) if long else (lo[z] <= tp):
                                    got = (abs(tp - e) - MGC_COST) / R; break
                            if got is None:
                                px = cl[last - 1]
                                gv = (px - e) if long else (e - px)
                                got = (gv - MGC_COST) / R
                            rs.append(got)
                        i = ej + 1
                    else:
                        i = i0 + 1
        if len(g) >= max(10, round(30 / m)) and sum(b["vol"] for b in g) > 0:
            pr = build_profile(g, max((max(b["h"] for b in g) -
                                       min(b["l"] for b in g)) / ROWS, 1e-9))
            if pr:
                prev = pr
            hist.append(g); prev_bars = g
    return rs, nsig, nsess


def main():
    files = sorted(glob.glob(os.path.join("..", "data_tv", "TV_*_1min.csv")))
    bars1 = []
    for f in files:
        bars1 += load_tv(f)
    bars1.sort(key=lambda b: b["t"])

    print("\nPRIOR-POC EXECUTION STACK, same rule, re-binned tape")
    print("exit = TP 2.0R / 60-minute cap, MGC cost, windows held constant in MINUTES\n")
    for m in (1, 5, 15):
        rs, nsig, nsess = run_tf(bars1, m)
        if rs:
            b = stationary_bootstrap_mean(rs, 4000, 5.0, 0.95, 11 + m)
            print(f"  {m:>2}-minute bars  sessions={nsess:<3} n={len(rs):<3} "
                  f"E[R]={np.mean(rs):+.3f}  tot={np.sum(rs):+5.1f}R  "
                  f"win={100*np.mean([x>0 for x in rs]):3.0f}%  "
                  f"CI[{b.lower:+.3f},{b.upper:+.3f}]")
        else:
            print(f"  {m:>2}-minute bars  sessions={nsess:<3} n=0  "
                  f"(signature never completed)")


if __name__ == "__main__":
    main()
