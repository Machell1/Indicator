"""
Trader Dale POC retest -- on REAL Tradovate futures data.

First backtest of this strategy on the creator's actual instrument: profiles
built from genuine TRADED volume (upVolume + downVolume), not the tick-count
proxy every MT5 test was forced to use. And -- new -- an order-flow arm using
real delta, which MT5's quote-only feed made impossible.

Levels are STATIC prior-session POCs (the winning model from the screenshot
work). Arms:

    poc            first in-window retest of the prior-session POC (baseline)
    poc_delta      same, but require confirming delta at the touch bar
                   (buy delta for a long / sell delta for a short) -- Dale's
                   "aggressive participants join in" confirmation, measured
    poc_absorb     same, but require an absorption bar at the touch (big real
                   volume, small range) -- Confirmation #2, measured
    poc_nodelta    require CONTRADICTING delta -- the control. If order flow
                   is real signal, this should do clearly worse than poc_delta.

Session is the futures RTH-ish anchor at the CME 17:00 ET roll (the same day
boundary the MT5 model used). Costs are the FUTURES cost model: ~1 tick
round-trip + commission, per the micro-gold contract, not the CFD spread.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import numpy as np

from stats import stationary_bootstrap_mean

NY = ZoneInfo("America/New_York")

ROWS         = 80
VA_PCT       = 0.70
ARM_ATR      = 1.0
FLIP_BUF_ATR = 0.15
LVN_FRAC     = 0.30
TP_FRONT_ATR = 0.15
PRIOR_DAYS   = 10
MIN_BARS     = 20
NY_START, NY_END = 9, 11

# Micro gold (MGC): $10 / point, tick 0.1 = $1. Round-trip cost in PRICE units:
# ~1 tick slippage/spread + commission ~$0.50/side -> ~$1.1 round trip -> 0.11 pt.
MGC_COST_PTS = 0.11
GC_COST_PTS  = 0.05   # full GC is more liquid per point of value


def load_tv(path):
    """Return list of dict bars with tz-aware UTC datetimes and real volume."""
    import csv
    out = []
    with open(path) as fh:
        for row in csv.DictReader(fh):
            ts = row["timestamp"]
            # 2026-08-06T22:00Z
            t = datetime.strptime(ts.replace("Z", ""), "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)
            uv = float(row.get("upVolume") or 0)
            dv = float(row.get("downVolume") or 0)
            out.append(dict(
                t=t, o=float(row["open"]), h=float(row["high"]),
                l=float(row["low"]), c=float(row["close"]),
                vol=uv + dv,
                # DELTA_MODE=aggressor uses offerVolume-bidVolume, the
                # definition the live Tradovate indicator API exposes.
                # Default stays upVolume-downVolume: the definition every
                # published grade was measured on.
                delta=((float(row.get("offerVolume") or 0) -
                        float(row.get("bidVolume") or 0))
                       if os.environ.get("DELTA_MODE") == "aggressor"
                       else uv - dv),
                bidv=float(row.get("bidVolume") or 0),
                offv=float(row.get("offerVolume") or 0)))
    out.sort(key=lambda b: b["t"])
    return out


def session_key(t_utc):
    """CME session day: rolls at 17:00 ET. Returns the ET date it belongs to."""
    ny = t_utc.astimezone(NY)
    if ny.hour >= 17:
        ny = ny + timedelta(days=1)
    return ny.date()


def build_profile(bars, step):
    """Volume profile on a fixed grid from REAL traded volume."""
    lo = min(b["l"] for b in bars)
    grid_lo = lo - 40 * step
    vol = defaultdict(float)
    total = 0.0
    for b in bars:
        a = int((b["l"] - grid_lo) // step)
        z = int((b["h"] - grid_lo) // step)
        share = b["vol"] / (z - a + 1) if z >= a else b["vol"]
        for k in range(a, z + 1):
            vol[k] += share
        total += b["vol"]
    if not vol or total <= 0:
        return None
    poc_row = max(vol, key=vol.get)
    poc = grid_lo + (poc_row + 0.5) * step
    need = total * VA_PCT
    acc = vol[poc_row]; up = dn = poc_row
    while acc < need:
        a = vol.get(up + 1, 0.0); b_ = vol.get(dn - 1, 0.0)
        if a <= 0 and b_ <= 0:
            break
        if a >= b_: up += 1; acc += a
        else:       dn -= 1; acc += b_
    vah = grid_lo + (up + 1) * step
    val = grid_lo + dn * step
    return dict(lo=grid_lo, step=step, poc=poc, poc_row=poc_row,
                vah=vah, val=val, vol=vol)


def stop_behind_lvn(prof, for_long, atr):
    pv = prof["vol"].get(prof["poc_row"], 0.0)
    lo, step, vol = prof["lo"], prof["step"], prof["vol"]
    if for_long:
        k0 = int((prof["val"] - lo) // step)
        for k in range(k0 - 1, k0 - 60, -1):
            if vol.get(k, 0) < LVN_FRAC * pv:
                return lo + k * step - 0.10 * atr
        return prof["val"] - 0.60 * atr
    k0 = int((prof["vah"] - lo) // step)
    for k in range(k0 + 1, k0 + 60):
        if vol.get(k, 0) < LVN_FRAC * pv:
            return lo + (k + 1) * step + 0.10 * atr
    return prof["vah"] + 0.60 * atr


def atr_of(day_bars, period=14):
    """Crude per-session ATR proxy: mean bar range over the session so far."""
    if not day_bars:
        return None
    rng = [b["h"] - b["l"] for b in day_bars[-max(period, 1):]]
    a = float(np.mean(rng)) if rng else 0.0
    return a * 30.0 if a > 0 else None   # scale toward an M30-ish ATR


def run(path, cost_pts, arms):
    bars = load_tv(path)
    # bucket by session
    sess = defaultdict(list)
    for b in bars:
        sess[session_key(b["t"])].append(b)
    days = sorted(sess.keys())

    trades = {a: [] for a in arms}
    prev = None
    prior_pocs = []
    prev_range = None

    for day in days:
        g = sess[day]
        if len(g) < 60:
            continue
        # only trade sessions with real liquidity
        if sum(b["vol"] for b in g) < 500:
            prev = None
            continue

        if prev is not None:
            pp = prev
            hi = np.array([b["h"] for b in g])
            lo = np.array([b["l"] for b in g])
            cl = np.array([b["c"] for b in g])
            dl = np.array([b["delta"] for b in g])
            vl = np.array([b["vol"] for b in g])
            rng = hi - lo
            ny_h = np.array([b["t"].astimezone(NY).hour for b in g])
            in_win = (ny_h >= NY_START) & (ny_h < NY_END)
            n = len(g)

            st = {a: dict(done=False, was_out=False, armed=False,
                          flipped=False, side=None, maxd=0.0, op=None)
                  for a in arms}

            # median volume over the session for the absorption test
            vmed = float(np.median(vl)) if len(vl) else 0.0
            rmed = float(np.median(rng)) if len(rng) else 0.0

            for i in range(n):
                atr = atr_of(g[:i + 1])
                if not atr or atr <= 0:
                    continue
                px = cl[i]

                for a in arms:
                    s = st[a]
                    if s["op"] is not None:
                        p = s["op"]
                        hsl = (lo[i] <= p["sl"]) if p["long"] else (hi[i] >= p["sl"])
                        htp = (hi[i] >= p["tp"]) if p["long"] else (lo[i] <= p["tp"])
                        if hsl and htp:
                            htp = False
                        if hsl or htp or i == n - 1:
                            xp = p["sl"] if hsl else (p["tp"] if htp else px)
                            gross = (xp - p["entry"]) if p["long"] else (p["entry"] - xp)
                            trades[a].append(dict(
                                day=str(day),
                                r=float((gross - cost_pts) / p["r"]),
                                exit="sl" if hsl else ("tp" if htp else "eod")))
                            s["op"] = None
                        continue
                    if s["done"]:
                        continue

                    above = px > pp["poc"]
                    lvl = pp["poc"]
                    if s["side"] is None:
                        s["side"] = above
                    elif s["side"] != above:
                        beyond = (pp["poc"] - px) if s["side"] else (px - pp["poc"])
                        if not s["flipped"] and beyond >= FLIP_BUF_ATR * atr:
                            s["flipped"] = True; s["side"] = above
                            s["armed"] = False; s["was_out"] = False; s["maxd"] = 0.0
                        else:
                            continue

                    d_ = abs(px - lvl)
                    if d_ > s["maxd"]:
                        s["maxd"] = d_
                    if d_ > 0.10 * atr:
                        s["was_out"] = True
                    if not s["armed"]:
                        if s["maxd"] >= ARM_ATR * atr:
                            s["armed"] = True
                        else:
                            continue
                    if not in_win[i] or not s["was_out"]:
                        continue
                    touch = (lo[i] <= lvl) if s["side"] else (hi[i] >= lvl)
                    if not touch:
                        continue

                    # ---- order-flow gate at the touch bar ----
                    long = s["side"]
                    d_bar = dl[i]
                    absorb = (vl[i] >= (np.sort(vl)[-max(1, n // 20)]) and rng[i] <= 0.5 * rmed and rmed > 0)
                    if a == "poc_delta":
                        if (long and d_bar <= 0) or ((not long) and d_bar >= 0):
                            continue
                    elif a == "poc_nodelta":
                        if (long and d_bar > 0) or ((not long) and d_bar < 0):
                            continue
                    elif a == "poc_absorb":
                        if not absorb:
                            continue

                    s["done"] = True
                    entry = lvl
                    sl = stop_behind_lvn(pp, long, atr)
                    rr = abs(entry - sl)
                    if rr <= 0:
                        continue
                    dirn = 1 if long else -1
                    cand = [p for p in prior_pocs[-PRIOR_DAYS:] if (p - entry) * dirn > 0.05 * atr]
                    if cand:
                        tgt = min(cand, key=lambda p: abs(p - entry))
                        tp = tgt - dirn * TP_FRONT_ATR * atr
                    else:
                        tp = entry + dirn * rr
                    if abs(tp - entry) < 0.5 * rr:
                        tp = entry + dirn * rr
                    s["op"] = dict(long=long, entry=entry, sl=sl, tp=tp, r=rr)

        # session close: build the profile from REAL volume
        rlo = min(b["l"] for b in g); rhi = max(b["h"] for b in g)
        dr = rhi - rlo
        step = max((prev_range if prev_range else dr) / ROWS, 1e-9)
        prof = build_profile(g, step)
        if prof is not None:
            prev = prof
            prior_pocs.append(prof["poc"])
        prev_range = dr

    return trades


def summ(v, seed=7):
    r = [x["r"] for x in v]
    if not r:
        return dict(n=0)
    b = stationary_bootstrap_mean(r, resamples=4000, block_len=5.0,
                                  confidence=0.95, seed=seed)
    return dict(n=len(r), exp=round(float(np.mean(r)), 4),
                total=round(float(np.sum(r)), 1),
                win=round(sum(1 for x in r if x > 0) / len(r), 3),
                lo=round(b.lower, 4), hi=round(b.upper, 4))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="../data_tv")
    ap.add_argument("--out", default="../output/cr")
    ap.add_argument("--split", type=float, default=0.60)
    args = ap.parse_args(argv)

    arms = ["poc", "poc_delta", "poc_absorb", "poc_nodelta"]
    files = sorted(glob.glob(os.path.join(args.data_dir, "TV_*_1min.csv")))
    pooled = {a: {"is": [], "oos": []} for a in arms}

    for f in files:
        sym = os.path.basename(f).replace("TV_", "").replace("_1min.csv", "")
        cost = MGC_COST_PTS if sym.startswith("MGC") else GC_COST_PTS
        try:
            tr = run(f, cost, arms)
        except Exception as e:
            print(f"{sym:<8} FAILED: {e}")
            continue
        alldays = sorted({t["day"] for a in arms for t in tr[a]})
        if not alldays:
            print(f"{sym:<8} no trades")
            continue
        cut = alldays[int(len(alldays) * args.split) - 1] if len(alldays) > 1 else alldays[0]
        for a in arms:
            pooled[a]["is"] += [t for t in tr[a] if t["day"] <= cut]
            pooled[a]["oos"] += [t for t in tr[a] if t["day"] > cut]
        d = summ([t for t in tr["poc"] if t["day"] <= cut])
        dd = summ([t for t in tr["poc_delta"] if t["day"] > cut])
        print(f"{sym:<8} poc IS n={d.get('n',0):<3} E={d.get('exp',float('nan')):+.3f}"
              f"  |  poc_delta OOS n={dd.get('n',0):<3} E={dd.get('exp',float('nan')):+.3f}")

    print("\n=== POOLED (REAL Tradovate traded volume + real delta) ===")
    print(f"{'arm':<13} {'IS n':>5} {'IS E[R]':>8} {'IS lo':>7} "
          f"{'OOS n':>6} {'OOS E[R]':>9} {'OOS tot':>8} {'win':>6}")
    res = {}
    for a in arms:
        i = summ(pooled[a]["is"], 31); o = summ(pooled[a]["oos"], 32)
        res[a] = dict(IS=i, OOS=o)
        print(f"{a:<13} {i.get('n',0):>5} {i.get('exp',float('nan')):>+8.3f} "
              f"{i.get('lo',float('nan')):>+7.3f} {o.get('n',0):>6} "
              f"{o.get('exp',float('nan')):>+9.3f} {o.get('total',0):>8} "
              f"{o.get('win',float('nan')):>6}")

    p, pd = res.get("poc", {}), res.get("poc_delta", {})
    nd = res.get("poc_nodelta", {})
    if p.get("IS", {}).get("n") and pd.get("IS", {}).get("n"):
        print(f"\ndelta confirmation value: "
              f"IS {pd['IS']['exp'] - p['IS']['exp']:+.3f}  "
              f"OOS {pd['OOS'].get('exp', float('nan')) - p['OOS'].get('exp', float('nan')):+.3f} R/trade")
    if pd.get("OOS", {}).get("n") and nd.get("OOS", {}).get("n"):
        print(f"confirming vs contradicting delta (OOS): "
              f"{pd['OOS']['exp'] - nd['OOS'].get('exp', float('nan')):+.3f} R/trade "
              f"(if >0, real order flow separates winners from losers)")

    print("\nNOTE: single micro-gold contract, ~liquid window only. Fewer "
          "symbols than the MT5 sweep -- but REAL volume and REAL delta.")
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "dale_tv.json"), "w") as fh:
        json.dump(res, fh, indent=2, default=str)
    print(f"wrote {args.out}/dale_tv.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
