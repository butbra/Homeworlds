# Custom Homeworlds Bot research (CSCI 5511)

This directory implements a separate native C++ candidate bot for the course
project. The existing website, Quux opponent, and vendored sources are not
modified. The candidate reuses Quux's pinned state representation,
complete-turn successor generator and move application; it does **not** call
Quux's search/selector or static evaluator. Quux is linked separately for
benchmark games. See [upstream attribution and license](../vendor/quux/LICENSE).

## Build and run

Requires a C++17 compiler, GNU Make and Python 3 (standard library only).

```sh
make -C research test
cd research
python3 tournament.py --openings openings/pilot.json --output runs/my-pilot \
  --search-ms 100 --hard-timeout-ms 250 --max-turns 40 --workers 2
```

The output directory must be new. Each completed game is appended immediately
to `games.jsonl`, with the initial position, first player, engines, outcome
and each complete turn's action, resulting state and diagnostics.
`protocol.json` captures all openings and settings; `summary.json` aggregates
outcomes. The pilot opening file is for development only, not held-out testing.

To request a single candidate move or Quux move:

```sh
printf 'Alpha (0, r1b2) g3-\nBeta (1, r2b3) -g3\n' |
  build/hwbot choose 0 100 8
printf 'Alpha (0, r1b2) g3-\nBeta (1, r2b3) -g3\n' |
  build/hwbot quux 0
```

`choose PLAYER TIME_MS DEPTH [WEIGHTS_CSV]` accepts ten adjustable weights.
Additional CLI commands: `features PLAYER`, `key PLAYER`, and
`apply PLAYER "complete move"`. Output is JSON.

## Candidate v0 algorithm

- Position: turn-boundary board, two fleets per star system, the common bank
  inferred from conservation, player to move. Canonical keys ignore cosmetic
  system names, sort neutral systems, and include side to move.
- Generate complete turns (including multi-action sacrifices and optional
  catastrophes), using the pinned upstream generator with its strategic
  pruning flag disabled. Equivalent positions are still deduplicated by
  upstream. Its native legality model excludes mutually destructive moves and
  certain suicide cases, so independent Rules13 replay of experiment games
  remains necessary before claiming final rule coverage.
- Negamax with alpha-beta bounds; iterative deepening up to a configurable
  depth. Order successors by the candidate's static score and preferred
  successor of an earlier search. Store exact/lower/upper transposition
  bounds with depth and successor key. Stop early for a terminal win.
- A soft wall-clock search deadline is checked at node visits and while
  collecting successors. It is cooperative (not a strict time guarantee).
  The last fully completed depth is retained, or a legal best-so-far root
  candidate if depth one could not finish. An outer process timeout catches
  software failures separately. A node cap is available in the C++ API
  for deterministic test cases.
- Terminal wins/losses have fixed scores +1,000,000/-1,000,000; simultaneous
  loss is zero. Otherwise the score is a dot product of ten feature
  differences, so evaluation is antisymmetric. Nonterminal scores are
  bounded below terminal magnitudes.

| Feature | Description | v0 weight |
|---|---|---:|
| ships | Total own fleet count | 10 |
| fleet_pips | Sum of own ship sizes (1–3) | 5 |
| home_defenders | Ships at own home | 12 |
| home_max_size | Largest own home ship | 8 |
| home_invasion | Negative pips of hostile ships at own home | 18 |
| local_color_access | Count of accessible colors at occupied systems | 2 |
| mobility | Reachable existing systems and available discovery sizes with yellow power | 1 |
| catastrophe_safety | Negative exposed ships/star/home defense at 3 or >=4 same-color pieces | 14 |
| enemy_home_pressure | Ships at or able to travel toward the enemy home | 4 |
| build_access | Distinct buildable colors at systems with green power and supply | 3 |

These are deliberately hand-selected baseline weights, not learned or
claimed optimal. The training system will vary only the numeric weights.

## Experiment policy

Use paired starting positions (same opening, reversed first player); record
engine assignment, actual elapsed time, search depths, generated successors,
nodes, cutoffs, and cache hits. Threefold repetition (same canonical position
and side to move), turn-limit stops, timeouts, and engine failures are separate
from natural wins/losses/draws. No failure is awarded to the opposing bot.
Time-limited searches can vary across runs even with identical inputs.

## Next research milestones

1. Validate game replays against the independent TypeScript rules engine and
   improve time-budget behavior in high-branching positions.
2. Generate disjoint seeded training, validation, and final-test opening sets.
3. Python evolutionary training: population, paired games, elite selection,
   crossover, mutation, hall of fame, fixed validation and per-generation logs.
4. Freeze a champion before testing, then measure against baseline and Quux on
   held-out paired openings. Repeat training across seeds.
5. Human vs. champion and report analysis.

See [research progress log](PROGRESS.md) for actual measured results.
