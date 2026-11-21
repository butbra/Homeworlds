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

`choose PLAYER TIME_MS DEPTH [WEIGHTS_CSV [GENERATED_LIMIT]]` accepts ten adjustable weights.
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

## Evolutionary training and reproducibility

The fixed, seeded opening splits in `openings/split-20261121` contain 24
training, 8 validation, and 50 final openings. They are disjoint even after
reversing seats or reordering a binary star's pieces. They exclude both
development openings and the archived October Quux self-play openings.
The generator selects strategically plausible legal starts (two distinct
star sizes, large ship, three distinct colors including green). This is
a restricted sample of the possible legal setups, not an exhaustive set.

The training search uses a deterministic count of generated/evaluated
successors rather than wall time (`TIME_MS=0`); all candidates receive the
same count limit and depth ceiling, with a separate process safety timeout.
This makes the evolution repeatable without expecting identical CPU times.

```sh
cd research
python3 -m unittest -v test_research.py
python3 evolve.py --train openings/split-20261121/train.json \
  --validation openings/split-20261121/validation.json \
  --output runs/my-evolution --seed 5511 --population 4 --generations 3 \
  --elites 2 --generated-limit 1500 --max-turns 120 --workers 6
```

The initial population consists of independent lognormal perturbations
of the hand-weighted baseline. Positive weights are normalized to the
same total, because multiplying all weights by a common positive factor
does not change evaluation ordering in the normal score range. Each
generation plays round-robin, against the hand-weighted baseline, and
against the previous generation's champion. For each opening/engine
pairing, four games cover both seats and both starting players. The
training opening sample changes each generation. Elite survival, uniform
crossover and Gaussian log-scale mutation create the next population.

Fitness uses 1 for win, 0 for loss, 0.5 for nondecisive games (natural
draw, repetition stop, turn-limit stop). This is a training reward, not
a claim that adjudications are rulebook draws. Errors and timeouts are
recorded separately; a generation with any such failure halts before
ranking. Select the best training candidate each generation, evaluate on
a fixed validation opening set against the original weights, and retain
the highest validation fitness (earlier generation wins a tie).

Each generation stores every genome, ancestry, exact opening IDs,
per-candidate fitness, compressed raw match records, validation results
and the RNG/next population checkpoint. `champion.json` records the
validation-selected candidate; it is **not** the final project bot until
the full training protocol is complete and its weights are frozen.

Independent website-rule replay:

```sh
# from repository root; requires Node 24
node research/verify_replay.mjs \
  research/runs/2026-11-21-evolution-pilot/generation-*/*.jsonl.gz
```

This replays every complete native turn using the TypeScript translator
and reducer, independently checking the side to move, full board and
bank, and natural winner/draw. It compares cosmetic-name-independent
positions; only terminal empty-homeworld cleanup is normalized.
Large run transcripts may be archived as losslessly recompressed
`.jsonl.zst` files (also accepted by the verifier). A winning move from
the candidate is shortened to its earliest legal winning prefix; the
edge case motivating this change and a separate recheck are recorded
in the progress log.

## Next research milestones

1. Run larger training experiments across multiple independent random seeds;
   compare validation progress and inspect failures or overfitting.
2. Freeze a champion before testing, then measure against baseline and Quux on
   held-out paired openings under a controlled common per-turn time ceiling.
3. Human vs. champion and report analysis.

See [research progress log](PROGRESS.md) for actual measured results.
