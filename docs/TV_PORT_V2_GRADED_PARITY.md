# TradingView port v2 — graded-parity + the playbook alert set

**Scope:** `tradingview/TraderMachell.pine` only — no JS touched, so the
four repo gates are unaffected by construction (verified: the diff is
confined to `tradingview/` + docs). **Honest limit: Pine cannot be
compiled or regression-run in this environment.** The edits were written
against the Pine v6 reference and review-passed twice (one real ordering
bug found and fixed: `tfMin` used before declaration); the paste itself
is the compile check — procedure below.

## 1. What the audit found in the v1 port (live on MGCZ2026)

The v1 port renders well and its honesty labeling is right (STACK marked
UNGRADED on this delta — correct, and its intrabar 1S up/down delta is
actually *closer* to the graded delta than Tradovate's bid/ask proxy).
But against the graded engine and the playbook it diverged materially:

| Gap | Graded engine / playbook | v1 port |
|---|---|---|
| Session roll | CME day rolls **17:00 NY** (`sessionKey`) | chart day boundary (`time("D")`) — the same class of divergence the original brief flagged for `tradeDate()` |
| Signal window | fires **09:00–11:00 NY only** | fired around the clock (window was only a score bonus) |
| Liquidity gate | prior session ≥2000c / ≥120min or stand down | absent |
| Arming | ≥1 ATR excursion + wasOut before the first touch | armed from bar one; re-armed on a 0.5 ATR vacate |
| First touch | consumed is consumed (once per session) | re-armed repeatedly |
| Target | nearest prior POC, front-run 0.15 ATR, ≥0.5R clamp — the target the grades were measured with | fixed R multiple |
| ATR / stats | trailing 420-min ATR across sessions; trailing 120-min signature windows (the documented calibration trap) | session-mean ATR resetting each roll; session-so-far medians |
| ACCUM stop | `stopBehindLVN` over the rotation's bins | VA edge ± 0.6 ATR only |
| ACCUM entry | close within 0.30 ATR; never duplicating prior POC | neither check |
| Alerts | playbook routine: TOUCH → do nothing yet; ABSORPTION; ENTRY; **FLOW QUIT** | LONG/SHORT entry only |
| Flow-quit | fav ≥0.3R then opposing ≥p90 delta at ≥2× volume | absent |

## 2. What v2 changes (all default-ON, each gate toggleable)

Session roll at 17:00 NY via a key that increments only at the boundary;
NY-window and liquidity gates on both machines; graded arming +
first-touch-only on the stack; `f_target()` and `f_lvnStop()` ported;
trailing ATR/median/percentile stats (also a per-bar perf win — the old
array copy+sort per bar is gone); ACCUM proximity + prior-POC dedup;
the flow-quit machine; five alertconditions covering the playbook
routine with class grades in the text (never more than measured); a
Gates row on the status panel showing window/liquidity state live.

## 3. Paste-and-verify procedure (the trader's part)

1. Pine Editor → replace the script → **Add to chart**. A compile error
   at this step is mine: send the error line verbatim and I fix it —
   this environment cannot compile Pine, so the first paste is the
   compile gate.
2. **Parity check** (same session, TV vs Tradovate): PREV POC/VAH/VAL
   should now agree to within a row or two (the v1 hour-offset session
   roll would have made them disagree systematically). Report the two
   sets of numbers once — that reading validates the roll fix.
3. Set the five alerts (Add alert → condition = TraderMachell → pick
   TOUCH / ABSORPTION / LONG / SHORT / FLOW QUIT, "Once per bar close").
   That is the playbook's alert-driven routine, finally off MT5.
4. Expect fewer signals than v1 fired: the window, liquidity, arming and
   first-touch gates are the graded measurement conditions — the drop
   IS the fix. The Gates panel row says which gate is standing you down.
