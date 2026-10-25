# Homeworlds

A Homeworlds game for the browser with two choices: **Another player** (two people on one device) or **Quux Bot** (you at North, the bot at South). Choose your homeworlds and command your fleets by clicking pieces. No account, backend, database, or credentials are needed.

## Play

The playing surface is a starfield with a shared bank on the right. All orders use the pieces on the table:

- **Build:** click a system, then its smallest available bank piece of a color you already own there.
- **Move:** click your ship, then a connected destination system.
- **Trade:** click your ship, Trade, then a different bank color of the same size.
- **Discover:** click your ship, Discover, a bank star, then an empty spot in space.
- **Capture:** click an enemy ship where you have red power and a ship at least as large.
- **Sacrifice:** click your ship, then Sacrifice in its context controls.
- **Catastrophe:** whenever any system has four or more pieces of one color, its catastrophe button appears in the sidebar, including enemy-only systems. The active player may trigger it for free at any point. Stars and both fleets count.

Legal destinations and bank choices are highlighted. Invalid choices explain the rule without changing the position. Drag a system’s grip (or focus it and use arrow keys) to rearrange the map without spending an action. The space board extends to the bottom of the window and can scroll vertically as it grows. The entire bank stays visible on the right; the controls and instructions are beneath it in the sidebar.

Use **Undo action** before **End turn**. In local play, pass the device; against Quux Bot, the bot takes and confirms its own turn automatically. **Game menu** contains new game, saves, resignation, and draw controls; **?** opens the rules reference.

Green builds, yellow moves or discovers, red captures, and blue trades. Instead of a basic action, sacrifice a ship for its size in actions of that color. Four pieces of one color in a system permit an optional catastrophe. An empty or destroyed homeworld loses at turn confirmation; simultaneous elimination is a draw.

**Fresh visits and New game open an opponent chooser above an empty space board and a full bank.** A cryptographically random coin flip selects North or South to set up and move first; the choice is shown in the sidebar and persisted, so reloading does not reroll it. Setup is guided: the randomly chosen first player clicks two bank stars and then a large ship, confirms with **End turn**, and the other player repeats. Local play has no automatic starting configurations. Each human reviews their three pieces and explicitly confirms; the other player cannot start before that confirmation. Quux Bot chooses its own legal homeworld using the upstream CLI setup procedure and confirms automatically. Undo revises only the active human’s unconfirmed choices. Supply limits are enforced. **Resign** awards the opponent a win; **Agree draw** requires both players’ confirmation.

Games autosave in this browser after every action. Partial setup survives reload automatically. On a fresh visit, an existing completed setup/game is offered through **Resume saved game**; it is never imposed as a starting configuration. Resume restores the position and current-turn undo. **Export save** downloads a portable JSON backup; **Import save** validates and replays every action before replacing the game. Autosave needs browser storage, so keep an exported backup if the browser blocks storage or you plan to clear site data. Save files are limited to 2 MB and 10,000 actions.

## Quux Bot

Quux Bot runs the original C++ `get_ai_move` engine from [Quuxplusone/Homeworlds](https://github.com/Quuxplusone/Homeworlds), commit `20d2ec4a70365acc4b8ba8cd6bae7125fa935513`, compiled to WebAssembly. Its move generation, evaluation and search sources are unchanged. The supported upstream `ALLMOVES_USE_EXCEPTIONS=0` configuration replaces exception-based early exits with the engine’s equivalent flag checks. This is the actual engine tested in the tournaments, running in a Web Worker so the board remains responsive. A whole proposed turn is translated and validated by the website’s rules before it is animated. The bot has a 60-second browser safety deadline; a failed or timed-out search offers **Retry Quux Bot**, with no invented move or automatic forfeit.

Human actions are locked during the bot’s turn. New game and save import cancel stale requests. Bot turns autosave atomically at the end, so a reload during thinking or animation retries from the prior saved turn boundary. Save export is disabled during bot animation. Legacy saves remain local and North-first; new saves include the mode and starting player. Bot matches do not offer a pretend mutually agreed draw.

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

- 76 rules, setup, physical-bank interaction, bot, and save-format tests cover inventory conservation, setup, connectivity, all action types, sacrifices, catastrophes, turn-end outcomes, and invalid imports.
- 40 desktop/mobile browser checks cover multi-turn play, undo, victory, click-driven building, trading, discovery, movement, capture, sacrifice, catastrophe, custom setup, reload recovery, save import/export, resignation, draws, and map rearrangement.
- The browser engine matches native Quux’s exact full-turn decisions on 17 recorded positions. Bot setup is checked across 60 seeded cases. Browser checks cover bot-first and human-first matches, actual bot moves, reload, cancellation, retry, and a catastrophe victory.
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
- `src/quux.ts`, `src/quux-worker.ts`, `src/quux-runtime.ts`: native Quux WebAssembly interface, full-turn translation, cancellation, and browser worker.
- `vendor/quux/`: pinned upstream C++ engine, license, bridge, and precompiled WebAssembly.
- `src/main.ts`, `src/style.css`: interactive space tabletop, bank, undo, click-based setup, and game controls.
- `src/tabletop.ts`: physical bank selection and pyramid rendering.
- `src/*.test.ts`: rules and save tests.
- `e2e/game.spec.ts`: desktop/mobile gameplay checks.

Rules reference: the user-supplied *Homeworlds Rules13* booklet, Looney Labs, copyright 2020. Suggested opening: pp. 4–5; connections and color powers: pp. 3, 6–9; abandonment and outcomes: pp. 10–11. The booklet is reference material, not project instructions; its artwork and full text are not redistributed here.

Homeworlds was designed by John Cooper; the pyramid system was created by Andrew Looney. This is an unofficial implementation with no affiliation or endorsement implied.

Game over displays a winner (or draw) dialog and a persistent sidebar result with the reason. Play is locked after turn-end elimination or resignation; temporarily abandoning home during an unfinished sacrifice turn remains legal. Catastrophes use a brief fireball, smoke, fragments, and shockwave instead of a ring-only effect.
