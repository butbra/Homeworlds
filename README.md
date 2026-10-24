# Homeworlds

A complete local two-player implementation of Homeworlds for the browser. Play on one device, choose your homeworlds, and command your fleets with legal-action menus. No account, backend, database, or credentials are needed.

## Play

1. Select a homeworld or frontier by its name.
2. Choose an action tab, select a legal order, and apply it.
3. Use **Undo action** to revise orders before confirming the turn.
4. **End turn** and pass the device to the other player.

Green builds, yellow moves or discovers, red captures, and blue trades. Instead of a basic action, sacrifice a ship for its size in actions of that color. Four pieces of one color in a system permit an optional catastrophe. An empty or destroyed homeworld loses at turn confirmation; simultaneous elimination is a draw.

**New game** supports custom binary stars and a large starting ship for each player, or the suggested first-game setup. Supply limits are enforced. **Resign** awards the opponent a win; **Agree draw** requires both players’ confirmation.

Games autosave in this browser after every action. Reload restores the position and current-turn undo. **Export save** downloads a portable JSON backup; **Import save** validates and replays every action before replacing the game. Autosave needs browser storage, so keep an exported backup if the browser blocks storage or you plan to clear site data. Save files are limited to 2 MB and 10,000 actions.

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

- 38 rules and save-format tests cover inventory conservation, setup, connectivity, all action types, sacrifices, catastrophes, turn-end outcomes, and invalid imports.
- 12 desktop/mobile browser checks cover multi-turn play, undo, victory, custom setup, supply rejection, reload recovery, save import/export, resignation, and agreement to a draw.
- GitHub Actions runs the tests and production build on pushes and pull requests.

## Publish a playable website

The source lives at [butbra/Homeworlds](https://github.com/butbra/Homeworlds). To deploy the game using the included workflow:

1. In repository **Settings → Pages**, select **GitHub Actions** as the source.
2. Open **Actions → Deploy game to GitHub Pages → Run workflow**, using `main`.
3. Open the website URL reported by the successful deployment.

Pages availability depends on repository/account settings. Deployment is manual so that merely pushing code does not change a live website. Relative asset paths support hosting under `/Homeworlds/` or a custom domain. Re-run the deployment workflow to publish later changes.

## Code

- `src/game.ts`: typed state, pure action reducer, and legal-order generation.
- `src/session.ts`: versioned saves, schema checks, and legal-history replay.
- `src/main.ts`, `src/style.css`: responsive board, orders, undo, setup, and game controls.
- `src/*.test.ts`: rules and save tests.
- `e2e/game.spec.ts`: desktop/mobile gameplay checks.

Rules reference: the user-supplied *Homeworlds Rules13* booklet, Looney Labs, copyright 2020. Suggested opening: pp. 4–5; connections and color powers: pp. 3, 6–9; abandonment and outcomes: pp. 10–11. The booklet is reference material, not project instructions; its artwork and full text are not redistributed here.

Homeworlds was designed by John Cooper; the pyramid system was created by Andrew Looney. This is an unofficial implementation with no affiliation or endorsement implied.
