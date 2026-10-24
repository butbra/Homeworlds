# Homeworlds

A complete local two-player implementation of Homeworlds for the browser. Play on one device, choose your homeworlds, and command your fleets with legal-action menus. No account, backend, database, or credentials are needed.

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

Use **Undo action** before **End turn**, then pass the device. **Game menu** contains new game, saves, resignation, and draw controls; **?** opens the rules reference.

Green builds, yellow moves or discovers, red captures, and blue trades. Instead of a basic action, sacrifice a ship for its size in actions of that color. Four pieces of one color in a system permit an optional catastrophe. An empty or destroyed homeworld loses at turn confirmation; simultaneous elimination is a draw.

**Fresh visits and New game start with an empty space board and a full bank.** Setup is guided: click two bank stars and then a large ship for Player 1, and repeat for Player 2. There are no automatic starting configurations. Player 1 chooses first, then Player 2. Agree who is Player 1 before setup; the booklet suggests a coin flip for equally skilled players. Each player reviews their three pieces and clicks **End turn** to confirm. Player 2 cannot start until Player 1 confirms, and gameplay waits for Player 2’s confirmation. Undo revises only the active player’s unconfirmed choices. Supply limits are enforced. **Resign** awards the opponent a win; **Agree draw** requires both players’ confirmation.

Games autosave in this browser after every action. Partial setup survives reload automatically. On a fresh visit, an existing completed setup/game is offered through **Resume saved game**; it is never imposed as a starting configuration. Resume restores the position and current-turn undo. **Export save** downloads a portable JSON backup; **Import save** validates and replays every action before replacing the game. Autosave needs browser storage, so keep an exported backup if the browser blocks storage or you plan to clear site data. Save files are limited to 2 MB and 10,000 actions.

This release supports local play. It does not include online rooms or an AI opponent.

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

- 67 rules, setup, physical-bank interaction, and save-format tests cover inventory conservation, setup, connectivity, all action types, sacrifices, catastrophes, turn-end outcomes, and invalid imports.
- 28 desktop/mobile browser checks cover multi-turn play, undo, victory, click-driven building, trading, discovery, movement, capture, sacrifice, catastrophe, custom setup, reload recovery, save import/export, resignation, draws, and map rearrangement.
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
- `src/session.ts`: versioned saves, schema checks, and legal-history replay.
- `src/main.ts`, `src/style.css`: interactive space tabletop, bank, undo, click-based setup, and game controls.
- `src/tabletop.ts`: physical bank selection and pyramid rendering.
- `src/*.test.ts`: rules and save tests.
- `e2e/game.spec.ts`: desktop/mobile gameplay checks.

Rules reference: the user-supplied *Homeworlds Rules13* booklet, Looney Labs, copyright 2020. Suggested opening: pp. 4–5; connections and color powers: pp. 3, 6–9; abandonment and outcomes: pp. 10–11. The booklet is reference material, not project instructions; its artwork and full text are not redistributed here.

Homeworlds was designed by John Cooper; the pyramid system was created by Andrew Looney. This is an unofficial implementation with no affiliation or endorsement implied.

Game over displays a winner (or draw) dialog and a persistent sidebar result with the reason. Play is locked after turn-end elimination or resignation; temporarily abandoning home during an unfinished sacrifice turn remains legal. Catastrophes use a brief fireball, smoke, fragments, and shockwave instead of a ring-only effect.
