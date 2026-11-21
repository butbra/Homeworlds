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

## 2026-11-21 — Evolutionary training pipeline and development pilot

**Purpose:** Add a reproducible evolutionary optimization loop, verify
candidate games independently, establish disjoint opening sets, and test
the training pipeline before a larger multi-seed experiment.

**Implementation:** `evolve.py`, `make_openings.py`, `verify_replay.mjs`,
and regression tests. C++ now accepts a deterministic generated-successor
budget in addition to the existing clock limit. A fixed count controls
actual search effort more reproducibly than concurrent wall-time searches.
All candidates share the same budget and features.

**Independent validation:** The previous two pilots' 166 complete turns
also passed the website's TypeScript reducer. The new replay verifier
checks complete board and inventory plus natural outcome after every turn,
normalizing terminal empty-homeworld cleanup only.

**Opening splits:** 24 training, 8 validation, and 50 held-out final
positions with seed 20261121. Seat-reversed and reordered-star duplicates
are excluded across splits, as are historical October self-play and original
pilot positions. Training never reads the final file.

**Pilot protocol:** [`runs/2026-11-21-evolution-pilot`](runs/2026-11-21-evolution-pilot).
Seed 5511, population 4, 3 generations, 2 elites, 20% per-weight mutation,
0.4 log-scale mutation standard deviation, one training opening per
pairing and two fixed validation openings, 1,500 generated successors
per turn, depth 8 ceiling, 120-turn cap, six workers. Baseline plus peer
round-robin and prior generation winner. Each pairing covers both engine
seats and both starting players.

| Gen | Training winner fitness | Validation W-L | Repetition / cap | Validation fitness |
|---:|---:|---:|---:|---:|
| 0 | 0.594 | 6–0 | 2 / 0 | 0.875 |
| 1 | 0.550 | 6–0 | 2 / 0 | 0.875 |
| 2 | 0.600 | 1–3 | 3 / 1 | 0.375 |

The first-generation random candidate g000-c003 remained the validation
champion. Gen 1 retained exactly the same genome; gen 2's different
training winner had lower validation performance. This pilot demonstrates
that the infrastructure works; it **does not demonstrate improvement due
to crossover or mutation**. Validation has only eight scheduled games
per generation, and further model selection on more openings is required.

| Overall pilot metric | Result |
|---|---:|
| Games | 176 |
| Natural wins | 117 |
| Repetition stops | 45 |
| Turn-limit stops | 14 |
| Timeouts / errors | 0 |
| Independent replayed turns | 9,467 |
| Independent replay disagreements | 0 |
| Wall time | 13.69 s |

All exact genomes, ancestry, scores, trial configurations and compressed
per-turn transcripts are preserved. The final opening split was not used.
Native tests and all four Python experimental-design tests passed.
