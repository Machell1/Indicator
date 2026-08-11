"""
v5 backtest -- the three profile legs, on real GCQ6 volume.

Holds the PROVEN execution stack constant (signature entry + reaction stop,
the +0.324R configuration from dale_of2) and asks the three questions v5
introduced:

  Q1  HTF ALIGNMENT: split the execution-stack trades by whether the trade
      direction agrees with the side of the 20-session composite POC.
      v5 annotates [HTF aligned]/[HTF against] -- does the tag matter?

  Q2  SETUP 1 (accumulation): rotation (>=30 bars inside 1.5 ATR, within the
      last ~2 days) -> breakout >=1 ATR -> first retest of the rotation's
      flexible-profile POC, traded WITH the breakout. Indicator-mirror:
      immediate fire, LVN stop from the rotation profile.

  Q3  SETUP 2 (trend-leg cluster): last completed pivot-to-pivot impulse
      >=2 ATR -> flexible profile over the leg -> first retest of its POC,
      traded WITH the leg. Immediate fire, LVN stop from the leg profile.

Also counts CONFLUENCE stacks (flexible level within 0.3 ATR of the prior
POC or HTF POC) -- the playbook's "highest-confluence trade".

Same instrument, costs, and pessimistic fills as dale_of2.
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
PRIOR_N   = 10
TP_FRONT  = 0.15
COST      = float(os.environ.get("COST_PTS", "0.05"))
HTF_N     = 20
PIV_K     = 12
LEG_MIN_ATR   = float(os.environ.get("LEG_MIN_ATR", "2.0"))
ROT_MIN_BARS  = 30
ROT_MAX_ATR   = 1.5
ROT_BREAK_ATR = 1.0
MAGS = []          # observed latest-leg magnitudes (in ATR), diagnostics


def atr_of(g):
    r = [b["h"] - b["l"] for b in g]
    return float(np.mean(r)) * 30.0 if r else 0.0


def sim(entry, sl, tp, long, cl, hi, lo, start, n):
    R = abs(entry - sl)
    if R <= 0:
        return None
    for i in range(start, n):
        hsl = (lo[i] <= sl) if long else (hi[i] >= sl)
        htp = (hi[i] >= tp) if long else (lo[i] <= tp)
        if hsl and htp:
            htp = False
        if hsl:
            return (-R - COST) / R
        if htp:
            return (abs(tp - entry) - COST) / R
    px = cl[n - 1]
    g = (px - entry) if long else (entry - px)
    return (g - COST) / R


def target(entry, dirn, prior_pocs, atr):
    cand = [p for p in prior_pocs[-PRIOR_N:] if (p - entry) * dirn > 0.05 * atr]
    if cand:
        t = min(cand, key=lambda p: abs(p - entry))
        return t - dirn * TP_FRONT * atr
    return entry + dirn * 0.8 * atr


def find_rotations(concat, atr):
    """(start, end, complete_idx, poc, prof, down) for qualifying rotations."""
    h = np.array([b["h"] for b in concat]); l = np.array([b["l"] for b in concat])
    c = np.array([b["c"] for b in concat])
    n = len(concat)
    out = []
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
                out.append(dict(s=s, e=e, comp=comp, poc=prof["poc"],
                                prof=prof, down=dn))
                return out          # most recent qualifying rotation only
        e = s - 5
    return out


def find_leg(concat, atr, diag=None):
    """Most recent completed pivot->pivot impulse >= LEG_MIN_ATR."""
    h = np.array([b["h"] for b in concat]); l = np.array([b["l"] for b in concat])
    n = len(concat); k = PIV_K
    lastPH = lastPL = -1
    for i in range(n - 1 - k, k, -1):
        ph = h[i] == h[i - k:i + k + 1].max() and (h[i - k:i + k + 1] >= h[i]).sum() == 1
        pl = l[i] == l[i - k:i + k + 1].min() and (l[i - k:i + k + 1] <= l[i]).sum() == 1
        if ph and lastPH < 0: lastPH = i
        if pl and lastPL < 0: lastPL = i
        if lastPH >= 0 and lastPL >= 0: break
    if lastPH < 0 or lastPL < 0:
        if diag is not None: diag["leg_no_pivots"] += 1
        return None
    a, b = min(lastPH, lastPL), max(lastPH, lastPL)
    if b - a < 15:
        if diag is not None: diag["leg_too_short"] += 1
        return None
    MAGS.append(abs(h[lastPH] - l[lastPL]) / atr)
    if abs(h[lastPH] - l[lastPL]) < LEG_MIN_ATR * atr:
        if diag is not None: diag["leg_below_2ATR"] += 1
        return None
    step = max((h[a:b+1].max() - l[a:b+1].min() + atr) / ROWS, 1e-9)
    prof = build_profile(concat[a:b + 1], step)
    if not prof: return None
    return dict(a=a, b=b, poc=prof["poc"], prof=prof,
                down=(lastPH < lastPL), conf=b + k)   # pivot confirmed at b+k


def retest_arm(level, long, cl, hi, lo, atr, start, n):
    """First retest with arming: price must first be >=1 ATR away."""
    armed = was_out = False
    maxd = 0.0
    for i in range(start, n):
        d = abs(cl[i] - level)
        if d > maxd: maxd = d
        if d > 0.10 * atr: was_out = True
        if not armed and maxd >= 1.0 * atr: armed = True
        if not (armed and was_out): continue
        touch = (lo[i] <= level) if long else (hi[i] >= level)
        if touch: return i
    return -1


def main():
    files = sorted(glob.glob(os.environ.get("DATA_GLOB", os.path.join("..", "data_tv", "TV_*_1min.csv"))))
    res = defaultdict(list)
    conflu = defaultdict(int)
    diag = defaultdict(int)
    accum_log = []

    for f in files:
        bars = load_tv(f)
        sess = defaultdict(list)
        for b in bars:
            sess[session_key(b["t"])].append(b)
        days = sorted(sess)

        prev = None; prior_pocs = []
        hist = deque(maxlen=HTF_N)     # last N sessions' bars for HTF
        prev_bars = None

        for day in days:
            g = sess[day]
            liquid = sum(b["vol"] for b in g) >= MIN_VOL and len(g) >= 120

            if liquid and prev is not None and len(hist) >= 5:
                atr = atr_of(g)
                if atr > 0:
                    # HTF composite from PRIOR sessions only (causal)
                    hbars = [b for s_ in hist for b in s_]
                    hstep = max((max(x["h"] for x in hbars) -
                                 min(x["l"] for x in hbars)) / ROWS, 1e-9)
                    htf = build_profile(hbars, hstep)
                    htf_poc = htf["poc"] if htf else None

                    cl = np.array([b["c"] for b in g]); hi = np.array([b["h"] for b in g])
                    lo = np.array([b["l"] for b in g]); dl = np.array([b["delta"] for b in g])
                    vl = np.array([b["vol"] for b in g]); rng = hi - lo
                    vmed = float(np.median(vl)); rmed = float(np.median(rng))
                    d75 = float(np.percentile(np.abs(dl), 75))
                    n = len(g)
                    poc = prev["poc"]

                    # ---------- Q1: execution stack on prior-POC, HTF split
                    i0 = -1
                    for i in range(5, n - 30):
                        if lo[i] <= poc <= hi[i]:
                            i0 = i; break
                    if i0 > 0:
                        long = cl[i0 - 1] > poc
                        entry_j = -1
                        for j in range(i0, min(i0 + 15, n - 20)):
                            ab = (vl[j] >= 1.3 * vmed and rng[j] <= 0.9 * rmed and
                                  ((long and lo[j] > poc - 0.30 * atr) or
                                   ((not long) and hi[j] < poc + 0.30 * atr)))
                            if not ab: continue
                            for kk in range(j + 1, min(j + 6, n - 15)):
                                if (abs(dl[kk]) >= d75 and
                                    ((long and dl[kk] > 0) or ((not long) and dl[kk] < 0))):
                                    entry_j = kk; break
                            if entry_j > 0: break
                        if entry_j > 0:
                            e = cl[entry_j]
                            react = (min(lo[i0:entry_j + 1]) - 0.10 * atr) if long \
                                else (max(hi[i0:entry_j + 1]) + 0.10 * atr)
                            ok = (react < e) if long else (react > e)
                            if ok:
                                # tp anchored at the POC, exactly as dale_of2
                                tp = target(poc, 1 if long else -1, prior_pocs, atr)
                                r = sim(e, react, tp, long, cl, hi, lo, entry_j + 1, n)
                                if r is not None:
                                    res["stack_all"].append(r)
                                    if htf_poc is not None:
                                        alig = (e >= htf_poc) if long else (e <= htf_poc)
                                        res["stack_aligned" if alig else "stack_against"].append(r)

                    # ---------- Q2: accumulation retest (indicator mirror)
                    concat = (prev_bars or []) + g
                    off = len(prev_bars or [])
                    rots = find_rotations(concat, atr)
                    if rots:
                        R_ = rots[0]
                        # signal only tradeable after breakout completes, today
                        start = max(R_["comp"] + 1 - off, 1)
                        if start < n - 10:
                            long = not R_["down"]
                            ti = retest_arm(R_["poc"], long, cl, hi, lo, atr,
                                            max(start, 1), n - 5)
                            if ti > 0:
                                slv = stop_behind_lvn(R_["prof"], long, atr)
                                tp = target(R_["poc"], 1 if long else -1, prior_pocs, atr)
                                r = sim(R_["poc"], slv, tp, long, cl, hi, lo, ti + 1, n)
                                if r is not None:
                                    res["accum"].append(r)
                                    accum_log.append((str(day)[:10], "L" if long else "S", r))
                                    if htf_poc is not None:
                                        al = (R_["poc"] >= htf_poc) if long else (R_["poc"] <= htf_poc)
                                        res["accum_aligned" if al else "accum_against"].append(r)
                                    if abs(R_["poc"] - poc) < 0.3 * atr:
                                        conflu["accum_on_priorPOC"] += 1
                                    if htf_poc and abs(R_["poc"] - htf_poc) < 0.3 * atr:
                                        conflu["accum_on_htfPOC"] += 1

                    # ---------- Q3: trend-leg cluster (indicator mirror)
                    diag["days"] += 1
                    leg = find_leg(concat, atr, diag)
                    if leg:
                        diag["leg_found"] += 1
                        start = max(leg["conf"] + 1 - off, 1)
                        dup = rots and abs(leg["poc"] - rots[0]["poc"]) < 0.3 * atr
                        if dup:
                            diag["leg_dup_accum"] += 1
                        if start >= n - 10:
                            diag["leg_too_late"] += 1
                        if start < n - 10 and not dup:
                            diag["leg_tradeable"] += 1
                            long = not leg["down"]
                            ti = retest_arm(leg["poc"], long, cl, hi, lo, atr,
                                            max(start, 1), n - 5)
                            if ti > 0:
                                slv = stop_behind_lvn(leg["prof"], long, atr)
                                tp = target(leg["poc"], 1 if long else -1, prior_pocs, atr)
                                r = sim(leg["poc"], slv, tp, long, cl, hi, lo, ti + 1, n)
                                if r is not None:
                                    res["leg2"].append(r)
                                    if abs(leg["poc"] - poc) < 0.3 * atr:
                                        conflu["leg_on_priorPOC"] += 1

            # session close: update profiles/history
            if len(g) >= 30 and sum(b["vol"] for b in g) > 0:
                rlo = min(b["l"] for b in g); rhi = max(b["h"] for b in g)
                step = max((rhi - rlo) / ROWS, 1e-9)
                pr = build_profile(g, step)
                if pr:
                    prev = pr
                    prior_pocs.append(pr["poc"])
                hist.append(g)
                prev_bars = g

    def show(k, label):
        v = res.get(k, [])
        if not v:
            print(f"  {label:<28} n=0")
            return
        b = stationary_bootstrap_mean(v, 4000, 5.0, 0.95, abs(hash(k)) % 997)
        print(f"  {label:<28} n={len(v):<3} E[R]={np.mean(v):+.3f}  "
              f"tot={np.sum(v):+.1f}R  win={100*np.mean([x>0 for x in v]):.0f}%  "
              f"CI[{b.lower:+.3f},{b.upper:+.3f}]")

    print("\nQ1. HTF ALIGNMENT (execution stack held constant):")
    show("stack_all",     "all stack trades")
    show("stack_aligned", "[HTF aligned]")
    show("stack_against", "[HTF against]")
    a, g_ = res.get("stack_aligned", []), res.get("stack_against", [])
    if a and g_:
        print(f"  -> separation: {np.mean(a)-np.mean(g_):+.3f} R/trade "
              f"({'HTF filter EARNS the gate' if np.mean(a)>np.mean(g_) else 'alignment does NOT help'})")

    print("\nQ2. SETUP 1 -- accumulation retest (first numbers ever):")
    show("accum", "rotation-POC retest")
    v = res.get("accum", [])
    if len(v) >= 8:
        h1, h2 = v[:len(v)//2], v[len(v)//2:]
        print(f"    chrono halves: first {np.mean(h1):+.3f} (n={len(h1)})  "
              f"second {np.mean(h2):+.3f} (n={len(h2)})")
    if accum_log:
        print("    trades:", "  ".join(f"{d}{s}{r:+.2f}" for d, s, r in accum_log))
    show("accum_aligned", "  [HTF aligned]")
    show("accum_against", "  [HTF against]")

    print("\nQ3. SETUP 2 -- trend-leg cluster retest (first numbers ever):")
    show("leg2", "leg-cluster retest")
    print("    funnel:", {k: diag[k] for k in sorted(diag)})
    if MAGS:
        q = np.percentile(MAGS, [50, 75, 90, 95])
        print(f"    latest-leg magnitude (ATR units): median {q[0]:.2f}  "
              f"p75 {q[1]:.2f}  p90 {q[2]:.2f}  p95 {q[3]:.2f}  max {max(MAGS):.2f}")

    print("\nCONFLUENCE stacks observed:", dict(conflu) or "none")
    # health line reports the data ACTUALLY used -- it was hardcoded to
    # "GCQ6 only, 86 liquid sessions" and stayed that way when the harness
    # was pointed at NQ/ES, mislabelling every run on another instrument
    print("\nHealth: " + ", ".join(os.path.basename(x) for x in files) +
          " -- " + str(diag["days"]) + " liquid sessions, one regime. The "
          "stack arms mirror dale_of2 (no NY-window gate) for comparability.")


if __name__ == "__main__":
    main()
