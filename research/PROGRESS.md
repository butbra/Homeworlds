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

## 2026-11-21 — Larger controlled training runs (seeds 5512 and 5513)

Both runs were specified before their results were inspected: population
6, four generations, two elites, two training openings per pairing, all
eight fixed validation openings, 3,000 generated successors per turn,
depth ceiling 8, threefold repetition, 160-turn cap, four workers per run.
The separate final-test set remains unused. Each generation's training
winner receives 32 validation games versus the baseline (four games
per opening to balance seats and starting player).

| Gen | Seed 5512 validation W–L | Repetition | Fitness | Seed 5513 validation W–L | Repetition | Fitness |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 17–5 | 10 | 0.6875 | 17–4 | 11 | 0.703125 |
| 1 | 10–6 | 16 | 0.5625 | 20–8 | 4 | 0.6875 |
| 2 | 10–6 | 16 | 0.5625 | 19–9 | 4 | 0.65625 |
| 3 | 10–6 | 16 | 0.5625 | 19–9 | 4 | 0.65625 |

Native results before independent replay:

| Metric | Seed 5512 | Seed 5513 |
|---|---:|---:|
| Scheduled games | 944 | 944 |
| Natural wins | 534 | 722 |
| Repetition stops | 395 | 221 |
| Turn-limit stops | 15 | 1 |
| Native errors/timeouts | 0 | 0 |
| Complete turns | 49,124 | 37,003 |
| Independent replay disagreements | 1 | 0 |
| Wall time (concurrent runs) | 224.85 s | 137.37 s |

**Best validation candidate so far:** seed 5513, g000-c002, fitness
0.703125. It won 17/32 scheduled validation games (53.1%), lost 4 and
stopped by repetition in 11. Among decisive games only it won 17/21
(81.0%); neither denominator should be confused with the training
fitness that gives neutral credit to repetitions. See each run's
`champion.json` for the exact weights. Most notably, its catastrophe
safety weight increased from 14 to 32.546, and fleet pips from 5 to
11.338, whereas home defender count and mobility received lower weights.

**Interpretation:** Both seeds select a generation-zero random genome
under the fixed validation protocol, so there is evidence that initial
randomized weight selection improved on the manual baseline, but not
that subsequent crossover/mutation produced further improvement. Training
fitness is not directly comparable across generations because both the
opponents and sampled training openings change. Potential explanations
include tiny populations and training samples, a high nondecisive rate
and shallow search; these are hypotheses, not demonstrated causes.
Do not report validation fitness as held-out test performance, and do
not select final weights using final openings.

**Independent replay discrepancy:** Seed 5512 generation 0, training
game 137, turn 26, was rejected by the website after a native winning
blue catastrophe at Alpha. The returned move unnecessarily added a
discovery using a surviving red star released into the native bank on
homeworld elimination, although the website retains that star during
the turn. The original native result is preserved in the archive and
this game must be flagged as invalid in the independently verified
dataset. Excluding this loss from candidate g000-c002 changes its
fitness from 9.5/48 to 9.5/47 (0.2021), leaving it last and not changing
the winner or selected elites. Thus the selection path is unaffected.
All 32 validation games per generation passed independent replay; all
other games from these two runs passed. The candidate adapter was updated
to emit the earliest legal winning prefix, avoiding superfluous actions
after a decisive catastrophe. A regression test covers the exact position.
The separately archived [recheck](runs/2026-11-21-winning-prefix-recheck)
reran game 137 at the same deterministic budget: all 25 preceding moves
were identical, turn 26 became only `catastrophe blue at Alpha`, and
the same player won on the same turn. The website replay verified all
26 turns and the terminal result. This confirms the correction without
modifying the original record or pretending the original suffix was legal.

**Data:** [seed 5512](runs/2026-11-21-evolution-seed5512) and
[seed 5513](runs/2026-11-21-evolution-seed5513) contain per-generation
fitness, genomes, raw match records, validation, checkpoints, protocol,
and independent replay results. Large raw JSONL records are stored
losslessly as Zstandard archives; decompressed bytes were checked
against the original gzip outputs. Native summary files are unchanged.
Next: test a better-targeted training objective against the fixed
baseline/Quux before freezing a final candidate, then run truly held-out
benchmarks.
