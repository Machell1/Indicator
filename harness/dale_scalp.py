"""
SCALPING variant -- same signals, 1-minute execution, scalp exits.

The graded numbers (stack +0.403R n=10, accum +0.282R n=12) come from a
POSITION test that happens to run on 1-minute bars: one trade per setup
per session, target at the nearest prior POC ahead, held to the session
close if neither side is touched. That is not scalping.

This script changes the two things that make it scalping and holds
everything else identical to dale_v5, so the comparison is honest:

  1. MULTI-ENTRY. dale_v5 takes the FIRST qualifying touch per session
     and stops looking. Here every touch is a candidate: after an attempt
     the level must be vacated by REARM_ATR before it can fire again.
     Frequency is the point of scalping, and n=10 in 86 sessions is not a
     scalping sample.
  2. SCALP EXITS. Fixed R-multiple targets and a hard time stop, instead
     of a structural POC target held to the close.

Entry logic, stop placement, session definition, profile math and the
pessimistic same-bar fill rule are UNCHANGED from dale_v5.

Signals are detected ONCE and replayed through every exit configuration,
so differences between rows are caused by the exit rule alone.

Realism rules applied:
  - no new entry while a trade is open (one contract, no stacking);
  - same-bar stop+target resolves as a STOP (pessimistic);
  - cost is charged per round trip, and is swept across both contracts:
    GC 0.05 pts vs MGC 0.11 pts. The trader executes MGC, and scalping
    pays that cost more often, so it is reported separately rather than
    buried in an average.
"""

from __future__ import annotations

import glob
import os
from collections import defaultdict, deque

import numpy as np

from dale_tv import load_tv, session_key, build_profile, stop_behind_lvn
from stats import stationary_bootstrap_mean

ROWS      = 80
MIN_VOL   = 2000
HTF_N     = 20
REARM_ATR = 0.5          # level must be vacated by this before re-firing
ROT_MIN_BARS  = 30
ROT_MAX_ATR   = 1.5
ROT_BREAK_ATR = 1.0

GC_COST  = 0.05
MGC_COST = 0.11

NY_START, NY_END = 9, 11


def atr_of(g):
    r = [b["h"] - b["l"] for b in g]
    return float(np.mean(r)) * 30.0 if r else 0.0


# ---------------------------------------------------------------- signals

def stack_events(g, poc, atr, n, cl, hi, lo, dl, vl, rng):
    """EVERY prior-POC touch that completes the absorption->initiative
    signature. Windows and thresholds identical to dale_v5; only the
    'stop after the first one' restriction is lifted."""
    vmed = float(np.median(vl)); rmed = float(np.median(rng))
    d75  = float(np.percentile(np.abs(dl), 75))
    out = []
    armed = True                      # first touch of the session is live
    i = 5
    while i < n - 30:
        if not armed:
            if abs(cl[i] - poc) >= REARM_ATR * atr:
                armed = True
            i += 1
            continue
        if not (lo[i] <= poc <= hi[i]):
            i += 1
            continue
        i0 = i
        armed = False                 # consumed: must vacate to re-arm
        long = cl[i0 - 1] > poc
        entry_j = -1
        for j in range(i0, min(i0 + 15, n - 20)):
            ab = (vl[j] >= 1.3 * vmed and rng[j] <= 0.9 * rmed and
                  ((long and lo[j] > poc - 0.30 * atr) or
                   ((not long) and hi[j] < poc + 0.30 * atr)))
            if not ab:
                continue
            for kk in range(j + 1, min(j + 6, n - 15)):
                if (abs(dl[kk]) >= d75 and
                        ((long and dl[kk] > 0) or ((not long) and dl[kk] < 0))):
                    entry_j = kk
                    break
            if entry_j > 0:
                break
        if entry_j > 0:
            e = cl[entry_j]
            react = (min(lo[i0:entry_j + 1]) - 0.10 * atr) if long \
                else (max(hi[i0:entry_j + 1]) + 0.10 * atr)
            if (react < e) if long else (react > e):
                out.append(dict(j=entry_j, e=e, sl=react, long=long))
            i = entry_j + 1
        else:
            i = i0 + 1
    return out


def find_rotations(concat, atr):
    h = np.array([b["h"] for b in concat]); l = np.array([b["l"] for b in concat])
    c = np.array([b["c"] for b in concat])
    n = len(concat)
    L = ROT_MIN_BARS
    e = n - 1 - L
    while e >= L:
        wHi = h[e - L + 1:e + 1].max(); wLo = l[e - L + 1:e + 1].min()
        if wHi - wLo > ROT_MAX_ATR * atr:
            e -= 5
            continue
        s = e - L + 1
        while s > 0:
            nh = max(wHi, h[s - 1]); nl = min(wLo, l[s - 1])
            if nh - nl > ROT_MAX_ATR * atr:
                break
            wHi, wLo, s = nh, nl, s - 1
        up = dn = False; ext = 0.0; comp = -1; dead = False
        for j in range(e + 1, n):
            if not up and not dn:
                if c[j] > wHi + 0.2 * atr: up = True
                elif c[j] < wLo - 0.2 * atr: dn = True
                continue
            if up:
                ext = max(ext, h[j] - wHi)
                if c[j] < wLo - 0.2 * atr: dead = True; break
            else:
                ext = max(ext, wLo - l[j])
                if c[j] > wHi + 0.2 * atr: dead = True; break
            if ext >= ROT_BREAK_ATR * atr and comp < 0:
                comp = j
        if comp > 0 and not dead:
            step = max((wHi - wLo + 2 * atr) / ROWS, 1e-9)
            prof = build_profile(concat[s:e + 1], step)
            if prof:
                return dict(s=s, e=e, comp=comp, poc=prof["poc"],
                            prof=prof, down=dn)
        e = s - 5
    return None


def accum_events(R_, off, atr, n, cl, hi, lo):
    """Every retest of the rotation POC after the breakout completes."""
    lvl  = R_["poc"]
    long = not R_["down"]
    start = max(R_["comp"] + 1 - off, 1)
    if start >= n - 10:
        return []
    sl = stop_behind_lvn(R_["prof"], long, atr)
    out = []
    armed = was_out = False
    maxd = 0.0
    for i in range(start, n - 5):
        d = abs(cl[i] - lvl)
        if d > maxd: maxd = d
        if d > 0.10 * atr: was_out = True
        if not armed and maxd >= 1.0 * atr: armed = True
        if not (armed and was_out):
            continue
        touch = (lo[i] <= lvl) if long else (hi[i] >= lvl)
        if touch:
            if (sl < lvl) if long else (sl > lvl):
                out.append(dict(j=i, e=lvl, sl=sl, long=long))
            armed = was_out = False
            maxd = 0.0
    return out


# ------------------------------------------------------------- simulation

def run_config(events_by_day, tp_mult, max_bars, cost, ny_only=False):
    """Replay stored entry events under one exit rule. Sequential per
    session with no overlapping positions."""
    rs, held = [], []
    for day, (ev, cl, hi, lo, n, tmin) in events_by_day.items():
        busy_until = -1
        for E in sorted(ev, key=lambda x: x["j"]):
            j = E["j"]
            if j <= busy_until:
                continue                       # position already open
            if ny_only and not (NY_START * 60 <= tmin[j] < NY_END * 60):
                continue
            e, sl, long = E["e"], E["sl"], E["long"]
            R = abs(e - sl)
            if R <= 0:
                continue
            dirn = 1 if long else -1
            tp = e + dirn * tp_mult * R
            last = n if max_bars is None else min(n, j + 1 + max_bars)
            out = None
            for i in range(j + 1, last):
                hsl = (lo[i] <= sl) if long else (hi[i] >= sl)
                htp = (hi[i] >= tp) if long else (lo[i] <= tp)
                if hsl:                        # pessimistic: stop wins ties
                    out = ((-R - cost) / R, i - j)
                    break
                if htp:
                    out = ((abs(tp - e) - cost) / R, i - j)
                    break
            if out is None:
                px = cl[last - 1]
                gval = (px - e) if long else (e - px)
                out = ((gval - cost) / R, last - 1 - j)
            rs.append(out[0]); held.append(out[1])
            busy_until = j + out[1]
    return rs, held


def show(label, rs, held, seed=7):
    if not rs:
        print(f"  {label:<34} n=0")
        return
    b = stationary_bootstrap_mean(rs, 4000, 5.0, 0.95, seed)
    star = "*" if b.lower > 0 else " "
    print(f"  {label:<34} n={len(rs):<4} E[R]={np.mean(rs):+.3f}{star} "
          f"tot={np.sum(rs):+6.1f}R win={100*np.mean([x>0 for x in rs]):3.0f}% "
          f"CI[{b.lower:+.3f},{b.upper:+.3f}] med_hold={int(np.median(held))}m")


def main():
    files = sorted(glob.glob(os.path.join("..", "data_tv", "TV_*_1min.csv")))
    stack_by_day, accum_by_day = {}, {}
    sessions = 0

    for f in files:
        bars = load_tv(f)
        sess = defaultdict(list)
        for b in bars:
            sess[session_key(b["t"])].append(b)
        prev = None
        hist = deque(maxlen=HTF_N)
        prev_bars = None

        for day in sorted(sess):
            g = sess[day]
            liquid = sum(b["vol"] for b in g) >= MIN_VOL and len(g) >= 120
            if liquid and prev is not None and len(hist) >= 5:
                atr = atr_of(g)
                if atr > 0:
                    sessions += 1
                    cl = np.array([b["c"] for b in g]); hi = np.array([b["h"] for b in g])
                    lo = np.array([b["l"] for b in g]); dl = np.array([b["delta"] for b in g])
                    vl = np.array([b["vol"] for b in g]); rng = hi - lo
                    n = len(g)
                    from dale_tv import NY
                    tmin = np.array([b["t"].astimezone(NY).hour * 60 +
                                     b["t"].astimezone(NY).minute for b in g])
                    ev = stack_events(g, prev["poc"], atr, n, cl, hi, lo, dl, vl, rng)
                    if ev:
                        stack_by_day[day] = (ev, cl, hi, lo, n, tmin)
                    concat = (prev_bars or []) + g
                    R_ = find_rotations(concat, atr)
                    if R_:
                        aev = accum_events(R_, len(prev_bars or []), atr, n, cl, hi, lo)
                        if aev:
                            accum_by_day[day] = (aev, cl, hi, lo, n, tmin)
            if len(g) >= 30 and sum(b["vol"] for b in g) > 0:
                rlo = min(b["l"] for b in g); rhi = max(b["h"] for b in g)
                pr = build_profile(g, max((rhi - rlo) / ROWS, 1e-9))
                if pr:
                    prev = pr
                hist.append(g); prev_bars = g

    ns = sum(len(v[0]) for v in stack_by_day.values())
    na = sum(len(v[0]) for v in accum_by_day.values())
    print(f"\nSessions scanned: {sessions}   "
          f"stack signals: {ns} (dale_v5 found 10)   "
          f"accum signals: {na} (dale_v5 found 12)")

    TPS  = [0.5, 0.75, 1.0, 1.5, 2.0]
    HOLD = [(15, "15m"), (30, "30m"), (60, "60m"), (None, "close")]

    for name, store in (("PRIOR-POC EXECUTION STACK", stack_by_day),
                        ("ACCUM ROTATION RETEST", accum_by_day)):
        print(f"\n{'='*100}\n{name} -- scalp exit sweep (GC cost 0.05, "
              f"* = bootstrap CI excludes zero)\n{'='*100}")
        for mb, hl in HOLD:
            for tp in TPS:
                rs, hd = run_config(store, tp, mb, GC_COST)
                show(f"TP {tp:.2f}R / time {hl}", rs, hd, seed=int(tp * 100) + (mb or 0))

    print(f"\n{'='*100}\nCOST SENSITIVITY -- the trader executes MGC, not GC\n{'='*100}")
    for name, store in (("stack", stack_by_day), ("accum", accum_by_day)):
        for tp, mb, hl in ((0.75, 30, "30m"), (1.0, 60, "60m")):
            for cost, cn in ((GC_COST, "GC  0.05"), (MGC_COST, "MGC 0.11")):
                rs, hd = run_config(store, tp, mb, cost)
                show(f"{name} TP{tp}R/{hl} @ {cn}", rs, hd)

    print(f"\n{'='*100}\nNY 09:00-11:00 WINDOW (the live indicator's gate)\n{'='*100}")
    for name, store in (("stack", stack_by_day), ("accum", accum_by_day)):
        for tp, mb, hl in ((0.75, 30, "30m"), (1.0, 60, "60m")):
            rs, hd = run_config(store, tp, mb, MGC_COST, ny_only=False)
            show(f"{name} TP{tp}R/{hl} all day  (MGC)", rs, hd)
            rs, hd = run_config(store, tp, mb, MGC_COST, ny_only=True)
            show(f"{name} TP{tp}R/{hl} NY window (MGC)", rs, hd)


if __name__ == "__main__":
    main()
