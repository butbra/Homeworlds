# Research progress and report evidence

This is an append-only development/experiment log in the sense that each new
method or experiment receives its own dated entry. Pilot results must not be
combined with final held-out benchmark results.

## 2026-11-21 — Custom Bot v0: implementation and smoke test

**Purpose:** Build an independent candidate search/evaluation function from
the proposal, test it against exhaustive depth-two search, and verify
complete-turn tournament integration before evolutionary optimization.

**Base repository:** `butbra/Homeworlds` main at
`9575049ebabbd5c66643f2421b9b999dd3f62588`. Pinned native rules/move generation:
Quuxplusone commit `20d2ec4a70365acc4b8ba8cd6bae7125fa935513`.
No changes to Quux's decision algorithm or the website.

**Implementation:** `bot.h` / `bot.cc` (negamax, alpha-beta, iterative
deepening, move ordering, depth-aware transposition table, ten-feature
weighted evaluation); native JSON CLI; Python paired tournament runner.

**Build environment for pilot:** Linux x86_64; GCC 14.2.0;
`-std=c++17 -O3 -Wall -Wextra`; Python 3.12.14.
Native executable SHA-256:
`b3852341dd3e34956476d4bb7b882acbf68794324e2e9e36fe84047a5072a207`.

**Development pilot (not final benchmark):**
[`runs/2026-11-21-baseline-pilot`](runs/2026-11-21-baseline-pilot).
Two fixed openings with first player reversed, four games, baseline v0
vs. original Quux. Candidate soft search budget 100 ms, outer limit 250 ms
for both, max depth 8, 40-turn cap, threefold repetition, two workers.

| Metric | Result |
|---|---:|
| Scheduled games | 4 |
| Naturally finished games | 0 |
| Repetition stops | 1 |
| Turn-limit stops | 3 |
| Timeouts | 0 |
| Engine errors | 0 |
| Accepted complete turns (native referee) | 158 |
| Mean observed game length | 39.5 turns |
| Candidate mean search time | 101.703 ms |
| Candidate mean completed depth | 2.013 |
| Candidate mean visited search nodes per turn | 3791.899 |
| Quux mean search time | 28.383 ms |
| Pilot wall time | 6.253 s |

**Interpretation:** The test demonstrates the core candidate and tournament
execution work, but does not estimate relative playing strength. The cap
is deliberately too short, and native rule application does not establish
independent website-rule agreement. The search deadline slightly overran
100 ms on average, consistent with its cooperative nature. The mean depth
around two turns indicates that branching factor and move generation are
important constraints for subsequent training. No weight optimization or
held-out games have been performed.

**Raw data:** protocol.json, summary.json and full games.jsonl in the run
directory. Preserve them unchanged. The runner was then updated to flush
completed games immediately and record executable hashes for future runs.

**Search regression tests:** `make -C research test` passed. Search scores
matched exhaustive depth-two negamax for both players in an opening and
a contested midgame position, and for the opening with ordering and caching
disabled. Midgame search visited 263/198 nodes and evaluated 5,580/5,562
generated successors for players 0/1. Canonical key, antisymmetry, immediate
win and interrupted-search legality checks passed. The vendored C++ sources
emit two compiler warnings in existing code; neither is from the new bot.

**Runner regression smoke:** [`runs/2026-11-21-runner-smoke`](runs/2026-11-21-runner-smoke)
reran four two-turn games after the streaming-log change (10 ms candidate
budget, 250 ms outer timeout). All 8 turns completed; all four games stopped
at the intentionally tiny cap. The executable hash and records were saved.
