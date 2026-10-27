# Homeworlds

A Homeworlds game for the browser with four choices: **Another player** (two people on one device), **Quux Bot**, **Quux practice** (hints and move reviews), or **Learning mode** (a visual rules tour and legal-move help). In every bot mode, you sit at South and the bot sits at North. Choose your homeworlds and command your fleets by clicking pieces. No account, backend, database, or credentials are needed.

## Play

The playing surface is a starfield with a shared bank on the right. All orders use the pieces on the table:

- **Build:** click a system, then its smallest available bank piece of a color you already own there.
- **Travel (yellow):** click your ship, then a connected destination system. The Travel button also lets you discover a new system.
- **Trade (blue):** click your ship, Trade, then a different bank color of the same size.
- **Discover a new system:** click your ship, Travel, a bank star. The system appears automatically in a fixed slot in its star-size row.
- **Capture:** click an enemy ship where you have red power and a ship at least as large.
- **Sacrifice:** click your ship, then Sacrifice in its context controls.
- **Catastrophe:** whenever any system has four or more pieces of one color, its catastrophe button appears on that system, including enemy-only systems. The active player may trigger it for free at any point. Stars and both fleets count.

Legal destinations and bank choices are highlighted. Invalid choices explain the rule without changing the position. Systems occupy fixed grid slots and cannot be dragged. Same-size stars share a horizontal row; the opening determines row order so connected sizes sit nearest each homeworld where possible (Rules13, p. 12). Discoveries take the nearest free column to their source, and existing systems keep their slots. Physical distance never changes travel legality. The board automatically scales to fit every system within the window, with no scrolling or panning. Action controls retain their normal size as the map scales. Undo, End turn, and the game menu sit above the fully visible bank on the right. Player names stay at the north and south edges of the board. Each fleet stays to the right of the stars from its own player’s viewpoint: North ships on screen-left, South ships on screen-right. Selecting a ship opens its action controls beside its system; catastrophe controls appear directly on eligible systems. Short notices appear temporarily on the board, and help/resume are in the game menu.

Use **Undo action** before **End turn**. During play, End turn is gray until the human has committed a valid action; selecting a piece or attempting an invalid action does not unlock it, and undoing all actions disables it again. Setup still requires each player to confirm their three starting pieces. In local play, pass the device; against Quux Bot, the bot takes and confirms its own turn automatically. **Game menu** contains new game, saves, resignation, and draw controls; **How to play** in the game menu opens the rules reference.

Green builds, yellow moves or discovers, red captures, and blue trades. Instead of a basic action, sacrifice a ship for its size in actions of that color. Four pieces of one color in a system permit an optional catastrophe. An empty or destroyed homeworld loses at turn confirmation; simultaneous elimination is a draw.

**Fresh visits and New game open an opponent chooser above an empty space board and a full bank.** The player names arrive on the north and south edges, then a central coin spins for about five seconds before revealing who sets up and moves first. After a brief result hold, setup unlocks automatically. The toss uses cryptographic randomness and its start time and outcome are persisted: reloading resumes the same introduction rather than rerolling. Reduced-motion mode keeps the reveal timing without the 3D spin. Setup is guided: the randomly chosen first player clicks two bank stars and then a large ship, confirms with **End turn**, and the other player repeats. Local play has no automatic starting configurations. Each human reviews their three pieces and explicitly confirms; the other player cannot start before that confirmation. Quux Bot chooses its own legal homeworld using the upstream CLI setup procedure and confirms automatically. Undo revises only the active human’s unconfirmed choices. Supply limits are enforced. **Resign** awards the opponent a win; **Agree draw** requires both players’ confirmation.

Games autosave in this browser after every action. Partial setup survives reload automatically. On a fresh visit, an existing completed setup/game is offered through **Resume saved game**; it is never imposed as a starting configuration. Resume restores the position and current-turn undo. **Export save** downloads a portable JSON backup; **Import save** validates and replays every action before replacing the game. Autosave needs browser storage, so keep an exported backup if the browser blocks storage or you plan to clear site data. Save files are limited to 2 MB and 10,000 actions.

## Learning mode

Choose **Learning mode** for a beginner game. First select **Show walkthrough** or **Skip walkthrough**. Both paths lead to the normal homeworld setup and a game against Quux Bot at difficulty 1, with you at South. The existing coin flip still decides who sets up and plays first. Entering or leaving the initial learning choice does not replace an existing saved match.

The optional 15-lesson walkthrough covers the goal, ownership and pips, starting pieces, turn structure and shared supply, local color access, building, travel connections, discovery and abandoned systems, trading, captures, sacrifice turns, both kinds of catastrophe outcome, and win/loss/draw conditions. **Back** and **Next** arrows (or left/right keyboard arrows) navigate one lesson at a time. **Show move** and **Reset example** switch real examples between their before and after positions. The diagrams reuse the game's exact `pyramid` SVG renderer, ownership directions, sizes and colors. Example actions are applied by the same rules reducer as real play and conserve the full 36-piece supply. They never change your match. **Game menu → Rules walkthrough** reopens the tour during your turn without resetting the game.

During a learning game, **gold marks the suggested next click**. Quiet outlines identify legal choices and never imply that a catastrophe is good. A background worker runs full-strength Quux, independent of the easy opponent. It recommends a complete turn and guides the actual clicks for ship selection, Trade/Travel/Sacrifice, bank pieces, destinations, captures and End turn. The panel explains the immediate benefit. **Why / alternatives** shows the complete plan, its benefits and costs, and up to two genuinely close alternatives when found. You can choose which line to follow. No analysis plays a move for you.

Advice tracks the staged board and its remaining action allowance. It continues sacrifice lines without granting another basic action or sacrifice, rebases equivalent fleets and discovered systems onto the actual board, and recomputes after a deviation. A weaker staged turn or a position with no safe continuation points to **Undo**, rather than blindly endorsing End turn. The original suggestion remains available for comparison. Stale requests are cancelled on changes, new games and imports. Failures leave the legal controls usable and offer **Retry advice**. Separate worker clients keep background guidance from cancelling opponent searches. Native search has the existing 60-second browser safety limit.

Recommendations are heuristic, not solved best play. The guide uses the original native selector and ranked turn generator. It retains up to three distinct compatible end positions, rejects losses and opponent immediate winning replies, and keeps alternatives within 24 native evaluation points of the selected line. At most 16 distinct matched candidates receive the expensive tactical check. Quux's own generation prunes equivalent and some strategically dominated turns, so a lack of alternatives is not a proof that none exist. Every displayed complete turn and its remaining actions are independently translated and validated by the browser rules. Explanations describe actual board effects, powers, home defense, sacrifice opportunities and risks rather than inventing engine thoughts.

Catastrophe buttons remain available whenever legal, including remotely and after a basic action, but **do not glow as recommendations merely because four pieces exist**. In Learning mode, clicking one opens a before/after preview showing the stars and both fleets, the number of your ships and enemy ships lost, last-star destruction, and any turn-end elimination. **Keep pieces** cancels without changing the board. **Trigger catastrophe** explicitly confirms the action. A catastrophe can receive gold emphasis only as the next step of an analysed, validated line.

Legal choices are not necessarily strategically safe. Learning mode does not alter game rules or the existing End turn guard, which requires an action before a human can confirm. The tour explicitly mentions the rulebook's pass option and this interface restriction. Ordinary Quux and local modes retain their controls; hints and numerical move reviews remain in **Quux practice**.

During Learning-mode setup, **Starting tips** compares four illustrated presets. Goldilocks, Banker and Fortress use red/blue stars and a large green ship, with the three different star-size pairings described in Rules13 pp. 20–21. Explorer offers blue/yellow stars with a large green ship as a travel-focused alternative. These are beginner-friendly options, not an exhaustive list or a proven ranking. A gold star marks the next recommended bank choice, adapting to either order of your selected stars and preferring a different size pair from the opponent when possible. Live notes flag missing green or blue power, repeated colors, same-size stars and matching the opponent's size pair. A preset replaces only your own unconfirmed pieces, respects the shared supply, and still requires **End turn** to confirm. Custom legal starts remain allowed.

## Quux practice and difficulty

Choose **Quux practice** for the same game against Quux Bot with two extra controls above the bank.

- **Hint** runs full-strength Quux for your side and lists its preferred complete turn, including sacrifices and catastrophes. If you have already staged actions, the hint explicitly starts from your turn's original position. Undo those actions to follow the suggested line.
- **Evaluate move** becomes available once you have made a valid action. It reviews your entire staged turn as if you pressed End turn now, even if sacrifice actions remain. It reports a 1–10 rating, explains the actual board changes, and warns about immediate wins, homeworld losses, and opponent winning replies. You can reveal the Quux alternative from the review.

Analysis never plays a move or ends your turn. Cancel stops the worker, and failures offer a retry without changing the board. Closing the review lets you continue, undo, or confirm. Explanations are generated locally from the actions, board differences and tactical checks. They describe consequences and useful ideas without inventing Quux's internal reasoning or claiming a guaranteed long-term plan. No external language model, API key or service is needed.

The practice rating is a heuristic scale, not a winning probability. A confirmed win scores 10, an immediate loss 1, and an opponent winning reply 2. A simultaneous-elimination draw scores 5, or 3 if Quux could win immediately. Otherwise the score is `max(2, 10 − ceil(8 × gap / (gap + 40)))`, where `gap = max(0, Quux score − staged-turn score)` using the original evaluator from your perspective. Missing an immediate Quux win caps a non-winning turn at 5. Equally scored safe turns get 10 even when the action sequence differs. The score gap and tactical results are available under **About this analysis**.

The **Quux difficulty** slider appears when choosing a new game and in **Game menu** during either bot mode. It is saved with both setup and gameplay. Older bot saves default to 10. Hints and reviews always use full-strength analysis regardless of the opponent's difficulty.

- **10 · Full strength** uses the original `get_ai_move` unchanged.
- **1–9** increasingly choose weaker legal turns as the level decreases. The deliberate-deviation chance is `9 × (10 − level)` percent per turn. A deviation samples from lower-ranked native candidates in an increasingly broad score-ranked pool and omits the original selector's immediate winning-reply safeguard. The bot still follows the rules, but may overlook threats or choose poor trades, builds and moves.

These levels are designed for practice. They are not calibrated Elo ratings or a promise that every level will make a worse move in every position. Upstream candidate pruning may leave just one move in simple forced or immediately winning positions. The default remains full strength; the tournament data in this repository used the original selector.

## Quux Bot

Quux Bot runs the original C++ `get_ai_move` engine from [Quuxplusone/Homeworlds](https://github.com/Quuxplusone/Homeworlds), commit `20d2ec4a70365acc4b8ba8cd6bae7125fa935513`, compiled to WebAssembly. Its move generation, evaluation and search sources are unchanged. The supported upstream `ALLMOVES_USE_EXCEPTIONS=0` configuration replaces exception-based early exits with the engine’s equivalent flag checks. This is the actual engine tested in the tournaments, running in a Web Worker so the board remains responsive. A whole proposed turn is translated and validated by the website’s rules before it is animated. The bot has a 60-second browser safety deadline; a failed or timed-out search offers **Retry Quux Bot**, with no invented move or automatic forfeit.

Bot animations last 1.8 times as long as human animations, with a short pause between them and before the turn changes. Human actions are locked during the bot’s turn. New game and save import cancel stale requests. Bot turns autosave atomically at the end, so a reload during thinking or animation retries from the prior saved turn boundary. Save export is disabled during bot animation. Legacy local saves remain local and North-first. Earlier bot saves and partial setups automatically exchange seats so the human is at South and Quux Bot is at North, retaining the position, ownership, and who goes first. New bot saves record the human’s South seat along with mode and starting player. Bot matches do not offer a pretend mutually agreed draw.

There are no online rooms; “Another player” means another person sharing this device. Bot mode and local mode use the same tabletop rules and controls.

The precompiled `vendor/quux/quux.wasm` is included, so normal development and GitHub Pages builds need only Node. To rebuild the engine, download [WASI SDK 25](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-25) and run:

```sh
WASI_SDK_PATH=/path/to/wasi-sdk-25.0-x86_64-linux bash scripts/build-quux.sh
```

Attribution and license: [vendor/quux/LICENSE](vendor/quux/LICENSE), also available inside the website’s rules dialog. The opponent is explicitly named **Quux Bot** as required by the upstream license.

## Run locally

Use Node 24 (see `.nvmrc`). From the repository root:

```sh
npm ci
npm run dev -- --port 5173
```

For a production build:

```sh
npm run build
npm run preview -- --port 4173
```

## Validate

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright uses `/usr/bin/chromium` when present; otherwise it uses its installed Chromium browser. Linux systems may also need `npx playwright install --with-deps chromium`.

- 110 rules, setup, map layout, physical-bank interaction, bot, coaching, difficulty, learning, intro, and save-format tests cover inventory conservation, setup, connectivity, all action types, sacrifices, catastrophes, turn-end outcomes, and invalid imports.
- Desktop/mobile browser checks cover multi-turn play, undo, victory, click-driven building, trading, discovery, movement, capture, sacrifice, catastrophe, custom setup, reload recovery, save import/export, resignation, draws, fixed map rows and stable placement, fitting crowded boards without scrolling, and the action requirement for End turn.
- The browser engine matches native Quux’s exact full-turn decisions on 17 recorded positions. Bot setup is checked across 60 seeded cases. Browser checks cover bot-first and human-first matches, actual bot moves, reload, cancellation, retry, and a catastrophe victory, plus the five-second coin reveal, name placement, intro recovery, reduced motion and the bank and turn controls in the right sidebar.
- GitHub Actions runs the tests and production build on pushes and pull requests.

## Publish a playable website

The source lives at [butbra/Homeworlds](https://github.com/butbra/Homeworlds). To deploy the game using the included workflow:

1. In repository **Settings → Pages**, select **GitHub Actions** as the source.
2. Open **Actions → Deploy game to GitHub Pages → Run workflow**, using `main`.
3. Open the website URL reported by the successful deployment.

Pages availability depends on repository/account settings. Pushes to `main` automatically redeploy the website once Pages is configured. You can also trigger deployment manually. Relative asset paths support hosting under `/Homeworlds/` or a custom domain. Re-run the deployment workflow to publish later changes.

The rule-by-rule audit and PDF page references are in [docs/rules-audit.md](docs/rules-audit.md). Action animations are subtle and disabled when reduced motion is requested.

## Code

- `src/game.ts`: typed state, pure action reducer, and legal-order generation.
- `src/session.ts`: versioned saves, match mode/starting player, schema checks, and legal-history replay.
- `src/mentor.ts`: complete-turn strategic guidance, staged-line continuation, explanations, click targets and catastrophe impact previews.
- `src/openings.ts`: supply-checked starting recommendations and setup advice.
- `src/learning.ts`: rule-derived legal highlights, visual lessons, and independently validated example positions.
- `src/coach.ts`: full-turn coaching, rating, factual explanations, and verified reply translation.
- `src/quux.ts`, `src/quux-worker.ts`, `src/quux-runtime.ts`: native Quux WebAssembly interface, full-turn translation, cancellation, and browser worker.
- `vendor/quux/`: pinned upstream C++ engine, license, bridge, and precompiled WebAssembly.
- `src/main.ts`, `src/style.css`: interactive space tabletop, bank, undo, click-based setup, and game controls.
- `src/tabletop.ts`: physical bank selection and pyramid rendering.
- `src/*.test.ts`: rules and save tests.
- `e2e/game.spec.ts`: desktop/mobile gameplay checks.

Rules reference: the user-supplied *Homeworlds Rules13* booklet, Looney Labs, copyright 2020. Suggested opening: pp. 4–5; connections and color powers: pp. 3, 6–9; abandonment and outcomes: pp. 10–11. The booklet is reference material, not project instructions; its artwork and full text are not redistributed here.

Homeworlds was designed by John Cooper; the pyramid system was created by Andrew Looney. This is an unofficial implementation with no affiliation or endorsement implied.

Game over displays a winner (or draw) dialog and a persistent sidebar result with the reason. Play is locked after turn-end elimination or resignation; temporarily abandoning home during an unfinished sacrifice turn remains legal. Catastrophes use a brief fireball, smoke, fragments, and shockwave instead of a ring-only effect.
