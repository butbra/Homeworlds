# Quux Bot 1 versus Quux Bot 2: 100 measured games

All **100 scheduled games were executed**: **43** finished naturally under the rules, **56** stopped by repetition adjudication, and **1** other unfinished/error games. Adjudications and software failures receive no winner.

| Bot | Games started | Wins | Wins going first | Wins going second |
|---|---:|---:|---:|---:|
| Bot 1 | 50 | 23 | 11 | 12 |
| Bot 2 | 50 | 20 | 7 | 13 |
| Total | 100 | 43 | 18 | 25 |

**First player:** 18 wins (41.86% of decisive games). **Second player:** 25 wins (58.14%). Natural simultaneous-elimination draws: **0**.

## Game lengths

A turn means one bot’s complete turn, including any sacrifice actions and free catastrophes. Two turns are approximately one round.

| Cohort | Games | Average turns | Median | Shortest | Longest |
|---|---:|---:|---:|---:|---:|
| Naturally completed games | 43 | 67.21 | 54 | 21 | 196 |
| All scheduled games, through their recorded stopping point | 100 | 61.25 | 53.5 | 20 | 196 |

## Additional measured statistics

- Validated turns: 6,125; native pass turns: 73.
- Catastrophes: 225 across 80 games.
- Mean computation time per successful full-turn decision: 0.454967 s wall, 0.446773 s CPU. Longest decision: 42.765193 s wall.
- Total search-process CPU: 2795.256 s. Tournament wall time: 911.779 s with four parallel games. Animation delays are excluded.
- Timeouts: 1; illegal turns: 0; failed searches: 1.
- Independent website rules replay: 6,125 turns across 100 games; terminal winners agreed.

## Unfinished or invalid games

| Game | Validated turns | Status | Reason |
|---|---:|---|---|
| 57 | 105 | unfinished | timeout:Bot 2 |

These games earn no winner. No completed search result was replaced by a partial candidate.

## Paired opening results

| Outcome across both games of a setup pair | Pairs |
|---|---:|
| second player wins both | 5 |
| pair contains a draw, adjudication or unfinished game | 37 |
| first player wins both | 3 |
| one first-player win and one second-player win | 5 |

## Method and limits

Unmodified native get_ai_move, full search. Fresh process per complete turn, matching website worker lifetime. Identical search and 60-second safety ceiling for both copies; no partial answer accepted. Native CLI setup algorithm generates 50 distinct paired opening positions; setup selection order alternates by pair. Bot 1 always North/player 0; Bot 2 always South/player 1. Every pair reverses who moves first. One player turn counts as one turn, including any sacrifice actions and free catastrophes.

Exactly 100 fixed scheduled games; no outcome-based replacement or filtering. Natural rulebook wins and simultaneous-elimination draws only. Repetition adjudications, turn-limit stops, timeouts, illegal moves and software errors are separate and earn no win.

Threefold repetition uses the same full board and player to move, ignoring cosmetic system names. It is a tournament stopping policy, not a rulebook draw. A 400-turn cap would be reported as unfinished. Search processes have no shortened iteration/depth or artificial animation waits; a 60-second safety timeout would leave the game unfinished, never award an opponent win.

These are two copies of the same deterministic engine, not different-strength bots. Identity totals can reflect opening seats; the paired first/second-player comparison is the useful measurement here. The 50 distinct native-generated opening pairs are a sample, not all possible setups. The 100 games share 50 paired starting positions and should not be treated as 100 independent random setups.

The native referee uses the original C++ legal-action primitives with a Rules13 whole-turn layer. Every accepted turn is independently replayed by the website’s TypeScript rules. Any terminal empty-homeworld cleanup differences are normalized only after both implementations agree on the winner; pieces, ownership and inventories are otherwise checked throughout.

See `summary.csv` for all 100 outcomes, `statistics.json` for numerical results, `protocol.json` for the exact schedule/openings, and `game-NNN.jsonl` / `game-NNN.txt` for full transcripts. Pilot games are excluded from these results.

## Downloads

- [Per-game CSV summary](summary.csv)
- [Full transcripts, per-turn CSV, native binaries and reproducible source](Quux-vs-Quux-100-games.zip)
- [Numerical statistics](statistics.json)
- [Exact schedule and openings](protocol.json)
- [Independent replay verification](verification.json)

The per-game JSONL/TXT transcripts and `turns.csv` are inside the ZIP archive.
